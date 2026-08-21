import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import type { Feature } from "../../../domain/feature/feature.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { isProjectOrchestrationMode, type Project } from "../../../domain/project/project.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments, type StrictArguments, type StrictArgumentSpec } from "./strict-arguments.js";

export type { CliExecution } from "./cli-execution.js";

export interface ManagementCliContext {
  readonly homeDir: string;
  readonly cwd: string;
}

export async function runManagementCommand(argv: readonly string[], context: ManagementCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  const rawResource = argv[0];
  const resource = rawResource === "depot" ? "project" : rawResource;
  const action = argv[1];
  const command = `${resource ?? "unknown"}.${action ?? "unknown"}`;
  const warnings = rawResource === "depot" ? ["L'alias 'depot' est déprécié ; utilise 'project'."] : [];
  try {
    if (resource !== "project" && resource !== "feature") throw new UsageError("resource must be project or feature");
    if (action === undefined) throw new UsageError(`missing ${resource} action`);
    const parsed = parseStrictArguments(argv.slice(2), argumentSpec(resource, action));
    const runtime = createManagementRuntime({ homeDir: context.homeDir });
    const data = resource === "project"
      ? await executeProject(action, parsed, runtime, context)
      : await executeFeature(action, parsed, runtime, context);
    return output(command, data, json, warnings);
  } catch (error) {
    return failure(command, error, json, warnings);
  }
}

type Runtime = ReturnType<typeof createManagementRuntime>;

async function executeProject(action: string, args: ParsedArguments, runtime: Runtime, context: ManagementCliContext): Promise<unknown> {
  switch (action) {
    case "list": {
      requirePositionals(args, 0);
      return (await runtime.projects.list()).map(serializeProject);
    }
    case "add": {
      requirePositionals(args, 1);
      const root = resolve(context.cwd, args.positionals[0]!);
      const name = args.values.get("name") ?? basename(root);
      const id = ProjectId.of(args.values.get("id") ?? deriveId(name, root));
      const orchestrationMode = optionalOrchestrationMode(args.values.get("orchestration-mode"));
      return serializeProject(await runtime.projects.create({ id, name, root, ...(orchestrationMode === undefined ? {} : { orchestrationMode }) }));
    }
    case "import": {
      requirePositionals(args, 1);
      return serializeProject(await runtime.projects.importFrom({ root: resolve(context.cwd, args.positionals[0]!) }));
    }
    case "show": {
      requirePositionals(args, 1);
      return serializeProject(await runtime.projects.show(ProjectId.of(args.positionals[0]!)));
    }
    case "use": {
      requirePositionals(args, 1);
      return serializeProject(await runtime.projects.switchTo(ProjectId.of(args.positionals[0]!)));
    }
    case "set-orchestration-mode": {
      requirePositionals(args, 1);
      return serializeProject(await runtime.projects.setOrchestrationMode({
        id: ProjectId.of(args.positionals[0]!),
        orchestrationMode: requiredOrchestrationMode(args),
      }));
    }
    case "forget": {
      requirePositionals(args, 1);
      if (!args.booleans.has("yes")) throw new UsageError("project forget requires --yes confirmation");
      const id = ProjectId.of(args.positionals[0]!);
      await runtime.projects.forget(id);
      return { id: id.value, forgotten: true, dataDeleted: false };
    }
    case "scan":
    case "reconcile": {
      if (args.positionals.length > 1) throw new UsageError(`${action} accepts at most one path`);
      const target = resolve(context.cwd, args.positionals[0] ?? context.cwd);
      const results = await runtime.scanProjects.scan({ target });
      return results.map((item) => ({ root: item.root, hasMarker: item.hasMarker, healthy: item.project !== undefined, ...(item.project === undefined ? {} : { project: serializeProject(item.project) }) }));
    }
    default:
      throw new UsageError(`unknown project action: ${action}`);
  }
}

