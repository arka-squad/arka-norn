/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash } from "node:crypto";

import { FeatureId } from "../domain/feature/feature-id.js";
import type { ExecutionProfile } from "../domain/orchestration/execution-profile.js";
import { CampaignBudget } from "../domain/orchestration/orchestration-budget.js";
import { projectCampaignEvents, type CampaignEvent, type CampaignEventKind, type CampaignEventProjection } from "../domain/orchestration/orchestration-event.js";
import { RunAuthorization, TaskAttempt, type BudgetLimit, type BudgetMode, type CampaignPlan, type TaskPlan } from "../domain/orchestration/orchestration-plan.js";
import { assessRisk } from "../domain/orchestration/orchestration-risk.js";
import type { ProjectId } from "../domain/project/project-id.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import type { ExecutionProfileRuntimePort, PreparedExecutionProfileRuntime, ProfilePreflightResult } from "../ports/outbound/execution-profile-runtime.js";
import type { GitTaskCommit, GitTaskWorkspace, GitWorkspacePort } from "../ports/outbound/git-workspace.js";
import type { OrchestrationCampaignV23Store, ApplicationGate, CampaignApplicationArtifact, CampaignResultArtifact } from "../ports/outbound/orchestration-campaign-v23-store.js";
import type { OrchestrationConfigurationStore } from "../ports/outbound/orchestration-configuration-store.js";
import type { OrchestrationEventStore } from "../ports/outbound/orchestration-event-store.js";
import type { TaskWorkerPort } from "../ports/outbound/task-worker.js";
import { createCampaignPlan, loadTaskPlans } from "./orchestration-v23-plan-builder.js";

export interface OrchestrationV23Preview {
  readonly schemaVersion: 1;
  readonly eligible: boolean;
  readonly plan?: CampaignPlan;
  readonly tasks: readonly TaskPlan[];
  readonly preflights: readonly ProfilePreflightResult[];
  readonly profiles: readonly { readonly id: string; readonly transport: string; readonly provider: string; readonly model: string; readonly costMetric: string; readonly costObservable: boolean }[];
  readonly issues: readonly { readonly code: string; readonly message: string }[];
  readonly riskPolicyFingerprint: string;
}

export interface OrchestrationV23StartInput {
  readonly projectId: ProjectId;
  readonly previewFingerprint: string;
  readonly actor: string;
  readonly profileByRole: Readonly<Record<string, string>>;
  readonly allowCommits: boolean;
  readonly applyMode: "human" | "automatic";
  readonly automaticRiskThreshold: number;
  readonly maxParallel: number | "all";
  readonly budgetMode: BudgetMode;
  readonly budgetLimits: readonly BudgetLimit[];
  readonly openBarProfiles: readonly string[];
  readonly riskPolicyFingerprint: string;
}

export interface OrchestrationV23RunResult {
  readonly campaignId: string;
  readonly projection: CampaignEventProjection;
  readonly artifact?: CampaignResultArtifact;
  readonly application?: CampaignApplicationArtifact;
}

export interface OrchestrationV23Status {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly campaigns: readonly { readonly id: string; readonly projection?: CampaignEventProjection; readonly result?: CampaignResultArtifact; readonly application?: CampaignApplicationArtifact }[];
}

export interface OrchestrationV23Runtime {
  preview(input: { readonly projectId: ProjectId; readonly featureId: FeatureId; readonly declaredUntracked?: readonly string[] }): Promise<OrchestrationV23Preview>;
  start(input: OrchestrationV23StartInput): Promise<OrchestrationV23RunResult>;
  status(input: { readonly projectId: ProjectId }): Promise<OrchestrationV23Status>;
  apply(input: { readonly projectId: ProjectId; readonly campaignId: string; readonly confirmationFingerprint: string }): Promise<OrchestrationV23RunResult>;
}

