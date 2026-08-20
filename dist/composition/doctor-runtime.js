import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FsDoctor } from "../adapters/outbound/filesystem/fs-doctor.js";
import { DirectSkillManager } from "../adapters/outbound/skills/direct-skill-manager.js";
import { FsPipelineDocumentSource } from "../adapters/outbound/pipeline/fs-pipeline-document-source.js";
import { createDoctorUseCase } from "../application/doctor/run-doctor.js";
const FRAMEWORK_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
export function createDoctorRuntime(homeDir, targetDir = process.cwd()) {
    const filesystem = new FsDoctor(homeDir, targetDir);
    const skills = new DirectSkillManager(FRAMEWORK_ROOT);
    const pipelines = new FsPipelineDocumentSource(FRAMEWORK_ROOT);
    const inspector = {
        inspectIndex: (kind, repair, apply) => filesystem.inspectIndex(kind, repair, apply),
        async inspectRuntime(repair, apply) {
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
async function inspectPipelineCatalog(source) {
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
    }
    catch (error) {
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
//# sourceMappingURL=doctor-runtime.js.map