async function executeFeature(action: string, args: ParsedArguments, runtime: Runtime, context: ManagementCliContext): Promise<unknown> {
  switch (action) {
    case "list": {
      requirePositionals(args, 0);
      const projectId = args.values.get("project");
      const features = await runtime.features.list();
      return features.filter((feature) => projectId === undefined || feature.projectId.value === projectId).map(serializeFeature);
    }
    case "create": {
      requirePositionals(args, 1);
      const projectId = ProjectId.of(requiredValue(args, "project"));
      const project = await runtime.projects.show(projectId);
      const name = args.positionals[0]!;
      const root = resolve(context.cwd, args.values.get("path") ?? resolve(project.root, slugify(name)));
      const id = FeatureId.of(args.values.get("id") ?? deriveId(name, root));
      const pipelineId = await resolveWorkflowId(args.values.get("workflow"));
      return serializeFeature(await runtime.features.create({ id, projectId, name, root, pipelineId }));
    }
    case "import": {
      requirePositionals(args, 1);
      const projectId = ProjectId.of(requiredValue(args, "project"));
      return serializeFeature(await runtime.features.importFrom({ root: resolve(context.cwd, args.positionals[0]!), projectId }));
    }
    case "show": {
      requirePositionals(args, 1);
      return serializeFeature(await runtime.features.show(FeatureId.of(args.positionals[0]!)));
    }
    case "use": {
      requirePositionals(args, 1);
      return serializeFeature(await runtime.features.switchTo(FeatureId.of(args.positionals[0]!)));
    }
    case "set-workflow": {
      requirePositionals(args, 1);
      const workflow = requiredValue(args, "workflow");
      const pipeline = createPipelineRuntime(FRAMEWORK_ROOT);
      const selected = await pipeline.showWorkflow(workflow);
      const workflows = await pipeline.listWorkflows();
      return serializeFeature(await runtime.features.setWorkflow({
        id: FeatureId.of(args.positionals[0]!),
        pipelineId: selected.id,
        recognizedDocumentTypes: [...new Set([...workflows.flatMap((item) => item.steps.map((step) => step.id)), "handoff"])],
      }));
    }
    case "forget": {
      requirePositionals(args, 1);
      if (!args.booleans.has("yes")) throw new UsageError("feature forget requires --yes confirmation");
      const id = FeatureId.of(args.positionals[0]!);
      await runtime.features.forget(id);
      return { id: id.value, forgotten: true, dataDeleted: false };
    }
    case "scan":
    case "reconcile": {
      requirePositionals(args, 0);
      const projectId = ProjectId.of(requiredValue(args, "project"));
      const project = await runtime.projects.show(projectId);
      const target = resolve(context.cwd, args.values.get("path") ?? project.root);
      const results = await runtime.scanFeatures.scan({ target, projectId });
      return results.map((item) => ({ root: item.root, hasMarker: item.hasMarker, healthy: item.feature !== undefined, ...(item.feature === undefined ? {} : { feature: serializeFeature(item.feature) }) }));
    }
    default:
      throw new UsageError(`unknown feature action: ${action}`);
  }
}

type ParsedArguments = StrictArguments;

function argumentSpec(resource: "project" | "feature", action: string): StrictArgumentSpec {
  const json = { json: "boolean" as const };
  const key = `${resource}.${action}`;
  const specs: Readonly<Record<string, StrictArgumentSpec>> = {
    "project.list": { options: json, minPositionals: 0, maxPositionals: 0 },
    "project.add": { options: { ...json, name: "string", id: "string", "orchestration-mode": "string" }, minPositionals: 1, maxPositionals: 1 },
    "project.import": { options: json, minPositionals: 1, maxPositionals: 1 },
    "project.show": { options: json, minPositionals: 1, maxPositionals: 1 },
    "project.use": { options: json, minPositionals: 1, maxPositionals: 1 },
    "project.set-orchestration-mode": { options: { ...json, "orchestration-mode": "string" }, minPositionals: 1, maxPositionals: 1 },
    "project.forget": { options: { ...json, yes: "boolean" }, minPositionals: 1, maxPositionals: 1 },
    "project.scan": { options: json, minPositionals: 0, maxPositionals: 1 },
    "project.reconcile": { options: json, minPositionals: 0, maxPositionals: 1 },
    "feature.list": { options: { ...json, project: "string" }, minPositionals: 0, maxPositionals: 0 },
    "feature.create": { options: { ...json, project: "string", path: "string", id: "string", workflow: "string" }, minPositionals: 1, maxPositionals: 1 },
    "feature.import": { options: { ...json, project: "string" }, minPositionals: 1, maxPositionals: 1 },
    "feature.show": { options: json, minPositionals: 1, maxPositionals: 1 },
    "feature.use": { options: json, minPositionals: 1, maxPositionals: 1 },
    "feature.set-workflow": { options: { ...json, workflow: "string" }, minPositionals: 1, maxPositionals: 1 },
    "feature.forget": { options: { ...json, yes: "boolean" }, minPositionals: 1, maxPositionals: 1 },
    "feature.scan": { options: { ...json, project: "string", path: "string" }, minPositionals: 0, maxPositionals: 0 },
    "feature.reconcile": { options: { ...json, project: "string", path: "string" }, minPositionals: 0, maxPositionals: 0 },
  };
  return specs[key] ?? { options: json };
}