export function createOrchestrationV23Runtime(deps: {
  readonly projects: ForProjects;
  readonly features: ForFeatures;
  readonly agents: ForAgents;
  readonly configurations: OrchestrationConfigurationStore;
  readonly campaigns: OrchestrationCampaignV23Store;
  readonly events: OrchestrationEventStore;
  readonly git: GitWorkspacePort;
  readonly profiles: ExecutionProfileRuntimePort;
  readonly worker: TaskWorkerPort;
  readonly now?: () => Date;
}): OrchestrationV23Runtime {
  const now = deps.now ?? (() => new Date());

  return {
    async preview(input): Promise<OrchestrationV23Preview> {
      const project = await deps.projects.show(input.projectId);
      const feature = await deps.features.show(input.featureId);
      if (!feature.belongsTo(project.id)) throw new Error("Feature does not belong to the selected Project.");
      const configuration = await deps.configurations.load(project);
      if (project.orchestrationMode !== "automatic" || configuration?.automaticEnabled !== true) throw new Error("Norn 2.3 automatic orchestration is not activated for this Project.");
      const campaignId = newCampaignId(feature.id.value, now());
      const issues: { code: string; message: string }[] = [];
      let assigned: Awaited<ReturnType<typeof loadTaskPlans>> | undefined;
      try { assigned = await loadTaskPlans(feature, project, await deps.agents.list(project)); }
      catch (error) { issues.push({ code: classifyPlanningError(error), message: safeMessage(error) }); }
      const tasks = assigned?.tasks ?? [];
      let plan: CampaignPlan | undefined;
      try { if (assigned !== undefined) {
        const snapshot = await deps.git.createSnapshot(project, { campaignId, includeScopes: unionScopes(tasks), declaredUntracked: input.declaredUntracked ?? [] });
        plan = createCampaignPlan({ campaignId, projectId: project.id.value, featureId: feature.id.value, snapshot, tasks, integrationAgentId: assigned.integrationAgentId, createdAt: now(), maximumParallelism: 32 });
      } } catch (error) {
        issues.push({ code: classifyWorkspaceError(error), message: safeMessage(error) });
      }
      const enabled = configuration.profiles.filter((profile) => profile.enabled);
      const preflights = await Promise.all(enabled.map((profile) => deps.profiles.preflight(profile, project.root)));
      issues.push(...preflights.filter((preflight) => !preflight.healthy).map((preflight) => ({ code: preflight.code, message: `${preflight.profileId}: ${preflight.message}` })));
      if (enabled.length === 0) issues.push({ code: "gateway_profile_missing", message: "No enabled execution profile is configured." });
      const eligible = plan !== undefined && preflights.some((preflight) => preflight.healthy);
      if (eligible) await deps.campaigns.savePlan(plan!);
      return Object.freeze({ schemaVersion: 1, eligible, ...(plan === undefined ? {} : { plan }), tasks: Object.freeze([...tasks]), preflights: Object.freeze(preflights), profiles: Object.freeze(enabled.map((profile) => Object.freeze({ id: profile.id, transport: profile.transport, provider: profile.provider, model: profile.model, costMetric: profile.props.costMeter.kind, costObservable: profile.props.costMeter.observable }))), issues: Object.freeze(issues), riskPolicyFingerprint: policyFingerprint(configuration.props.riskPolicy) });
    },

    async start(input): Promise<OrchestrationV23RunResult> {
      const project = await deps.projects.show(input.projectId);
      const configuration = await deps.configurations.load(project);
      if (project.orchestrationMode !== "automatic" || configuration?.automaticEnabled !== true) throw new Error("Norn 2.3 automatic orchestration is not activated for this Project.");
      const plan = await deps.campaigns.findPlanByFingerprint(project.id.value, input.previewFingerprint);
      if (plan === undefined) throw new Error("The confirmed campaign plan fingerprint was not found.");
      const feature = await deps.features.show(featureIdOf(plan.props.featureId));
      const refreshed = await loadTaskPlans(feature, project, await deps.agents.list(project));
      if (stableTaskInputs(refreshed) !== stableTaskInputs({ tasks: plan.tasks, integrationAgentId: plan.props.integrationAgentId })) {
        throw new Error("The Feature framing plan, Lots or Agent assignments changed after preview; authorize a new preview fingerprint.");
      }
      if (input.riskPolicyFingerprint !== policyFingerprint(configuration.props.riskPolicy)) throw new Error("The Project risk policy changed after preview.");
      const configuredProfiles = new Map(configuration.profiles.map((profile) => [profile.id, profile]));
      const selectedIds = [...new Set(Object.values(input.profileByRole))];
      const selected = selectedIds.map((id) => configuredProfiles.get(id)).filter((profile) => profile !== undefined);
      if (selected.length !== selectedIds.length || selected.some((profile) => !profile.enabled)) throw new Error("Run authorization selects a missing or disabled execution profile.");
      for (const task of plan.tasks) assertProfileRequirement(task.role, configuredProfiles.get(input.profileByRole[task.role] ?? ""), task.requiredProfile);
      assertProfileRequirement(plan.props.integrationRole, configuredProfiles.get(input.profileByRole[plan.props.integrationRole] ?? ""), plan.props.integrationRequiredProfile);
      const profileFingerprintByRole = Object.fromEntries(Object.entries(input.profileByRole).map(([role, profileId]) => [role, executionProfileFingerprint(configuredProfiles.get(profileId)!)]));
      const authorization = RunAuthorization.create({ schemaVersion: 1, campaignPlanFingerprint: plan.fingerprint, actor: input.actor, profileByRole: input.profileByRole, profileFingerprintByRole, allowCommits: input.allowCommits, applyMode: input.applyMode, automaticRiskThreshold: input.automaticRiskThreshold, maxParallel: input.maxParallel, budgetMode: input.budgetMode, budgetLimits: input.budgetLimits, openBarProfiles: input.openBarProfiles, riskPolicyFingerprint: input.riskPolicyFingerprint, confirmedAt: now() }, plan);
      const preflights = await Promise.all(selected.map((profile) => deps.profiles.preflight(profile, project.root)));
      const unhealthy = preflights.filter((preflight) => !preflight.healthy);
      if (unhealthy.length > 0) throw new Error(`Authorized execution profile preflight failed: ${unhealthy.map((value) => `${value.profileId}/${value.code}`).join(", ")}`);
      const prepared = new Map<string, PreparedExecutionProfileRuntime>();
      for (const profile of selected) prepared.set(profile.id, await deps.profiles.prepare(profile));
      await deps.campaigns.saveAuthorization(project.id.value, plan.props.id, authorization);
      const emit = eventWriter(deps.events, project.id.value, plan.props.id, now);
      await emit("campaign_planned", undefined, plan.fingerprint);
      await emit("campaign_authorized", undefined, authorizationFingerprint(authorization.props));
      try {
        return await runCampaign({ project, plan, authorization, configuration, configuredProfiles, prepared, emit, deps, now });
      } catch (error) {
        await emit("campaign_blocked", undefined, normalizeCode(safeMessage(error))).catch(() => undefined);
        throw error;
      }
    },

    async status(input): Promise<OrchestrationV23Status> {
      const project = await deps.projects.show(input.projectId);
      const ids = await deps.campaigns.listCampaignIds(project.id.value);
      const campaigns = await Promise.all(ids.map(async (id) => {
        const projection = projectCampaignEvents(await deps.events.load(project.id.value, id));
        const result = await deps.campaigns.loadResult(project.id.value, id);
        const application = await deps.campaigns.loadApplication(project.id.value, id);
        return Object.freeze({ id, ...(projection === undefined ? {} : { projection }), ...(result === undefined ? {} : { result }), ...(application === undefined ? {} : { application }) });
      }));
      return Object.freeze({ schemaVersion: 1, projectId: project.id.value, campaigns: Object.freeze(campaigns) });
    },

    async apply(input): Promise<OrchestrationV23RunResult> {
      const project = await deps.projects.show(input.projectId);
      const plan = await deps.campaigns.loadPlan(project.id.value, input.campaignId);
      const artifact = await deps.campaigns.loadResult(project.id.value, input.campaignId);
      if (plan === undefined || artifact === undefined) throw new Error("Campaign application candidate was not found.");
      if (artifact.fingerprint !== input.confirmationFingerprint) throw new Error("Campaign application fingerprint does not match the candidate.");
      if (artifact.risk.hardDenials.length > 0) throw new Error("A candidate with a global risk denial cannot be applied.");
      if (await deps.campaigns.loadApplication(project.id.value, input.campaignId) !== undefined) throw new Error("Campaign candidate is already applied.");
      const appliedCommit = await deps.git.applyFastForward(project, plan.props.snapshot, artifact.integration);
      const applicationCandidate = { schemaVersion: 1 as const, candidateFingerprint: artifact.fingerprint, appliedCommit, recordedAt: now() };
      const application: CampaignApplicationArtifact = Object.freeze({ ...applicationCandidate, fingerprint: resultFingerprint(applicationCandidate) });
      await deps.campaigns.saveApplication(project.id.value, input.campaignId, application);
      const emit = eventWriter(deps.events, project.id.value, input.campaignId, now, (await deps.events.load(project.id.value, input.campaignId)).length);
      await emit("campaign_completed", undefined, application.fingerprint);
      const projection = projectCampaignEvents(await deps.events.load(project.id.value, input.campaignId))!;
      return Object.freeze({ campaignId: input.campaignId, projection, artifact, application });
    },
  };
}

