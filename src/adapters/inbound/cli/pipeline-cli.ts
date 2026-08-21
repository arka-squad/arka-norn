/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { existsSync, realpathSync } from "node:fs";
import { basename, dirname, isAbsolute, parse, relative, resolve, sep } from "node:path";

import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import { loadVerifiedFeatureContext } from "../../../composition/verified-feature-context.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { AgentId } from "../../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../../domain/agent/agent-session-id.js";
import { AgentInactiveError, AgentScopeViolationError, PathSecurityError } from "../../../domain/errors.js";
import { FsFeatureStore } from "../../outbound/filesystem/fs-feature-store.js";
import type { PipelineAuthorAuthorization } from "../../../ports/inbound/for-pipeline.js";
import { pipelineExitCode, pipelineReportEnvelope, presentPipelineReport } from "./presenters/pipeline-report-presenter.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";

export interface PipelineCliContext {
  readonly cwd: string;
  readonly homeDir: string;
  readonly frameworkRoot: string;
  readonly sessionId: AgentSessionId;
}

export async function runStatusCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  try {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 0, maxPositionals: 1 });
    const target = await resolveFeatureTarget(parsed.positionals[0] ?? context.cwd, context.cwd, createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId }));
    const report = withTargetWarnings(await createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir }).inspect(inspectInput(target)), target.warnings);
    return {
      code: pipelineExitCode(report),
      stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report),
      stderr: "",
    };
  } catch (error) {
    return pipelineFailure("status", error, json, error instanceof CliUsageError ? 64 : inspectionResolutionExitCode(error));
  }
}

export async function runScaffoldCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  try {
    const parsed = parseStrictArguments(argv, {
      options: { force: "boolean", json: "boolean", agent: "string", "feature-id": "string", project: "string" },
      minPositionals: 2,
      maxPositionals: 2,
      exclusiveGroups: [["feature-id", "project"]],
    });
    const authorAgentId = parsed.values.get("agent");
    if (authorAgentId === undefined) throw new CliUsageError("scaffold requires --agent <Provider_role_YYYYMMDD>");
    const stepId = parsed.positionals[0]!;
    const outputPath = resolve(context.cwd, parsed.positionals[1]!);
    const explicitProjectId = parsed.values.get("project");
    if (explicitProjectId !== undefined && stepId !== "audit_etat_reel") {
      throw new CliUsageError("--project is supported only for scaffold audit_etat_reel");
    }
    const managedProject = explicitProjectId === undefined
      ? undefined
      : await managedProjectAuditScaffoldContext(outputPath, explicitProjectId, authorAgentId, context);
    const managed = managedProject === undefined ? await managedScaffoldContext(outputPath, authorAgentId, context) : undefined;
    const result = await createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir }).scaffold({
      stepId,
      outputPath,
      authorAgentId: AgentId.of(authorAgentId).value,
      ...(managed?.featureId === undefined && parsed.values.get("feature-id") === undefined ? {} : { featureId: managed?.featureId ?? parsed.values.get("feature-id")! }),
      ...(managedProject === undefined ? {} : { projectId: managedProject.projectId, allowedRoot: managedProject.projectRoot }),
      ...(managed === undefined ? {} : { pipelineId: managed.pipelineId, allowedRoot: managed.featureRoot }),
      force: parsed.booleans.has("force"),
    });
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
    return pipelineFailure("scaffold", message, json, scaffoldFailureExitCode(error, conflict));
  }
}

async function managedProjectAuditScaffoldContext(outputPath: string, projectId: string, authorAgentId: string, context: PipelineCliContext) {
  const management = createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId });
  const project = await management.projects.show(ProjectId.of(projectId));
  const agent = await management.agents.show(project, AgentId.of(authorAgentId));
  if (!agent.active) throw new AgentInactiveError(agent.id.value);
  const canonicalOutputPath = resolve(realpathSync.native(dirname(outputPath)), basename(outputPath));
  const projectRelativeOutput = relative(project.root, canonicalOutputPath);
  if (projectRelativeOutput === "" || projectRelativeOutput === ".." || projectRelativeOutput.startsWith(`..${sep}`) || isAbsolute(projectRelativeOutput)) {
    throw new PathSecurityError(canonicalOutputPath, `output must stay inside ${project.root}`);
  }
  if (findFeatureRoot(dirname(canonicalOutputPath)) !== undefined) {
    throw new PathSecurityError(canonicalOutputPath, "Project audit output must not be placed inside a managed Feature");
  }
  const containingProjectRoot = findProjectRoot(dirname(canonicalOutputPath));
  if (containingProjectRoot !== undefined && realpathSync.native(containingProjectRoot) !== project.root) {
    throw new PathSecurityError(canonicalOutputPath, "Project audit output must not be placed inside another managed Project");
  }
  if (!agent.coversProjectPath(projectRelativeOutput)) throw new AgentScopeViolationError(agent.id.value, `path:${projectRelativeOutput}`);
  return { projectId: project.id.value, projectRoot: project.root };
}