function requiredValue(args: ParsedArguments, name: string): string {
  const value = args.values.get(name);
  if (value === undefined) throw new UsageError(`--${name} is required`);
  return value;
}

function requiredOrchestrationMode(args: ParsedArguments) {
  const value = requiredValue(args, "orchestration-mode");
  return optionalOrchestrationMode(value)!;
}

function optionalOrchestrationMode(value: string | undefined) {
  if (value === undefined) return undefined;
  if (!isProjectOrchestrationMode(value)) {
    throw new UsageError("--orchestration-mode must be manual or automatic");
  }
  return value;
}

function requirePositionals(args: ParsedArguments, count: number): void {
  if (args.positionals.length !== count) throw new UsageError(`expected ${count} positional argument(s), received ${args.positionals.length}`);
}

function serializeProject(project: Project) {
  return { schemaVersion: project.schemaVersion, id: project.id.value, name: project.name, root: project.root, orchestrationMode: project.orchestrationMode, createdAt: project.createdAt.toISOString(), updatedAt: project.updatedAt.toISOString() };
}

function serializeFeature(feature: Feature) {
  return { schemaVersion: feature.schemaVersion, id: feature.id.value, projectId: feature.projectId.value, name: feature.name, root: feature.root, pipelineId: feature.pipelineId, createdAt: feature.createdAt.toISOString(), updatedAt: feature.updatedAt.toISOString() };
}

function deriveId(name: string, root: string): string {
  const base = slugify(name).slice(0, 54);
  return `${base}-${createHash("sha256").update(root).digest("hex").slice(0, 8)}`;
}

function slugify(value: string): string {
  const slug = value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length === 0) throw new UsageError("name cannot produce a valid identifier");
  return slug;
}

function output(command: string, data: unknown, json: boolean, warnings: readonly string[]): CliExecution {
  if (json) return { code: 0, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings })}\n`, stderr: "" };
  const rows = Array.isArray(data) ? data : [data];
  const body = rows.length === 0 ? "Aucun résultat." : rows.map(humanRow).join("\n");
  return { code: 0, stdout: `${body}\n`, stderr: warnings.map((warning) => `AVERTISSEMENT — ${warning}\n`).join("") };
}

function humanRow(value: unknown): string {
  if (typeof value !== "object" || value === null) return String(value);
  const row = value as Readonly<Record<string, unknown>>;
  if (typeof row["id"] === "string") return `${row["id"]}\t${scalar(row["name"])}\t${scalar(row["root"])}\t${scalar(row["orchestrationMode"])}`.trimEnd();
  if (typeof row["root"] === "string") return `${row["healthy"] === true ? "OK" : "WARN"}\t${row["root"]}`;
  return JSON.stringify(value);
}

function scalar(value: unknown): string {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : "";
}

function failure(command: string, error: unknown, json: boolean, warnings: readonly string[]): CliExecution {
  const message = error instanceof Error ? error.message : String(error);
  const code = errorCode(error);
  if (json) return { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings })}\n`, stderr: "" };
  return { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}

function errorCode(error: unknown): number {
  if (error instanceof UsageError || error instanceof CliUsageError) return 64;
  if (error instanceof DomainError) {
    if (error.code === "PROJECT_NOT_FOUND" || error.code === "PROJECT_MARKER_NOT_FOUND" || error.code === "FEATURE_NOT_FOUND" || error.code === "FEATURE_MARKER_NOT_FOUND" || error.code === "FILE_NOT_FOUND") return 4;
    if (error.code === "PROJECT_ALREADY_EXISTS" || error.code === "FEATURE_ALREADY_EXISTS" || error.code === "LOCK_CONFLICT") return 5;
    if (error.code === "INVALID_PROJECT_ID" || error.code === "INVALID_FEATURE_ID" || error.code === "INVALID_PROJECT_OPTION" || error.code === "INVALID_FEATURE_OPTION") return 64;
    return 3;
  }
  if (error instanceof Error && "code" in error && error.code === "EEXIST") return 5;
  return 70;
}

class UsageError extends Error {}

const FRAMEWORK_ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");

async function resolveWorkflowId(workflow: string | undefined): Promise<string> {
  return workflow === undefined
    ? (await createPipelineRuntime(FRAMEWORK_ROOT).showWorkflow("standard")).id
    : (await createPipelineRuntime(FRAMEWORK_ROOT).showWorkflow(workflow)).id;
}
