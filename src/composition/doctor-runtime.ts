import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { FsDoctor } from "../adapters/outbound/filesystem/fs-doctor.js";
import { DirectSkillManager } from "../adapters/outbound/skills/direct-skill-manager.js";
import { FsPipelineDocumentSource } from "../adapters/outbound/pipeline/fs-pipeline-document-source.js";
import { createDoctorUseCase } from "../application/doctor/run-doctor.js";
import type { ForDoctor } from "../ports/inbound/for-doctor.js";
import type { DoctorIndexInspector, IndexInspection } from "../ports/outbound/doctor-index-inspector.js";

const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

export function createDoctorRuntime(homeDir: string, targetDir: string = process.cwd()): ForDoctor {
  const filesystem = new FsDoctor(homeDir, targetDir);
  const skills = new DirectSkillManager(FRAMEWORK_ROOT);
  const pipelines = new FsPipelineDocumentSource(FRAMEWORK_ROOT);
  const inspector: DoctorIndexInspector = {
    inspectIndex: (kind, repair, apply) => filesystem.inspectIndex(kind, repair, apply),
    async inspectRuntime(repair, apply): Promise<readonly IndexInspection[]> {
      const [runtime, skillHealth, pipelineInspection] = await Promise.all([
        filesystem.inspectRuntime(repair, apply),
        skills.inspect(targetDir),
        inspectPipelineCatalog(pipelines),
      ]);
      const skillStatus = skillHealth.divergent > 0 ? "fail" : skillHealth.missing > 0 ? "warn" : "pass";
      return [
        ...runtime,
        pipelineInspection,
        {
          check: {
            id: "skills.installation",
            status: skillStatus,
            message: `${skillHealth.healthy}/${skillHealth.total} healthy, ${skillHealth.missing} missing, ${skillHealth.divergent} divergent`,
            repairable: skillStatus !== "pass",
          },
        },
      ];
    },
  };
  return createDoctorUseCase(inspector);
}

async function inspectPipelineCatalog(source: FsPipelineDocumentSource): Promise<IndexInspection> {
  try {
    const catalog = await source.loadCatalog();
    const definitions = await Promise.all(catalog.pipelines.map((entry) => source.loadDefinition(entry.id)));
    return {
      check: {
        id: "pipelines.catalog",
        status: "pass",
        message: `${definitions.length}/${catalog.pipelines.length} pipeline definition(s) resolved securely`,
        repairable: false,
      },
    };
  } catch (error) {
    return {
      check: {
        id: "pipelines.catalog",
        status: "fail",
        message: error instanceof Error ? error.message : String(error),
        repairable: false,
      },
    };
  }
}