async function managedScaffoldContext(outputPath: string, authorAgentId: string, context: PipelineCliContext) {
  const featureRoot = findFeatureRoot(dirname(outputPath));
  if (featureRoot === undefined) return undefined;
  const feature = await new FsFeatureStore().load(featureRoot);
  const management = createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId });
  const { project } = await loadVerifiedFeatureContext(feature, management);
  const agent = await management.agents.show(project, AgentId.of(authorAgentId));
  if (!agent.active) throw new AgentInactiveError(agent.id.value);
  if (!agent.coversFeature(feature.id)) throw new AgentScopeViolationError(agent.id.value, `feature:${feature.id.value}`);
  const projectRelativeOutput = relative(project.root, outputPath);
  if (!agent.coversProjectPath(projectRelativeOutput)) throw new AgentScopeViolationError(agent.id.value, `path:${projectRelativeOutput}`);
  return { featureRoot, featureId: feature.id.value, pipelineId: feature.pipelineId };
}

function findFeatureRoot(start: string): string | undefined {
  let current = resolve(start);
  const filesystemRoot = parse(current).root;
  while (true) {
    if (existsSync(resolve(current, ".arka-norn", "feature.json"))) return current;
    if (current === filesystemRoot) return undefined;
    current = dirname(current);
  }
}

function findProjectRoot(start: string): string | undefined {
  let current = resolve(start);
  const filesystemRoot = parse(current).root;
  while (true) {
    if (existsSync(resolve(current, ".arka-norn", "project.json"))) return current;
    if (current === filesystemRoot) return undefined;
    current = dirname(current);
  }
}