async function runCampaign(input: {
  readonly project: Awaited<ReturnType<ForProjects["show"]>>;
  readonly plan: CampaignPlan;
  readonly authorization: RunAuthorization;
  readonly configuration: NonNullable<Awaited<ReturnType<OrchestrationConfigurationStore["load"]>>>;
  readonly configuredProfiles: ReadonlyMap<string, ExecutionProfile>;
  readonly prepared: ReadonlyMap<string, PreparedExecutionProfileRuntime>;
  readonly emit: EventWriter;
  readonly deps: Parameters<typeof createOrchestrationV23Runtime>[0];
  readonly now: () => Date;
}): Promise<OrchestrationV23RunResult> {
  const completed = new Set<string>();
  const terminalFailures = new Set<string>();
  const pending = new Set(input.plan.tasks.map((task) => task.id));
  const commits = new Map<string, GitTaskCommit>();
  const budget = new CampaignBudget(input.authorization);
  const hardStop = new AbortController();
  const parallel = input.authorization.props.maxParallel === "all" ? input.plan.tasks.length : input.authorization.props.maxParallel;
  while (pending.size > 0) {
    for (const task of input.plan.tasks) {
      if (!pending.has(task.id) || !task.dependencies.some((dependency) => terminalFailures.has(dependency))) continue;
      pending.delete(task.id); terminalFailures.add(task.id);
      await input.emit("task_blocked", task.id, "dependency_failed");
    }
    const ready = input.plan.ready([...completed], []).filter((task) => pending.has(task.id)).slice(0, parallel);
    if (ready.length === 0) break;
    const workspaces = await allocateReadyWorkspaces(ready, input);
    const results = await Promise.all(ready.map((task) => executeTask(task, input, budget, workspaces.get(task.id)!, hardStop)));
    for (const result of results) {
      pending.delete(result.taskId);
      if (result.commit === undefined) terminalFailures.add(result.taskId);
      else { completed.add(result.taskId); commits.set(result.taskId, result.commit); }
    }
  }
  if (pending.size > 0) for (const taskId of pending) { terminalFailures.add(taskId); await input.emit("task_blocked", taskId, "dag_unreachable"); }
  if (terminalFailures.size > 0) {
    await input.emit("campaign_blocked", undefined, "task_failure");
    return currentResult(input.project.id.value, input.plan.props.id, input.deps.events);
  }
  const orderedCommits = input.plan.tasks.map((task) => commits.get(task.id)!);
  let integration = await input.deps.git.integrate(input.project, input.plan.props.snapshot, input.plan.props.id, orderedCommits);
  if (integration.status === "conflicted") integration = await resolveIntegration(input, integration, budget);
  if (integration.status === "conflicted") { await input.emit("campaign_blocked", undefined, "integration_conflict"); return currentResult(input.project.id.value, input.plan.props.id, input.deps.events); }
  const riskChanges = await input.deps.git.inspectRiskChanges(input.project, input.plan.props.snapshot, integration, orderedCommits);
  const policy = { ...input.configuration.props.riskPolicy, automaticThreshold: Math.min(input.configuration.props.riskPolicy.automaticThreshold, input.authorization.props.automaticRiskThreshold) };
  const risk = assessRisk(riskChanges, policy, 0);
  let appliedCommit: string | undefined;
  let applicationGate = determineApplicationGate(input, risk.automaticEligible, integration.requiresHumanApproval === true);
  if (applicationGate === undefined) {
    try { appliedCommit = await input.deps.git.applyFastForward(input.project, input.plan.props.snapshot, integration); }
    catch (error) { applicationGate = { code: "baseline_diverged", message: safeMessage(error) }; }
  }
  const candidate = { schemaVersion: 1 as const, integration, commits: orderedCommits, risk, ...(appliedCommit === undefined ? {} : { appliedCommit }), ...(applicationGate === undefined ? {} : { applicationGate }), recordedAt: input.now() };
  const artifact: CampaignResultArtifact = Object.freeze({ ...candidate, fingerprint: resultFingerprint(candidate) });
  await input.deps.campaigns.saveResult(input.project.id.value, input.plan.props.id, artifact);
  await input.emit(appliedCommit === undefined ? "campaign_awaiting_application" : "campaign_completed", undefined, artifact.fingerprint);
  return currentResult(input.project.id.value, input.plan.props.id, input.deps.events, artifact);
}

