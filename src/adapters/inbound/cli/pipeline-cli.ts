import { existsSync } from "node:fs";
import { relative, resolve } from "node:path";

import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { pipelineExitCode, pipelineReportEnvelope, presentPipelineReport } from "./presenters/pipeline-report-presenter.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";

export interface PipelineCliContext {
  readonly cwd: string;
  readonly homeDir: string;
  readonly frameworkRoot: string;
}

export async function runStatusCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  try {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 0, maxPositionals: 1 });
    const report = await createPipelineRuntime(context.frameworkRoot).inspect({ featureRoot: resolve(context.cwd, parsed.positionals[0] ?? context.cwd) });
    return {
      code: pipelineExitCode(report),
      stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report),
      stderr: "",
    };
  } catch (error) {
    return pipelineFailure("status", error, json, error instanceof CliUsageError ? 64 : 70);
  }
}

export async function runScaffoldCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  try {
    const parsed = parseStrictArguments(argv, { options: { force: "boolean", json: "boolean" }, minPositionals: 2, maxPositionals: 2 });
    const stepId = parsed.positionals[0]!;
    const outputPath = resolve(context.cwd, parsed.positionals[1]!);
    const result = await createPipelineRuntime(context.frameworkRoot).scaffold({ stepId, outputPath, force: parsed.booleans.has("force") });
    return {
      code: 0,
      stdout: json
        ? `${JSON.stringify({ schemaVersion: 1, command: "scaffold", ok: true, data: result, errors: [], warnings: [] })}\n`
        : `Squelette écrit : ${result.outputPath}\nValeurs à remplacer : ${result.sentinelPaths.length}\n`,
      stderr: "",
    };
  } catch (error) {
    const conflict = hasCode(error, "EEXIST");
    const message = conflict && argv.length > 0
      ? `Le fichier existe déjà. Utilise --force pour confirmer l'écrasement.`
      : error instanceof Error ? error.message : String(error);
    return pipelineFailure("scaffold", message, json, error instanceof CliUsageError ? 64 : conflict ? 5 : 70);
  }
}

export async function runValidateCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  try {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
    const filePath = resolve(context.cwd, parsed.positionals[0]!);
    const result = await createPipelineRuntime(context.frameworkRoot).validate({ filePath });
    const human = result.valid
      ? `VALIDE — ${relative(context.cwd, filePath)} (type: ${result.type}, schema: ${result.schemaPath})\n`
      : `INVALIDE — ${relative(context.cwd, filePath)}${result.type === undefined ? "" : ` (type: ${result.type})`}\n${result.errors.map((error) => `  - ${error}`).join("\n")}\n`;
    return {
      code: result.valid ? 0 : 3,
      stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "validate", ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n` : human,
      stderr: "",
    };
  } catch (error) {
    return pipelineFailure("validate", error, json, error instanceof CliUsageError ? 64 : 70);
  }
}

export async function runPipelineCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  try {
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const pipeline = createPipelineRuntime(context.frameworkRoot);
    if (action === "status" || action === "next") {
      const parsed = parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const target = await resolveFeatureTarget(parsed.positionals[0]!, context.cwd, management);
      const report = await pipeline.inspect({ featureRoot: target.root, ...(target.id === undefined ? {} : { featureId: target.id }) });
      if (action === "status") {
        return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
      }
      const data = { overallStatus: report.overallStatus, nextAction: report.nextActions[0] ?? null };
      const human = data.nextAction === null ? "Pipeline complet.\n" : `${data.nextAction.kind} -> ${data.nextAction.stepId}: ${data.nextAction.reason}\n`;
      return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.next", ok: report.overallStatus === "completed", data, errors: report.errors, warnings: report.warnings })}\n` : human, stderr: "" };
    }
    if (action === "scaffold") {
      const parsed = parseStrictArguments(rest, { options: { feature: "string", output: "string", json: "boolean", force: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const featureId = parsed.values.get("feature");
      if (featureId === undefined) throw new CliUsageError("pipeline scaffold requires --feature <id>");
      const feature = await management.features.show(FeatureId.of(featureId));
      const outputPath = resolve(context.cwd, parsed.values.get("output") ?? resolve(feature.root, `${parsed.positionals[0]!}.json`));
      const result = await pipeline.scaffold({ stepId: parsed.positionals[0]!, outputPath, allowedRoot: feature.root, force: parsed.booleans.has("force") });
      return { code: 0, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.scaffold", ok: true, data: result, errors: [], warnings: [] })}\n` : `Squelette écrit : ${result.outputPath}\n`, stderr: "" };
    }
    if (action === "validate") {
      const parsed = parseStrictArguments(rest, { options: { document: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const target = await resolveFeatureTarget(parsed.positionals[0]!, context.cwd, management);
      const document = parsed.values.get("document");
      if (document !== undefined) {
        const result = await pipeline.validate({ filePath: resolve(target.root, document) });
        const human = `${result.valid ? "VALIDE" : "INVALIDE"} — ${document}\n${result.errors.join("\n")}${result.errors.length === 0 ? "" : "\n"}`;
        return { code: result.valid ? 0 : 3, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.validate", ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n` : human, stderr: "" };
      }
      const report = await pipeline.inspect({ featureRoot: target.root, ...(target.id === undefined ? {} : { featureId: target.id }) });
      return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
    }
    throw new CliUsageError("pipeline action must be status, next, scaffold or validate");
  } catch (error) {
    const code = error instanceof CliUsageError ? 64 : hasCode(error, "EEXIST") || hasCode(error, "LOCK_CONFLICT") ? 5 : hasCode(error, "FEATURE_NOT_FOUND") || hasCode(error, "FILE_NOT_FOUND") ? 4 : 3;
    return pipelineFailure(`pipeline.${action ?? "unknown"}`, error, json, code);
  }
}

type ManagementRuntime = ReturnType<typeof createManagementRuntime>;

async function resolveFeatureTarget(value: string, cwd: string, management: ManagementRuntime): Promise<{ readonly root: string; readonly id?: string }> {
  const candidate = resolve(cwd, value);
  if (existsSync(candidate)) return { root: candidate };
  const feature = await management.features.show(FeatureId.of(value));
  return { root: feature.root, id: feature.id.value };
}

function pipelineFailure(command: string, error: unknown, json: boolean, code: number): CliExecution {
  const message = error instanceof Error ? error.message : String(error);
  return json
    ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
    : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}

function hasCode(error: unknown, expected: string): boolean {
  return error instanceof Error && "code" in error && error.code === expected;
}