export async function runValidateCommand(argv: readonly string[], context: PipelineCliContext): Promise<CliExecution> {
  const json = argv.includes("--json");
  try {
    const parsed = parseStrictArguments(argv, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
    const filePath = resolve(context.cwd, parsed.positionals[0]!);
    const result = await createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir }).validate({ filePath });
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
    const management = createManagementRuntime({ homeDir: context.homeDir, sessionId: context.sessionId });
    const pipeline = createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir });
    if (action === "status" || action === "next") {
      const parsed = parseStrictArguments(rest, { options: { json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const target = await resolveFeatureTarget(parsed.positionals[0]!, context.cwd, management);
      const report = withTargetWarnings(await pipeline.inspect(inspectInput(target)), target.warnings);
      if (action === "status") {
        return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
      }
      const data = { overallStatus: report.overallStatus, nextAction: report.nextActions[0] ?? null };
      const human = data.nextAction === null ? "Pipeline complet.\n" : `${data.nextAction.kind} -> ${data.nextAction.stepId}: ${data.nextAction.reason}\n`;
      return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.next", ok: report.overallStatus === "completed", data, errors: report.errors, warnings: report.warnings })}\n` : human, stderr: "" };
    }
    if (action === "scaffold") {
      return await runManagedScaffold(rest, context, management, pipeline, json);
    }
    if (action === "validate") {
      const parsed = parseStrictArguments(rest, { options: { document: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
      const target = await resolveFeatureTarget(parsed.positionals[0]!, context.cwd, management);
      const document = parsed.values.get("document");
      if (document !== undefined) {
        const result = await pipeline.validate({ filePath: resolve(target.root, document), pipelineId: target.pipelineId });
        const human = `${result.valid ? "VALIDE" : "INVALIDE"} — ${document}\n${result.errors.join("\n")}${result.errors.length === 0 ? "" : "\n"}`;
        return { code: result.valid ? 0 : 3, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.validate", ok: result.valid, data: result, errors: result.errors, warnings: [] })}\n` : human, stderr: "" };
      }
      const report = withTargetWarnings(await pipeline.inspect(inspectInput(target)), target.warnings);
      return { code: pipelineExitCode(report), stdout: json ? `${JSON.stringify(pipelineReportEnvelope(report))}\n` : presentPipelineReport(report), stderr: "" };
    }
    throw new CliUsageError("pipeline action must be status, next, scaffold or validate");
  } catch (error) {
    const code = error instanceof CliUsageError ? 64 : hasCode(error, "EEXIST") || hasCode(error, "LOCK_CONFLICT") ? 5 : hasCode(error, "FEATURE_NOT_FOUND") || hasCode(error, "FILE_NOT_FOUND") ? 4 : 3;
    return pipelineFailure(`pipeline.${action ?? "unknown"}`, error, json, code);
  }
}

type ManagementRuntime = ReturnType<typeof createManagementRuntime>;
type PipelineRuntime = ReturnType<typeof createPipelineRuntime>;

async function runManagedScaffold(
  argv: readonly string[],
  context: PipelineCliContext,
  management: ManagementRuntime,
  pipeline: PipelineRuntime,
  json: boolean,
): Promise<CliExecution> {
  const parsed = parseStrictArguments(argv, { options: { feature: "string", output: "string", agent: "string", session: "string", json: "boolean", force: "boolean" }, minPositionals: 1, maxPositionals: 1 });
  const selectedManagement = parsed.values.get("session") === undefined
    ? management
    : createManagementRuntime({ homeDir: context.homeDir, sessionId: AgentSessionId.of(parsed.values.get("session")!) });
  const featureId = parsed.values.get("feature");
  if (featureId === undefined) throw new CliUsageError("pipeline scaffold requires --feature <id>");
  const feature = await selectedManagement.features.show(FeatureId.of(featureId));
  const { project } = await loadVerifiedFeatureContext(feature, selectedManagement);
  const explicitAgentId = parsed.values.get("agent");
  const agent = explicitAgentId === undefined
    ? await selectedManagement.agents.current(project)
    : await selectedManagement.agents.show(project, AgentId.of(explicitAgentId));
  if (agent === undefined) throw new CliUsageError(`no active agent selected for project ${project.id.value}; use agent register/use or --agent`);
  if (!agent.active) throw new AgentInactiveError(agent.id.value);
  if (!agent.coversFeature(feature.id)) throw new AgentScopeViolationError(agent.id.value, `feature:${feature.id.value}`);
  const outputPath = resolve(context.cwd, parsed.values.get("output") ?? resolve(feature.root, `${parsed.positionals[0]!}.json`));
  const projectRelativeOutput = relative(project.root, outputPath);
  if (!agent.coversProjectPath(projectRelativeOutput)) throw new AgentScopeViolationError(agent.id.value, `path:${projectRelativeOutput}`);
  const result = await pipeline.scaffold({
    stepId: parsed.positionals[0]!, outputPath, allowedRoot: feature.root,
    authorAgentId: agent.id.value, featureId: feature.id.value, pipelineId: feature.pipelineId, force: parsed.booleans.has("force"),
  });
  return { code: 0, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command: "pipeline.scaffold", ok: true, data: result, errors: [], warnings: [] })}\n` : `Squelette écrit : ${result.outputPath}\n`, stderr: "" };
}

interface FeatureTarget {
  readonly root: string;
  readonly id?: string;
  readonly pipelineId: string;
  readonly authorRegistry?: readonly PipelineAuthorAuthorization[];
  readonly warnings: readonly string[];
}

async function resolveFeatureTarget(value: string, cwd: string, management: ManagementRuntime): Promise<FeatureTarget> {
  const candidate = resolve(cwd, value);
  if (existsSync(candidate)) {
    const featureRoot = findFeatureRoot(candidate);
    if (featureRoot !== undefined) {
      const feature = await new FsFeatureStore().load(featureRoot);
      return targetFromManagedFeature(feature, management);
    }
    return { root: candidate, pipelineId: "arka-norn-default", warnings: ["Dossier sans marqueur Feature : pipeline standard utilisé par compatibilité."] };
  }
  const feature = await management.features.show(FeatureId.of(value));
  return targetFromManagedFeature(feature, management);
}

async function targetFromManagedFeature(feature: Awaited<ReturnType<ManagementRuntime["features"]["show"]>>, management: ManagementRuntime): Promise<FeatureTarget> {
  const { authorRegistry } = await loadVerifiedFeatureContext(feature, management);
  return {
    root: feature.root,
    id: feature.id.value,
    pipelineId: feature.pipelineId,
    authorRegistry,
    warnings: [],
  };
}

function inspectInput(target: FeatureTarget) {
  return {
    featureRoot: target.root,
    pipelineId: target.pipelineId,
    ...(target.id === undefined ? {} : { featureId: target.id }),
    ...(target.authorRegistry === undefined ? {} : { authorRegistry: target.authorRegistry }),
  };
}

function withTargetWarnings<T extends { readonly warnings: readonly string[] }>(report: T, warnings: readonly string[]): T {
  return warnings.length === 0 ? report : { ...report, warnings: [...report.warnings, ...warnings] };
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

function inspectionResolutionExitCode(error: unknown): number {
  return hasCode(error, "PROJECT_NOT_FOUND")
    || hasCode(error, "PROJECT_MARKER_NOT_FOUND")
    || hasCode(error, "INVALID_AGENT_REGISTRY")
    || hasCode(error, "PATH_SECURITY")
    ? 3
    : 70;
}

function scaffoldFailureExitCode(error: unknown, conflict: boolean): number {
  if (error instanceof CliUsageError) return 64;
  if (conflict) return 5;
  return hasCode(error, "AGENT_NOT_FOUND")
    || hasCode(error, "AGENT_INACTIVE")
    || hasCode(error, "AGENT_SCOPE_VIOLATION")
    || hasCode(error, "INVALID_AGENT_REGISTRY")
    || hasCode(error, "INVALID_PROJECT_ID")
    || hasCode(error, "PROJECT_NOT_FOUND")
    || hasCode(error, "PROJECT_MARKER_NOT_FOUND")
    || hasCode(error, "PATH_SECURITY")
    || hasCode(error, "AUDIT_UNAVAILABLE")
    ? 3
    : 70;
}