async function allocateReadyWorkspaces(tasks: readonly TaskPlan[], input: Parameters<typeof runCampaign>[0]): Promise<ReadonlyMap<string, Promise<GitTaskWorkspace>>> {
  const allocations = new Map<string, Promise<GitTaskWorkspace>>();
  for (const task of tasks) {
    const allocation = input.deps.git.createTaskWorkspace(input.project, input.plan.props.snapshot, input.plan.props.id, task);
    allocations.set(task.id, allocation);
    await allocation.catch(() => undefined);
  }
  return allocations;
}

async function resolveIntegration(input: Parameters<typeof runCampaign>[0], conflict: Awaited<ReturnType<GitWorkspacePort["integrate"]>>, budget: CampaignBudget): Promise<Awaited<ReturnType<GitWorkspacePort["integrate"]>>> {
  const task: TaskPlan = { id: "integration", agentId: input.plan.props.integrationAgentId, role: input.plan.props.integrationRole, requiredProfile: input.plan.props.integrationRequiredProfile, priority: 10_000, dependencies: input.plan.tasks.map((entry) => entry.id), readScopes: ["."], writeScopes: conflict.conflictPaths.length === 0 ? ["."] : [...conflict.conflictPaths], deliverables: ["Resolve the recorded integration conflict without dropping validated intent."], validations: ["Run the declared test recipe after resolving the conflict."] };
  const profileId = input.authorization.profileFor(task.role);
  const profile = input.configuredProfiles.get(profileId);
  const runtime = input.prepared.get(profileId);
  const executionId = "execution-integration-1";
  const startedAt = input.now();
  if (profile === undefined || runtime === undefined || budget.before(profileId).action === "stop" || budget.before(profileId).action === "block_new") {
    await input.emit("task_blocked", task.id, "integration_profile_or_budget_unavailable");
    return input.deps.git.buildPriorityFallback(input.project, conflict);
  }
  await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "prepared", worktree: conflict.path, branch: conflict.branch, proofReferences: [] }));
  await input.emit("task_prepared", task.id, runtime.fingerprint);
  await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "running", worktree: conflict.path, branch: conflict.branch, proofReferences: [], startedAt }));
  await input.emit("task_started", task.id, runtime.fingerprint);
  let outcome: Awaited<ReturnType<TaskWorkerPort["execute"]>>;
  try {
    outcome = await input.deps.worker.execute({ executionId, campaignId: input.plan.props.id, projectId: input.project.id.value, featureId: input.plan.props.featureId, task, workspace: conflict.path, profile, runtime, timeoutMs: 60 * 60 * 1_000 });
  } catch (error) {
    await failIntegrationAttempt(input, task, profileId, executionId, conflict, startedAt, normalizeCode(safeMessage(error)), []);
    return input.deps.git.buildPriorityFallback(input.project, conflict);
  }
  const budgetDecision = budget.record(profileId, outcome.usage);
  if (outcome.status !== "succeeded" || !validProofs(outcome.proofReferences) || budgetDecision.action === "stop" || !input.authorization.props.allowCommits) {
    const code = budgetDecision.action === "stop" ? "budget_exceeded" : outcome.failure?.code ?? (!input.authorization.props.allowCommits ? "commit_not_authorized" : "integration_proof_missing");
    const status = budgetDecision.action === "stop" ? "budget_stopped" : "failed";
    await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status, worktree: conflict.path, branch: conflict.branch, proofReferences: outcome.proofReferences, failureCode: normalizeCode(code), startedAt, endedAt: input.now() }));
    await input.emit(status === "budget_stopped" ? "task_budget_stopped" : "task_failed", task.id, code);
    return input.deps.git.buildPriorityFallback(input.project, conflict);
  }
  let resolved: Awaited<ReturnType<GitWorkspacePort["resolveIntegrationConflict"]>>;
  try {
    resolved = await input.deps.git.resolveIntegrationConflict(input.project, conflict, { agentId: task.agentId, profileId, executionId, proofReferences: outcome.proofReferences });
  } catch (error) {
    await failIntegrationAttempt(input, task, profileId, executionId, conflict, startedAt, normalizeCode(safeMessage(error)), outcome.proofReferences);
    return input.deps.git.buildPriorityFallback(input.project, conflict);
  }
  if (resolved.status === "conflicted") resolved = await input.deps.git.buildPriorityFallback(input.project, resolved);
  const commit = resolved.commit;
  if (commit === undefined) {
    await failIntegrationAttempt(input, task, profileId, executionId, conflict, startedAt, "integration_commit_missing", outcome.proofReferences);
    return resolved;
  }
  await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "succeeded", worktree: conflict.path, branch: conflict.branch, commit, proofReferences: outcome.proofReferences, startedAt, endedAt: input.now() }));
  await input.emit("task_succeeded", task.id, digest(JSON.stringify(outcome.proofReferences)));
  return resolved;
}

