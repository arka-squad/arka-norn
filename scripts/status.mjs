import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  pipelineExitCode,
  pipelineReportEnvelope,
  presentPipelineReport,
} from "../dist/adapters/inbound/cli/presenters/pipeline-report-presenter.js";
import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runStatus(argv) {
  const json = argv.includes("--json");
  const positional = argv.filter((value) => value !== "--json");
  const featureRoot = path.resolve(positional[0] ?? process.cwd());
  if (positional.length > 1) {
    console.error("Usage : arka-norn status [--json] <feature-root>");
    process.exitCode = 64;
    return;
  }

  try {
    const report = await createPipelineRuntime(FRAMEWORK_ROOT).inspect({ featureRoot });
    if (json) {
      process.stdout.write(`${JSON.stringify(pipelineReportEnvelope(report))}\n`);
    } else {
      process.stdout.write(presentPipelineReport(report));
    }
    process.exitCode = pipelineExitCode(report);
  } catch (error) {
    if (json) {
      process.stdout.write(`${JSON.stringify({
        schemaVersion: 1,
        ok: false,
        data: null,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      })}\n`);
    } else {
      console.error(`ERREUR — ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exitCode = 70;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runStatus(process.argv.slice(2));
}
