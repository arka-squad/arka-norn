import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { pipelineExitCode, pipelineReportEnvelope, presentPipelineReport } from "../dist/adapters/inbound/cli/presenters/pipeline-report-presenter.js";
import { CliUsageError, parseStrictArguments } from "../dist/adapters/inbound/cli/strict-arguments.js";
import { FeatureId } from "../dist/domain/feature/feature-id.js";
import { createManagementRuntime } from "../dist/composition/management-runtime.js";
import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";
import { readEnv } from "../dist/composition/env.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function runPipeline(argv) {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  try {
    const env = readEnv(process.env, process.cwd());
    const management = createManagementRuntime({ homeDir: env.homeDir ?? os.homedir() });
    const pipeline = createPipelineRuntime(FRAMEWORK_ROOT);
    if (action === "status" || action === "next") {
      const parsed = parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const target = await resolveFeatureTarget(parsed.positionals[0], env.cwd, management);
      const report = await pipeline.inspect({ featureRoot: target.root, ...(target.id ? { featureId: target.id } : {}) });
      if (action === "status") {
        process.stdout.write(json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report));
      } else {
        const data = { overallStatus: report.overallStatus, nextAction: report.nextActions[0] ?? null };
        process.stdout.write(json ? `${JSON.stringify({ schemaVersion: 1, ok: report.overallStatus === "completed", data, errors: report.errors, warnings: report.warnings })}\n` : `${data.nextAction ? `${data.nextAction.kind} -> ${data.nextAction.stepId}: ${data.nextAction.reason}` : "Pipeline complet."}\n`);
      }
      process.exitCode = pipelineExitCode(report);
      return;
    }
    if (action === "scaffold") {
      const parsed = parseStrictArguments(rest, { options: { feature: "string", output: "string", json: "boolean", force: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const featureId = parsed.values.get("feature");
      if (!featureId) throw new CliUsageError("pipeline scaffold requires --feature <id>");
      const feature = await management.features.show(FeatureId.of(featureId));
      const outputPath = path.resolve(env.cwd, parsed.values.get("output") ?? path.resolve(feature.root, `${parsed.positionals[0]}.json`));
      const result = await pipeline.scaffold({ stepId: parsed.positionals[0], outputPath, allowedRoot: feature.root, force: parsed.booleans.has("force") });
      process.stdout.write(json ? `${JSON.stringify({ schemaVersion: 1, ok: true, data: result, errors: [], warnings: [] })}\n` : `Squelette écrit : ${result.outputPath}\n`);
      process.exitCode = 0;
      return;
    }
    if (action === "validate") {
      const parsed = parseStrictArguments(rest, { options: { document: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const target = await resolveFeatureTarget(parsed.positionals[0], env.cwd, management);
      const document = parsed.values.get("document");
      if (document) {
        const result = await pipeline.validate({ filePath: path.resolve(target.root, document) });
        process.stdout.write(json ? `${JSON.stringify({ schemaVersion: 1, ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n` : `${result.valid ? "VALIDE" : "INVALIDE"} — ${document}\n${result.errors.join("\n")}\n`);
        process.exitCode = result.valid ? 0 : 3;
      } else {
        const report = await pipeline.inspect({ featureRoot: target.root, ...(target.id ? { featureId: target.id } : {}) });
        process.stdout.write(json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report));
        process.exitCode = pipelineExitCode(report);
      }
      return;
    }
    throw new CliUsageError("pipeline action must be status, next, scaffold or validate");
  } catch (error) {
    const conflict = error instanceof Error && "code" in error && (error.code === "EEXIST" || error.code === "LOCK_CONFLICT");
    const notFound = error instanceof Error && "code" in error && (error.code === "FEATURE_NOT_FOUND" || error.code === "FILE_NOT_FOUND");
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(json ? `${JSON.stringify({ schemaVersion: 1, ok: false, data: null, errors: [message], warnings: [] })}\n` : "");
    if (!json) process.stderr.write(`ERREUR — ${message}\n`);
    process.exitCode = error instanceof CliUsageError ? 64 : conflict ? 5 : notFound ? 4 : 3;
  }
}

async function resolveFeatureTarget(value, cwd, management) {
  const candidate = path.resolve(cwd, value);
  if (existsSync(candidate)) return { root: candidate };
  const feature = await management.features.show(FeatureId.of(value));
  return { root: feature.root, id: feature.id.value };
}
