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

import { DomainError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import type { Project } from "../../../domain/project/project.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { createOrchestrationRuntime } from "../../../composition/orchestration-runtime.js";
import { createOrchestrationV23Runtime, type OrchestrationV23Preview, type OrchestrationV23RunResult, type OrchestrationV23Runtime, type OrchestrationV23Status } from "../../../composition/orchestration-v23-runtime.js";
import { createPipelineRuntime } from "../../../composition/pipeline-runtime.js";
import type { ExecutionPolicy } from "../../../domain/orchestration/execution-policy.js";
import type { ExecutionRecord } from "../../../domain/orchestration/execution-record.js";
import type { OrchestrationCampaign } from "../../../domain/orchestration/orchestration-campaign.js";
import { isExecutionProvider } from "../../../domain/orchestration/types.js";
import type { OrchestrationPreview, OrchestrationStatus } from "../../../ports/inbound/for-orchestration.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments, type StrictArguments, type StrictArgumentSpec } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
import { translate } from "../../../application/localization/locale.js";
import { runOrchestrationV23Action } from "./orchestration-v23-actions.js";
import { FsOrchestrationConfigurationStore } from "../../outbound/filesystem/fs-orchestration-configuration-store.js";
import { FsOrchestrationCampaignV23Store } from "../../outbound/filesystem/fs-orchestration-campaign-v23-store.js";
import { FsOrchestrationEventStore } from "../../outbound/filesystem/fs-orchestration-event-store.js";
import { GitWorktreeWorkspaceAdapter } from "../../outbound/execution/git-workspace-adapter.js";
import { LocalExecutionProfileRuntimeAdapter } from "../../outbound/execution/execution-profile-runtime-adapter.js";
import { MastraTaskWorkerAdapter } from "../../outbound/execution/mastra-task-worker-adapter.js";
import type { BudgetLimit, BudgetMode } from "../../../domain/orchestration/orchestration-plan.js";

export interface OrchestrationCliContext {
  readonly homeDir: string;
  readonly cwd: string;
  readonly frameworkRoot: string;
  readonly environment?: NodeJS.ProcessEnv;
}

export function orchestrationHelp(): string {
  return translate("cli.orchestration.help");
}

/** Public CLI surface. `_worker` is intentionally accepted but undocumented. */
export async function runOrchestrationCommand(argv: readonly string[], context: OrchestrationCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `orchestration.${action ?? "unknown"}`;
  try {
    if (action === "help" || action === "--help" || action === "-h") return { code: 0, stdout: orchestrationHelp(), stderr: "" };
    if (action === undefined) throw new CliUsageError(`missing orchestration action\n\n${orchestrationHelp()}`);
    const args = parseStrictArguments(rest, argumentSpec(action));
    const management = createManagementRuntime({ homeDir: context.homeDir });
    const pipeline = createPipelineRuntime(context.frameworkRoot, { homeDir: context.homeDir });
    const runtime = createOrchestrationRuntime({
      ...management,
      pipeline,
      homeDir: context.homeDir,
      frameworkRoot: context.frameworkRoot,
      ...(context.environment === undefined ? {} : { environment: context.environment }),
    });
    const configurations = new FsOrchestrationConfigurationStore();
    const v23 = createOrchestrationV23Runtime({
      projects: management.projects,
      features: management.features,
      agents: management.agents,
      configurations,
      campaigns: new FsOrchestrationCampaignV23Store(context.homeDir),
      events: new FsOrchestrationEventStore(context.homeDir),
      git: new GitWorktreeWorkspaceAdapter(context.homeDir),
      profiles: new LocalExecutionProfileRuntimeAdapter(context.homeDir, context.environment ?? process.env),
      worker: new MastraTaskWorkerAdapter(),
    });
    if (action === "_worker") {
      throw new Error("Legacy automatic workers are quarantined in Norn 2.3 and cannot be started or resumed.");
    }
    const projectId = ProjectId.of(required(args.values, "project"));
    const project = await management.projects.show(projectId);
    let v23Configured = false;
    try { v23Configured = (await configurations.load(project)) !== undefined; }
    catch (error) { if (!(error instanceof Error) || !error.message.startsWith("Legacy orchestration state is read-only")) throw error; }
    const retiredAutomaticActions = ["configure", "cancel", "approve", "retry", "pause", "resume", "decide", "changes", "abandon"];
    if (action === "configure") throw new Error("Legacy automatic configuration was removed in Norn 2.3; use orchestration profile register.");
    if (retiredAutomaticActions.includes(action) && (v23Configured || project.orchestrationMode === "automatic")) throw new Error(`orchestration ${action} belongs to the quarantined 2.2 engine and is unavailable for automatic Projects.`);
    const data = await executeAction({ action, args, projectId, project, v23Configured, context, runtime, v23 });
    return output(command, data, json, action);
  } catch (error) {
    return failure(command, error, json);
  }
}

async function executeAction(input: {
  readonly action: string;
  readonly args: StrictArguments;
  readonly projectId: ProjectId;
  readonly project: Project;
  readonly v23Configured: boolean;
  readonly context: OrchestrationCliContext;
  readonly runtime: ReturnType<typeof createOrchestrationRuntime>;
  readonly v23: OrchestrationV23Runtime;
}): Promise<unknown> {
  const { action, args, projectId, project, v23Configured, context, runtime, v23 } = input;
  if (action === "preview") {
    if (!v23Configured && project.orchestrationMode === "automatic") throw new Error("Legacy automatic orchestration is quarantined. Import and activate Norn 2.3 profiles before previewing a campaign.");
    return v23Configured ? serializeV23Preview(await v23.preview({ projectId, featureId: FeatureId.of(required(args.values, "feature")), declaredUntracked: csv(args.values.get("include-untracked") ?? "") })) : serializePreview(await runtime.preview({ projectId, featureId: FeatureId.of(required(args.values, "feature")) }));
  }
  if (action === "start") return executeStart(input);
  if (action === "status") return v23Configured ? serializeV23Status(await v23.status({ projectId })) : serializeStatus(await runtime.status({ projectId }));
  if (action === "profile" || action === "recovery") return runOrchestrationV23Action({ action, args, project, homeDir: context.homeDir, environment: context.environment ?? process.env });
  if (action === "apply") return v23Configured ? serializeV23Run(await v23.apply({ projectId, campaignId: args.positionals[0]!, confirmationFingerprint: required(args.values, "confirm") })) : serializeCampaign(await runtime.apply!({ projectId, campaignId: args.positionals[0]!, expectedRevision: requiredInteger(args.values, "revision"), fingerprint: required(args.values, "confirm") }));
  return executeLegacyAction(action, args, projectId, runtime);
}

async function executeStart(input: Parameters<typeof executeAction>[0]): Promise<unknown> {
  const { args, projectId, project, v23Configured, runtime, v23 } = input;
  if (!v23Configured && project.orchestrationMode === "automatic") throw new Error("Legacy automatic campaigns cannot be started or resumed in Norn 2.3.");
  if (!v23Configured) return serializeExecution(await runtime.start({ projectId, featureId: FeatureId.of(required(args.values, "feature")), selection: selectionFrom(args.values), previewFingerprint: required(args.values, "preview") }));
  return serializeV23Run(await v23.start({ projectId, previewFingerprint: required(args.values, "preview"), actor: required(args.values, "actor"), profileByRole: roleProfiles(required(args.values, "profiles")), allowCommits: args.booleans.has("allow-commits"), applyMode: applyMode(args.values.get("apply") ?? "human"), automaticRiskThreshold: boundedInteger(args.values.get("risk-threshold") ?? "20", "risk-threshold", 0, 20), maxParallel: parallelism(args.values.get("max-parallel") ?? "3"), budgetMode: budgetMode(args.values.get("budget-mode") ?? "admission"), budgetLimits: budgetLimits(args.values.get("budget-limits") ?? ""), openBarProfiles: csv(args.values.get("open-bar") ?? ""), riskPolicyFingerprint: required(args.values, "confirm-policy") }));
}

async function executeLegacyAction(action: string, args: StrictArguments, projectId: ProjectId, runtime: ReturnType<typeof createOrchestrationRuntime>): Promise<unknown> {
  const id = args.positionals[0]!;
  switch (action) {
    case "cancel": return id.startsWith("campaign-") ? serializeCampaign(await runtime.cancelCampaign!({ projectId, campaignId: id, expectedRevision: requiredInteger(args.values, "revision") })) : serializeExecution(await runtime.cancel({ projectId, executionId: id }));
    case "approve": return serializeExecution(await runtime.approve({ projectId, executionId: id }));
    case "retry": return id.startsWith("campaign-") ? serializeCampaign(await runtime.retryCampaign!({ projectId, campaignId: id, expectedRevision: requiredInteger(args.values, "revision"), fingerprint: required(args.values, "confirm") })) : serializeExecution(await runtime.retry({ projectId, executionId: id }));
    case "pause": return serializeCampaign(await runtime.pause!({ projectId, campaignId: id, expectedRevision: requiredInteger(args.values, "revision") }));
    case "resume": return serializeCampaign(await runtime.resume!({ projectId, campaignId: id, expectedRevision: requiredInteger(args.values, "revision") }));
    case "decide": return serializeCampaign(await runtime.decide!({ projectId, campaignId: id, expectedRevision: requiredInteger(args.values, "revision"), fingerprint: required(args.values, "confirm"), actor: required(args.values, "actor"), choice: required(args.values, "choice"), ...(args.values.get("reason") === undefined ? {} : { reason: args.values.get("reason")! }) }));
    case "changes": return runtime.changes!({ projectId, campaignId: id });
    case "abandon": return serializeCampaign(await runtime.abandon!({ projectId, campaignId: id, expectedRevision: requiredInteger(args.values, "revision") }));
    default: throw new CliUsageError(`unknown orchestration action: ${action}`);
  }
}

function argumentSpec(action: string): StrictArgumentSpec {
  const project = { project: "string" as const, json: "boolean" as const };
  const specs: Readonly<Record<string, StrictArgumentSpec>> = {
    configure: { options: { ...project, provider: "string", model: "string", workspace: "string" }, minPositionals: 0, maxPositionals: 0 },
    preview: { options: { ...project, feature: "string", "include-untracked": "string" }, minPositionals: 0, maxPositionals: 0 },
    start: { options: { ...project, feature: "string", provider: "string", model: "string", preview: "string", actor: "string", profiles: "string", "allow-commits": "boolean", apply: "string", "risk-threshold": "string", "max-parallel": "string", "budget-mode": "string", "budget-limits": "string", "open-bar": "string", "confirm-policy": "string" }, minPositionals: 0, maxPositionals: 0 },
    status: { options: project, minPositionals: 0, maxPositionals: 0 },
    cancel: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
    approve: { options: project, minPositionals: 1, maxPositionals: 1 },
    retry: { options: { ...project, revision: "string", confirm: "string" }, minPositionals: 1, maxPositionals: 1 },
    pause: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
    resume: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
    decide: { options: { ...project, revision: "string", confirm: "string", actor: "string", choice: "string", reason: "string" }, minPositionals: 1, maxPositionals: 1 },
    changes: { options: project, minPositionals: 1, maxPositionals: 1 },
    apply: { options: { ...project, revision: "string", confirm: "string" }, minPositionals: 1, maxPositionals: 1 },
    abandon: { options: { ...project, revision: "string" }, minPositionals: 1, maxPositionals: 1 },
    profile: {
      options: {
        ...project,
        id: "string",
        transport: "string",
        provider: "string",
        model: "string",
        "gateway-kind": "string",
        "gateway-endpoint": "string",
        "catalog-ref": "string",
        "credential-kind": "string",
        "credential-ref": "string",
        "credential-env": "string",
        capabilities: "string",
        egress: "string",
        "cost-meter": "string",
        "cost-observable": "boolean",
        enabled: "boolean",
        activate: "boolean",
      },
      minPositionals: 1,
      maxPositionals: 2,
      requires: { "credential-kind": ["credential-ref"], "credential-ref": ["credential-kind"] },
    },
    recovery: { options: { ...project, confirm: "string" }, minPositionals: 1, maxPositionals: 2 },
    _worker: { options: { project: "string", execution: "string" }, minPositionals: 0, maxPositionals: 0 },
  };
  return specs[action] ?? { options: project };
}

function requiredInteger(values: ReadonlyMap<string, string>, name: string): number {
  const parsed = Number(required(values, name));
  if (!Number.isInteger(parsed) || parsed < 1) throw new CliUsageError(`--${name} must be a positive integer`);
  return parsed;
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new CliUsageError(`--${name} is required`);
  return value;
}

function selectionFrom(values: ReadonlyMap<string, string>): { readonly provider: "claude" | "codex" | "kimi" | "zai"; readonly model: string } {
  const provider = required(values, "provider");
  if (!isExecutionProvider(provider)) {
    throw new CliUsageError("--provider must be one of: claude, codex, kimi, zai");
  }
  return { provider, model: required(values, "model") };
}

function output(command: string, data: unknown, json: boolean, action: string): CliExecution {
  if (json) return { code: 0, stdout: jsonEnvelope({ command, ok: true, data }), stderr: "" };
  if (isRecord(data) && "campaigns" in data) return { code: 0, stdout: `${humanV23Status(data as ReturnType<typeof serializeV23Status>)}\n`, stderr: "" };
  if (isRecord(data) && "eligible" in data) return { code: 0, stdout: `${humanV23Preview(data as ReturnType<typeof serializeV23Preview>)}\n`, stderr: "" };
  if (isRecord(data) && "projection" in data) return { code: 0, stdout: `${humanV23Run(data as ReturnType<typeof serializeV23Run>)}\n`, stderr: "" };
  if (action === "status") return { code: 0, stdout: `${humanStatus(data as ReturnType<typeof serializeStatus>)}\n`, stderr: "" };
  if (action === "configure") return { code: 0, stdout: `${humanPolicy(data as ReturnType<typeof serializePolicy>)}\n`, stderr: "" };
  if (action === "preview") return { code: 0, stdout: `${humanPreview(data as ReturnType<typeof serializePreview>)}\n`, stderr: "" };
  if (action === "profile") return { code: 0, stdout: `${humanV23Profile(data)}\n`, stderr: "" };
  if (action === "recovery") return { code: 0, stdout: `${humanRecovery(data)}\n`, stderr: "" };
  if (["pause", "resume", "decide", "apply", "abandon"].includes(action) || (["cancel", "retry"].includes(action) && "revision" in (data as object))) {
    const campaign = data as ReturnType<typeof serializeCampaign>;
    return { code: 0, stdout: `Campaign ${campaign.id}: ${campaign.status} (revision ${campaign.revision})\n`, stderr: "" };
  }
  if (action === "changes") return { code: 0, stdout: `${JSON.stringify(data, null, 2)}\n`, stderr: "" };
  const execution = data as ReturnType<typeof serializeExecution>;
  return { code: 0, stdout: `${translate("cli.orchestration.execution", { id: execution.id, status: execution.status, assistant: assistantLabel(execution.target.provider), model: execution.target.model ?? translate("cli.orchestration.legacyModel") })}\n`, stderr: "" };
}

function humanV23Profile(data: unknown): string {
  if (data === null) return "No Norn 2.3 execution profile is configured.";
  if (isRecord(data) && Array.isArray(data["checks"])) {
    const checks = data["checks"] as Array<Record<string, unknown>>;
    return [`Profile health: ${data["healthy"] === true ? "healthy" : "blocked"}`, ...checks.map((check) => `- ${humanScalar(check["profileId"], "configuration")}: ${humanScalar(check["message"] ?? check["code"], "unknown")}`)].join("\n");
  }
  if (isRecord(data) && Array.isArray(data["profiles"])) {
    const profiles = data["profiles"] as Array<Record<string, unknown>>;
    return [`Automatic orchestration: ${data["automaticEnabled"] === true ? "enabled" : "disabled"}`, ...profiles.map((profile) => `- ${String(profile["id"])}: ${String(profile["transport"])} → ${String(profile["provider"])}/${String(profile["model"])} (${profile["enabled"] === true ? "enabled" : "disabled"})`)].join("\n");
  }
  return "Execution profile operation completed.";
}

function humanRecovery(data: unknown): string {
  if (!isRecord(data)) return "Recovery operation completed.";
  if (Array.isArray(data["entries"])) return `Recovery manifest ${String(data["fingerprint"])}: ${data["entries"].length} entries, ${Array.isArray(data["exactDuplicateAgentGroups"]) ? data["exactDuplicateAgentGroups"].length : 0} duplicate Agent groups.`;
  if (typeof data["id"] === "string") return `Recovery quarantine ${data["id"]}: ${String(data["manifestFingerprint"])}.`;
  if (Array.isArray(data["profiles"])) return `Legacy policy imported as ${data["profiles"].length} disabled Norn 2.3 profile(s).`;
  return "Recovery operation completed.";
}

function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function humanScalar(value: unknown, fallback: string): string { return typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : fallback; }

function serializeV23Preview(preview: OrchestrationV23Preview) {
  const plan = preview.plan?.props;
  return {
    schemaVersion: preview.schemaVersion,
    eligible: preview.eligible,
    plan: plan === undefined ? null : { ...plan, snapshot: { ...plan.snapshot, declaredUntracked: [...plan.snapshot.declaredUntracked] }, tasks: plan.tasks.map((task) => ({ ...task })), createdAt: plan.createdAt.toISOString() },
    tasks: preview.tasks.map((task) => ({ ...task })),
    profiles: preview.profiles.map((profile) => ({ ...profile })),
    preflights: preview.preflights.map((preflight) => ({ ...preflight })),
    issues: preview.issues.map((issue) => ({ ...issue })),
    riskPolicyFingerprint: preview.riskPolicyFingerprint,
  };
}

function serializeV23Run(run: OrchestrationV23RunResult) { return { campaignId: run.campaignId, projection: { ...run.projection, tasks: { ...run.projection.tasks }, progress: { ...run.projection.progress } }, artifact: run.artifact === undefined ? null : { ...run.artifact, recordedAt: run.artifact.recordedAt.toISOString() }, application: run.application === undefined ? null : { ...run.application, recordedAt: run.application.recordedAt.toISOString() } }; }
function serializeV23Status(status: OrchestrationV23Status) { return { schemaVersion: status.schemaVersion, projectId: status.projectId, campaigns: status.campaigns.map((campaign) => ({ id: campaign.id, projection: campaign.projection === undefined ? null : { ...campaign.projection, tasks: { ...campaign.projection.tasks }, progress: { ...campaign.projection.progress } }, result: campaign.result === undefined ? null : { ...campaign.result, recordedAt: campaign.result.recordedAt.toISOString() }, application: campaign.application === undefined ? null : { ...campaign.application, recordedAt: campaign.application.recordedAt.toISOString() } })) }; }
function humanV23Preview(preview: ReturnType<typeof serializeV23Preview>): string { return [`Campaign preview: ${preview.eligible ? "eligible" : "blocked"}`, `DAG: ${preview.tasks.map((task) => `${task.id}[${task.writeScopes.join(",")}]${task.dependencies.length === 0 ? "" : `<-${task.dependencies.join(",")}`}`).join(" · ")}`, `Profiles: ${preview.profiles.map((profile) => `${profile.id}=${profile.transport}:${profile.provider}/${profile.model} (${profile.costMetric}${profile.costObservable ? " measured" : " unknown"})`).join(" · ") || "none"}`, `Preflights: ${preview.preflights.map((check) => `${check.profileId}:${check.code}`).join(" · ") || "none"}`, `Risks: ${preview.issues.map((issue) => issue.code).join(", ") || "none"}`, `Plan fingerprint: ${preview.plan?.fingerprint ?? "unavailable"}`, `Risk policy fingerprint: ${preview.riskPolicyFingerprint}`].join("\n"); }
function humanV23Run(run: ReturnType<typeof serializeV23Run>): string { return [`Campaign ${run.campaignId}: ${run.projection.status}`, `Tasks: ${run.projection.progress.succeeded}/${run.projection.progress.attempted} succeeded, ${run.projection.progress.failed} failed`, ...(run.artifact === null ? [] : [`Application fingerprint: ${run.application?.fingerprint ?? run.artifact.fingerprint}`, `Risk: ${run.artifact.risk.totalScore} (${run.artifact.risk.hardDenials.join(", ") || "no hard denial"})`, ...(run.artifact.applicationGate === undefined ? [] : [`Application gate: ${run.artifact.applicationGate.code} — ${run.artifact.applicationGate.message}`])]), ...(run.application === null ? [] : [`Applied commit: ${run.application.appliedCommit}`])].join("\n"); }
function humanV23Status(status: ReturnType<typeof serializeV23Status>): string { return [`Norn 2.3 campaigns for ${status.projectId}: ${status.campaigns.length}`, ...status.campaigns.map((campaign) => `- ${campaign.id}: ${campaign.projection?.status ?? "planned"} (${campaign.projection?.progress.succeeded ?? 0} succeeded)`) ].join("\n"); }

function csv(value: string): string[] { return value === "" ? [] : value.split(",").map((entry) => entry.trim()).filter((entry) => entry !== ""); }
function roleProfiles(value: string): Readonly<Record<string, string>> { const output: Record<string, string> = {}; for (const entry of csv(value)) { const index = entry.indexOf("="); if (index <= 0 || index === entry.length - 1) throw new CliUsageError("--profiles must use role=profile entries"); const role = entry.slice(0, index); const profile = entry.slice(index + 1); if (!/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(role) || !/^[a-z0-9][a-z0-9._-]{0,79}$/u.test(profile) || output[role] !== undefined) throw new CliUsageError("--profiles contains an invalid or duplicate role"); output[role] = profile; } return output; }
function applyMode(value: string): "human" | "automatic" { if (value !== "human" && value !== "automatic") throw new CliUsageError("--apply must be human or automatic"); return value; }
function budgetMode(value: string): BudgetMode { if (value !== "admission" && value !== "hard-stop" && value !== "observe") throw new CliUsageError("--budget-mode must be admission, hard-stop or observe"); return value; }
function parallelism(value: string): number | "all" { if (value === "all") return value; return boundedInteger(value, "max-parallel", 1, 32); }
function boundedInteger(value: string, name: string, minimum: number, maximum: number): number { const parsed = Number(value); if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new CliUsageError(`--${name} must be an integer between ${minimum} and ${maximum}`); return parsed; }
function budgetLimits(value: string): BudgetLimit[] { return csv(value).map((entry) => { const [profileId, metric, maximum, extra] = entry.split(":"); if (extra !== undefined || profileId === undefined || metric === undefined || maximum === undefined || !["cli_quota_percent", "currency_eur", "calls", "duration_seconds"].includes(metric)) throw new CliUsageError("--budget-limits must use profile:metric:maximum entries"); const parsed = Number(maximum); if (!Number.isFinite(parsed) || parsed <= 0) throw new CliUsageError("budget maximum must be positive"); return { profileId, metric: metric as BudgetLimit["metric"], maximum: parsed }; }); }

function failure(command: string, error: unknown, json: boolean): CliExecution {
  const message = error instanceof Error ? error.message : String(error);
  const code = errorCode(error);
  if (json) return { code, stdout: jsonEnvelope({ command, ok: false, data: null, errors: [message], errorCode: "orchestration_command_failed" }), stderr: "" };
  return { code, stdout: "", stderr: `${translate("common.error", { message })}\n` };
}

function errorCode(error: unknown): number {
  if (error instanceof CliUsageError) return 64;
  if (error instanceof DomainError) {
    if (["PROJECT_NOT_FOUND", "PROJECT_MARKER_NOT_FOUND", "FEATURE_NOT_FOUND", "FEATURE_MARKER_NOT_FOUND", "FILE_NOT_FOUND"].includes(error.code)) return 4;
    if (["PROJECT_ALREADY_EXISTS", "FEATURE_ALREADY_EXISTS", "LOCK_CONFLICT"].includes(error.code)) return 5;
    if (["INVALID_PROJECT_ID", "INVALID_FEATURE_ID", "INVALID_PROJECT_OPTION", "INVALID_FEATURE_OPTION"].includes(error.code)) return 64;
    return 3;
  }
  return 3;
}

function serializeStatus(status: OrchestrationStatus) {
  return {
    schemaVersion: status.schemaVersion,
    projectId: status.projectId,
    orchestrationMode: status.orchestrationMode,
    policy: status.policy === undefined ? null : serializePolicy(status.policy),
    executions: status.executions.map(serializeExecution),
    activeExecution: status.activeExecution === undefined ? null : serializeExecution(status.activeExecution),
    latestExecution: status.latestExecution === undefined ? null : serializeExecution(status.latestExecution),
    actionRequired: status.actionRequired === undefined ? null : { ...status.actionRequired },
    activeCampaign: status.activeCampaign === undefined ? null : serializeCampaign(status.activeCampaign),
    latestCampaign: status.latestCampaign === undefined ? null : serializeCampaign(status.latestCampaign),
    projection: status.projection ?? null,
  };
}

function serializePolicy(policy: ExecutionPolicy) {
  return {
    schemaVersion: policy.schemaVersion,
    projectId: policy.projectId.value,
    selectionMode: policy.selectionMode,
    workspaceMode: policy.workspaceMode,
    providers: policy.providers.map((provider) => ({
      provider: provider.provider,
      adapter: provider.adapter,
      enabled: provider.enabled,
      priority: provider.priority,
      capabilities: [...provider.capabilities],
      permissions: [...provider.permissions],
      models: provider.models.map((model) => ({ ...model })),
    })),
    createdAt: policy.createdAt.toISOString(),
    updatedAt: policy.updatedAt.toISOString(),
  };
}

function serializeCampaign(campaign: OrchestrationCampaign) {
  const value = campaign.props;
  return { ...value, projectId: value.projectId.value, featureId: value.featureId.value, target: { ...value.target }, scopePaths: [...value.scopePaths], missionIds: [...value.missionIds], createdAt: value.createdAt.toISOString(), updatedAt: value.updatedAt.toISOString() };
}

function serializeExecution(record: ExecutionRecord) {
  return {
    id: record.id,
    target: {
      provider: record.target.provider,
      adapter: record.target.adapter,
      ...(record.target.model === undefined ? {} : { model: record.target.model }),
      source: record.target.source,
    },
    provider: record.provider,
    status: record.status,
    order: {
      id: record.order.id,
      scope: {
        projectId: record.order.scope.projectId.value,
        ...(record.order.scope.featureId === undefined ? {} : { featureId: record.order.scope.featureId.value }),
        paths: [...record.order.scope.paths],
      },
      preconditions: { ...record.order.preconditions },
      requiredCapabilities: [...record.order.requiredCapabilities],
      requiredPermissions: [...record.order.requiredPermissions],
      summary: record.order.summary,
      issuedAt: record.order.issuedAt.toISOString(),
    },
    attempts: record.attempts.map((attempt) => ({
      number: attempt.number,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      ...(attempt.endedAt === undefined ? {} : { endedAt: attempt.endedAt.toISOString() }),
      ...(attempt.providerSessionId === undefined ? {} : { providerSessionId: attempt.providerSessionId }),
    })),
    events: record.events.map((event) => ({ at: event.at.toISOString(), type: event.type, detail: event.detail })),
    truncatedEventCount: record.truncatedEventCount,
    proofReferences: [...record.proofReferences],
    ...(record.suspensionReason === undefined ? {} : { suspensionReason: { ...record.suspensionReason } }),
    ...(record.providerSessionId === undefined ? {} : { providerSessionId: record.providerSessionId }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function serializePreview(preview: OrchestrationPreview) {
  return {
    schemaVersion: preview.schemaVersion,
    projectId: preview.projectId,
    featureId: preview.featureId,
    featureName: preview.featureName,
    stepId: preview.stepId,
    role: preview.role,
    summary: preview.summary,
    logicalRoot: preview.logicalRoot ?? null,
    workspaceMode: preview.workspaceMode ?? "unconfigured",
    maximumMissions: preview.maximumMissions ?? 0,
    scopePaths: [...preview.scopePaths],
    requiredCapabilities: [...preview.requiredCapabilities],
    requiredPermissions: [...preview.requiredPermissions],
    candidates: preview.candidates.map((candidate) => ({
      target: {
        provider: candidate.target.provider,
        adapter: candidate.target.adapter,
        ...(candidate.target.model === undefined ? {} : { model: candidate.target.model }),
        source: candidate.target.source,
      },
      eligible: candidate.eligible,
      reasons: [...candidate.reasons],
      recommended: candidate.recommended,
      ...(candidate.runtimeVersion === undefined ? {} : { runtimeVersion: candidate.runtimeVersion }),
      ...(candidate.runtimeFingerprint === undefined ? {} : { runtimeFingerprint: candidate.runtimeFingerprint }),
    })),
    fingerprint: preview.fingerprint,
  };
}

function humanStatus(status: ReturnType<typeof serializeStatus>): string {
  const active = status.activeExecution ?? status.latestExecution;
  const noModel = translate("cli.orchestration.noModel");
  return [
    translate("cli.orchestration.status", { project: status.projectId, state: translate(status.orchestrationMode === "automatic" ? "cli.orchestration.enabled" : "cli.orchestration.paused") }),
    translate("cli.orchestration.assistants", { assistants: status.policy === null ? noModel : status.policy.providers.flatMap((provider) => provider.models.filter((model) => model.enabled).map((model) => `${assistantLabel(provider.provider)} ${model.id}`)).join(", ") || noModel }),
    translate("cli.orchestration.mission", { mission: active === null ? translate("cli.orchestration.none") : `${active.id} - ${active.status} - ${assistantLabel(active.target.provider)} / ${active.target.model ?? translate("cli.orchestration.legacyModel")}` }),
    translate("cli.orchestration.expectedAction", { action: status.actionRequired === null ? translate("cli.orchestration.none") : `${status.actionRequired.kind} (${status.actionRequired.reason})` }),
  ].join("\n");
}

function humanPolicy(policy: ReturnType<typeof serializePolicy>): string {
  const models = policy.providers.flatMap((provider) => provider.models
    .filter((model) => model.enabled)
    .map((model) => `${assistantLabel(provider.provider)} / ${model.id}`));
  return translate("cli.orchestration.policy", { models: models.join(", ") || translate("cli.orchestration.none") });
}

function humanPreview(preview: ReturnType<typeof serializePreview>): string {
  const assistants = preview.candidates.map((candidate) => {
    const availability = candidate.eligible ? translate("cli.orchestration.ready") : candidate.reasons.join(", ");
    return `${assistantLabel(candidate.target.provider)} / ${candidate.target.model ?? translate("cli.orchestration.legacyModel")}: ${availability}`;
  });
  return [
    translate("cli.orchestration.feature", { feature: preview.featureName }),
    translate("cli.orchestration.work", { summary: preview.summary }),
    translate("cli.orchestration.available", { assistants: assistants.join(" - ") || translate("cli.orchestration.none") }),
    translate("cli.orchestration.fingerprint", { fingerprint: preview.fingerprint }),
  ].join("\n");
}

function assistantLabel(provider: "claude" | "codex" | "kimi" | "zai"): string {
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "kimi") return "Kimi Platform";
  return "Z.AI Coding Plan";
}