async function failIntegrationAttempt(
  input: Parameters<typeof runCampaign>[0],
  task: TaskPlan,
  profileId: string,
  executionId: string,
  conflict: Awaited<ReturnType<GitWorkspacePort["integrate"]>>,
  startedAt: Date,
  code: string,
  proofs: readonly string[],
): Promise<void> {
  await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "failed", worktree: conflict.path, branch: conflict.branch, proofReferences: proofs, failureCode: code, startedAt, endedAt: input.now() })).catch(() => undefined);
  await input.emit("task_failed", task.id, code).catch(() => undefined);
}

async function executeTask(task: TaskPlan, input: Parameters<typeof runCampaign>[0], budget: CampaignBudget, workspaceAllocation: Promise<GitTaskWorkspace>, hardStop: AbortController): Promise<{ readonly taskId: string; readonly commit?: GitTaskCommit }> {
  if (hardStop.signal.aborted) { await input.emit("task_budget_stopped", task.id, "budget_exceeded"); return { taskId: task.id }; }
  const profileId = input.authorization.profileFor(task.role);
  const admission = budget.before(profileId);
  if (admission.action === "block_new" || admission.action === "stop") { await input.emit("task_budget_stopped", task.id, "budget_exceeded"); return { taskId: task.id }; }
  const profile = input.configuredProfiles.get(profileId);
  const runtime = input.prepared.get(profileId);
  if (profile === undefined || runtime === undefined) { await input.emit("task_blocked", task.id, "profile_missing"); return { taskId: task.id }; }
  const executionId = `execution-${task.id}-1`;
  const startedAt = input.now();
  let workspace: GitTaskWorkspace | undefined;
  const attemptJournal: { state: "none" | "prepared" | "running" | "terminal" } = { state: "none" };
  try {
    const allocatedWorkspace = await workspaceAllocation;
    workspace = allocatedWorkspace;
    await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "prepared", worktree: allocatedWorkspace.path, branch: allocatedWorkspace.branch, proofReferences: [] }));
    attemptJournal.state = "prepared";
    await input.emit("task_prepared", task.id, runtime.fingerprint);
    await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "running", worktree: allocatedWorkspace.path, branch: allocatedWorkspace.branch, proofReferences: [], startedAt }));
    attemptJournal.state = "running";
    await input.emit("task_started", task.id, runtime.fingerprint);
    const outcome = await input.deps.worker.execute({ executionId, campaignId: input.plan.props.id, projectId: input.project.id.value, featureId: input.plan.props.featureId, task, workspace: allocatedWorkspace.path, profile, runtime, timeoutMs: 60 * 60 * 1_000, signal: hardStop.signal });
    const budgetDecision = budget.record(profileId, outcome.usage);
    if (budgetDecision.action === "stop") {
      hardStop.abort();
      await terminalAttempt("budget_stopped", "budget_exceeded", outcome.proofReferences);
      await input.emit("task_budget_stopped", task.id, "budget_exceeded");
      return { taskId: task.id };
    }
    if (outcome.status !== "succeeded") {
      const status = outcome.status === "cancelled" ? "cancelled" : outcome.status === "blocked" ? "blocked" : "failed";
      await terminalAttempt(status, outcome.failure?.code ?? "worker_failed", outcome.proofReferences);
      await input.emit(status === "cancelled" ? "task_cancelled" : status === "blocked" ? "task_blocked" : "task_failed", task.id, outcome.failure?.code ?? "worker_failed");
      return { taskId: task.id };
    }
    if (!validProofs(outcome.proofReferences)) { await terminalAttempt("failed", "proof_missing", outcome.proofReferences); await input.emit("task_failed", task.id, "proof_missing"); return { taskId: task.id }; }
    if (!input.authorization.props.allowCommits) { await terminalAttempt("blocked", "commit_not_authorized", outcome.proofReferences); await input.emit("task_blocked", task.id, "commit_not_authorized"); return { taskId: task.id }; }
    const commit = await input.deps.git.commitTask(input.project, allocatedWorkspace, task, { campaignId: input.plan.props.id, agentId: task.agentId, profileId, executionId, proofReferences: outcome.proofReferences });
    await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "succeeded", worktree: allocatedWorkspace.path, branch: allocatedWorkspace.branch, commit: commit.commit, proofReferences: outcome.proofReferences, startedAt, endedAt: input.now() }));
    await input.emit("task_succeeded", task.id, commit.evidenceFingerprint);
    return { taskId: task.id, commit };

    async function terminalAttempt(status: "failed" | "blocked" | "budget_stopped" | "cancelled", code: string, proofs: readonly string[]): Promise<void> {
      await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status, worktree: allocatedWorkspace.path, branch: allocatedWorkspace.branch, proofReferences: proofs, failureCode: normalizeCode(code), startedAt, endedAt: input.now() }));
      attemptJournal.state = "terminal";
    }
  } catch (error) {
    const code = normalizeCode(safeMessage(error));
    if (workspace !== undefined && attemptJournal.state !== "none" && attemptJournal.state !== "terminal") {
      await input.deps.campaigns.appendAttempt(input.project.id.value, input.plan.props.id, TaskAttempt.create({ schemaVersion: 1, id: executionId, taskId: task.id, profileId, status: "failed", worktree: workspace.path, branch: workspace.branch, proofReferences: [], failureCode: code, startedAt, endedAt: input.now() })).catch(() => undefined);
    }
    await input.emit("task_failed", task.id, code).catch(() => undefined);
    return { taskId: task.id };
  }
}

type EventWriter = (kind: CampaignEventKind, taskId?: string, codeOrFingerprint?: string) => Promise<void>;
function eventWriter(store: OrchestrationEventStore, projectId: string, campaignId: string, now: () => Date, initialRevision = 0): EventWriter {
  let revision = initialRevision;
  let queue = Promise.resolve();
  return async (kind, taskId, codeOrFingerprint): Promise<void> => {
    queue = queue.then(async () => {
      revision += 1;
      const code = codeOrFingerprint !== undefined && !/^[a-f0-9]{64}$/u.test(codeOrFingerprint) ? normalizeCode(codeOrFingerprint) : undefined;
      const fingerprint = codeOrFingerprint !== undefined && /^[a-f0-9]{64}$/u.test(codeOrFingerprint) ? codeOrFingerprint : digest(JSON.stringify({ campaignId, revision, kind, taskId, code, at: now().toISOString() }));
      const event: CampaignEvent = { schemaVersion: 1, campaignId, revision, kind, ...(taskId === undefined ? {} : { taskId }), ...(code === undefined ? {} : { code }), fingerprint, at: now() };
      await store.append(projectId, event);
    });
    await queue;
  };
}

async function currentResult(projectId: string, campaignId: string, events: OrchestrationEventStore, artifact?: CampaignResultArtifact): Promise<OrchestrationV23RunResult> { const projection = projectCampaignEvents(await events.load(projectId, campaignId)); if (projection === undefined) throw new Error("Campaign event projection is unavailable."); return Object.freeze({ campaignId, projection, ...(artifact === undefined ? {} : { artifact }) }); }
function unionScopes(tasks: readonly TaskPlan[]): string[] { const scopes = [...new Set(tasks.flatMap((task) => [...task.writeScopes]))]; return scopes.includes(".") ? ["."] : scopes.sort(); }
function policyFingerprint(value: unknown): string { return digest(JSON.stringify(value)); }
function authorizationFingerprint(value: unknown): string { return digest(JSON.stringify(value, dateReplacer)); }
function resultFingerprint(value: unknown): string { return digest(JSON.stringify(value, dateReplacer)); }
function newCampaignId(featureId: string, at: Date): string { const feature = featureId.toLocaleLowerCase("en").replace(/[^a-z0-9._-]+/gu, "-").slice(0, 72); return `campaign-${feature}-${at.getTime().toString(36)}`; }
function classifyWorkspaceError(error: unknown): string { const message = safeMessage(error); return /limit|too large|exceed/iu.test(message) ? "workspace_limit" : "workspace_unavailable"; }
function classifyPlanningError(error: unknown): string { const message = safeMessage(error); if (message.startsWith("agent_scope_ambiguous")) return "agent_scope_ambiguous"; if (message.startsWith("agent_scope_unavailable")) return "agent_scope_unavailable"; if (message.startsWith("scope_unresolvable")) return "scope_unresolvable"; if (message.startsWith("framing_plan_unpublished")) return "framing_plan_unpublished"; if (message.startsWith("framing_plan_divergent")) return "framing_plan_divergent"; return "task_plan_invalid"; }
function featureIdOf(value: string): FeatureId { return FeatureId.of(value); }
function stableTaskInputs(value: { readonly tasks: readonly TaskPlan[]; readonly integrationAgentId: string }): string {
  return JSON.stringify({ integrationAgentId: value.integrationAgentId, tasks: value.tasks.map((task) => ({
    ...task,
    dependencies: [...task.dependencies],
    readScopes: [...task.readScopes],
    writeScopes: [...task.writeScopes],
    deliverables: [...task.deliverables],
    validations: [...task.validations],
  })) });
}
function determineApplicationGate(input: Parameters<typeof runCampaign>[0], riskEligible: boolean, priorityFallback: boolean): ApplicationGate | undefined {
  if (input.authorization.props.applyMode !== "automatic") return { code: "human_policy", message: "The run authorization requires human application." };
  if (!input.plan.props.snapshot.clean) return { code: "dirty_snapshot", message: "The campaign snapshot contains authorized local changes and cannot be applied automatically." };
  if (!riskEligible) return { code: "risk_gate", message: "The candidate exceeds the authorized automatic-application risk policy." };
  if (priorityFallback) return { code: "priority_fallback", message: "The priority fallback discarded conflict hunks and requires human validation." };
  return undefined;
}
function safeMessage(error: unknown): string { return (error instanceof Error ? error.message : String(error)).replace(/[\u0000-\u001f\u007f]+/gu, " ").slice(0, 500); }
function normalizeCode(value: string): string { const normalized = value.toLocaleLowerCase("en").replace(/[^a-z0-9._-]+/gu, "_").replace(/^_+|_+$/gu, "").slice(0, 100); return /^[a-z0-9]/u.test(normalized) ? normalized : "orchestration_error"; }
function validProofs(values: readonly string[]): boolean { return values.some((value) => /^receipt-recipe-(?:test|build|typecheck|lint)-pass-/u.test(value)) && values.every((value) => /^receipt-[A-Za-z0-9-]+$/u.test(value)); }
function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }
function executionProfileFingerprint(profile: ExecutionProfile): string { return digest(JSON.stringify(profile.props, dateReplacer)); }
function assertProfileRequirement(role: string, profile: ExecutionProfile | undefined, requirement: TaskPlan["requiredProfile"]): void { if (profile === undefined || !requirement.transports.includes(profile.transport) || requirement.capabilities.some((capability) => !profile.props.capabilities.includes(capability))) throw new Error(`Execution profile for role ${role} does not satisfy the signed TaskPlan requirement.`); }
function dateReplacer(_key: string, value: unknown): unknown { return value instanceof Date ? value.toISOString() : value; }
