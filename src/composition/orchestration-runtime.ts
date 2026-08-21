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

import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { relative, resolve } from "node:path";

import { roleForStep } from "../application/agents/agent-orchestration.js";
import { FsExecutionRegistryStore } from "../adapters/outbound/filesystem/fs-orchestration-execution-registry-store.js";
import { FsOrchestrationPolicyStore } from "../adapters/outbound/filesystem/fs-orchestration-policy-store.js";
import { FsOrchestrationWorkerStateStore } from "../adapters/outbound/filesystem/fs-orchestration-worker-state-store.js";
import { FsAuditTrail } from "../adapters/outbound/filesystem/fs-audit-trail.js";
import { createMastraExecutionPort } from "../adapters/outbound/execution/mastra-agent-execution-adapter.js";
import { resolveAcpExecutable } from "../adapters/outbound/execution/secure-runtime.js";
import { SystemClock } from "../adapters/outbound/system/system-clock.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
import { loadVerifiedFeatureContext } from "./verified-feature-context.js";
import { AuditUnavailableError } from "../domain/errors.js";
import type { Feature } from "../domain/feature/feature.js";
import { MissionPreconditionError } from "../domain/orchestration/errors.js";
import {
  ExecutionPolicy,
  selectBestEligibleTarget,
  type ExecutionProviderHealth,
  type ExecutionRequirements,
  type ExecutionTargetHealth,
} from "../domain/orchestration/execution-policy.js";
import { ExecutionRecord, executionSuspensionReason } from "../domain/orchestration/execution-record.js";
import { containsSecretLikeText, MissionOrder, type MissionOrderContext } from "../domain/orchestration/mission-order.js";
import type { PipelineReport } from "../domain/pipeline/pipeline-report.js";
import {
  sameExecutionTarget,
  userExecutionTarget,
  type ExecutionCapability,
  type ExecutionPermission,
  type ExecutionProvider,
  type ExecutionTarget,
} from "../domain/orchestration/types.js";
import type { Project } from "../domain/project/project.js";
import { ProjectId } from "../domain/project/project-id.js";
import type { AgentInitializationPrompt, ForAgentOrchestration, OrchestratedAgentRole } from "../ports/inbound/for-agent-orchestration.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type {
  ForOrchestration,
  OrchestrationActionRequired,
  OrchestrationPreview,
  OrchestrationTargetSelection,
} from "../ports/inbound/for-orchestration.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import type { AgentExecutionMission, AgentExecutionOutcome, AgentExecutionPort } from "../ports/outbound/agent-execution-port.js";
import type { AuditEvent, AuditTrail } from "../ports/outbound/audit-trail.js";
import type { Clock } from "../ports/outbound/clock.js";
import type { ExecutionRegistryStore } from "../ports/outbound/execution-registry-store.js";
import type { OrchestrationPolicyStore } from "../ports/outbound/orchestration-policy-store.js";

/**
 * The automatic worker intentionally does not receive a shell capability.
 * A provider workspace is not an operating-system sandbox, so arbitrary
 * commands cannot be treated as a preauthorized Project write.
 */
const WRITE_CAPABILITIES: readonly ExecutionCapability[] = ["inspect_workspace", "modify_workspace", "read_pipeline"];
const WRITE_WORKER_PERMISSIONS: readonly ExecutionPermission[] = ["read_workspace", "write_workspace"];
const READ_ONLY_CAPABILITIES: readonly ExecutionCapability[] = ["inspect_workspace", "read_pipeline"];
const READ_ONLY_WORKER_PERMISSIONS: readonly ExecutionPermission[] = ["read_workspace"];
const CLAUDE_AUTOMATIC_CAPABILITIES: readonly ExecutionCapability[] = WRITE_CAPABILITIES;
// Z.AI uses the same structured Claude SDK tool gate as Claude. It is only
// offered after an explicit local enablement and credential check.
const ZAI_AUTOMATIC_CAPABILITIES: readonly ExecutionCapability[] = WRITE_CAPABILITIES;
// ACP permissions are opaque in V1. Codex and Kimi remain visible choices,
// but are not eligible for a Feature-writing mission until their adapter can
// prove a structured write scope.
const CODEX_ACP_SAFE_CAPABILITIES: readonly ExecutionCapability[] = READ_ONLY_CAPABILITIES;
const READ_ONLY_ANALYSIS_VERDICTS = ["no_blocker", "findings_require_review", "scope_change_required", "inconclusive"] as const;
type ReadOnlyAnalysisVerdict = typeof READ_ONLY_ANALYSIS_VERDICTS[number];
const POLL_INTERVAL_MS = 200;
const STALE_WORKER_AFTER_MS = 60_000;

export interface OrchestrationWorkerLaunch {
  readonly projectId: string;
  readonly executionId: string;
}

/** Launches a disposable local control worker. No PID is returned or persisted. */
export interface OrchestrationWorkerLauncher {
  launch(input: OrchestrationWorkerLaunch): Promise<void>;
}

export interface OrchestrationRuntime extends ForOrchestration {
  /** Internal entrypoint used only by `orchestration _worker`. */
  runWorker(input: OrchestrationWorkerLaunch): Promise<void>;
}

export interface OrchestrationRuntimeOptions {
  readonly homeDir: string;
  readonly frameworkRoot: string;
  readonly projects: ForProjects;
  readonly features: ForFeatures;
  readonly agents: ForAgents;
  readonly pipeline: ForPipeline;
  readonly agentOrchestration?: ForAgentOrchestration;
  readonly policyStore?: OrchestrationPolicyStore;
  readonly registryStore?: ExecutionRegistryStore;
  readonly workerStateStore?: FsOrchestrationWorkerStateStore;
  readonly executionPort?: AgentExecutionPort;
  readonly workerLauncher?: OrchestrationWorkerLauncher;
  readonly auditTrail?: AuditTrail;
  readonly clock?: Clock;
  readonly environment?: NodeJS.ProcessEnv;
  readonly providerHealth?: (project: Project) => readonly ExecutionProviderHealth[] | Promise<readonly ExecutionProviderHealth[]>;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

/**
 * Arka's automatic control-plane. It owns all durable decisions and gives the
 * external Mastra worker only an already validated, immutable mission order.
 */
export function createOrchestrationRuntime(options: OrchestrationRuntimeOptions): OrchestrationRuntime {
  const clock = options.clock ?? new SystemClock();
  const policyStore = options.policyStore ?? new FsOrchestrationPolicyStore();
  const registryStore = options.registryStore ?? new FsExecutionRegistryStore();
  const workerStateStore = options.workerStateStore ?? new FsOrchestrationWorkerStateStore(options.homeDir);
  const environment = options.environment ?? process.env;
  const executionPort = options.executionPort ?? createMastraExecutionPort({ providerCredentials: providerCredentialsFrom(environment) });
  const audit = options.auditTrail ?? new FsAuditTrail(options.homeDir);
  const agentOrchestration = options.agentOrchestration ?? createAgentOrchestrationRuntime({
    agents: options.agents,
    projects: options.projects,
    features: options.features,
    pipeline: options.pipeline,
  });
  const launcher = options.workerLauncher ?? createNodeOrchestrationWorkerLauncher({
    frameworkRoot: options.frameworkRoot,
    homeDir: options.homeDir,
    environment,
  });
  const sleep = options.sleep ?? delay;

  return {
    async configure(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.configure", input.selection.provider);
      try {
        const current = await loadPolicyForPreview(project);
        const policy = policyWithUserModel(current, input.selection, clock.now());
        await policyStore.save(project, policy);
        await auditSuccess(project, "orchestration.configure", input.selection.provider, {
          provider: input.selection.provider,
          model: input.selection.model,
        });
        return policy;
      } catch (error) {
        await auditFailure(project, "orchestration.configure", input.selection.provider).catch(() => undefined);
        throw error;
      }
    },

    async preview(input) {
      const project = await options.projects.show(input.projectId);
      return (await prepareMissionPreview(project, input.featureId)).preview;
    },

    async start(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.start", input.featureId.value);
      try {
        await recoverStaleExecutions(project);
        const beforeArming = await prepareMissionPreview(project, input.featureId);
        assertConfirmedPreview(beforeArming, input.selection, input.previewFingerprint);
        if (project.orchestrationMode !== "automatic") {
          await options.projects.setOrchestrationMode({ id: project.id, orchestrationMode: "automatic" });
        }
        const armedProject = await options.projects.show(project.id);
        const execution = await scheduleNext(armedProject, input.featureId, input.selection, input.previewFingerprint);
        await auditSuccess(armedProject, "orchestration.start", execution.id, {
          provider: execution.target.provider,
          model: execution.target.model ?? "legacy",
        });
        return execution;
      } catch (error) {
        await auditFailure(project, "orchestration.start", input.featureId.value).catch(() => undefined);
        throw error;
      }
    },

    async status(input) {
      const project = await options.projects.show(input.projectId);
      const [policy, registry] = await Promise.all([policyStore.load(project), registryStore.load(project)]);
      const active = registry.executions.find((record) => isActive(record));
      const latest = registry.executions.at(-1);
      const focus = active ?? latest;
      return {
        schemaVersion: 1,
        projectId: project.id.value,
        orchestrationMode: project.orchestrationMode,
        policy,
        executions: registry.executions,
        activeExecution: active,
        latestExecution: latest,
        actionRequired: actionRequired(focus),
      };
    },

    async cancel(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.cancel", input.executionId);
      try {
        const execution = await updateExecution(project, input.executionId, (record, at) => record.cancel(
          executionSuspensionReason("cancelled_by_user", "Cancellation requested explicitly by the user."),
          at,
        ));
        await auditSuccess(project, "orchestration.cancel", execution.id, { status: execution.status });
        return execution;
      } catch (error) {
        await auditFailure(project, "orchestration.cancel", input.executionId).catch(() => undefined);
        throw error;
      }
    },

    async approve(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.approve", input.executionId);
      try {
        await recoverStaleExecutions(project);
        const planned = await updateExecution(project, input.executionId, (record, at) => record.approve(at));
        const execution = await launchOrReject(project, planned);
        await auditSuccess(project, "orchestration.approve", execution.id, { provider: execution.provider, status: execution.status });
        return execution;
      } catch (error) {
        await auditFailure(project, "orchestration.approve", input.executionId).catch(() => undefined);
        throw error;
      }
    },

    async retry(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.retry", input.executionId);
      try {
        await recoverStaleExecutions(project);
        const planned = await updateExecution(project, input.executionId, (record, at) => record.retry(at));
        const execution = await launchOrReject(project, planned);
        await auditSuccess(project, "orchestration.retry", execution.id, { provider: execution.provider, status: execution.status });
        return execution;
      } catch (error) {
        await auditFailure(project, "orchestration.retry", input.executionId).catch(() => undefined);
        throw error;
      }
    },

    async runWorker(input) {
      let project: Project | undefined;
      let hasState = false;
      let ownsExecution = false;
      try {
        project = await options.projects.show(ProjectId.of(input.projectId));
        const record = (await registryStore.load(project)).find(input.executionId);
        if (record === undefined || record.status !== "planned") return;
        await workerStateStore.start({ projectId: project.id, executionId: record.id, pid: process.pid, at: clock.now() });
        hasState = true;

        const fresh = await loadCurrentMissionContext(project, record);
        if (fresh === undefined) return;
        const prepared = await beginPreparedExecution(project, record.id, fresh);
        if (prepared === undefined) return;
        ownsExecution = true;

        const outcome = await dispatchAndObserve(prepared.mission, project, prepared.record.id);
        await settleOutcome(project, prepared.record.id, outcome, prepared.context);
      } catch {
        if (project !== undefined) {
          if (ownsExecution) await safelyInterruptWorker(project, input.executionId);
          else await safelyRejectWorkerStartup(project, input.executionId);
          await auditFailure(project, "orchestration.worker", input.executionId).catch(() => undefined);
        }
        // The detached CLI worker must not report a successful exit when it
        // could not even claim or dispatch its planned mission. The original
        // error can contain provider/runtime details, so keep the public
        // message fixed and persist only the bounded suspension reason.
        throw new Error("Orchestration worker terminated safely after an internal failure.");
      } finally {
        if (hasState && project !== undefined) await workerStateStore.clear(project.id, input.executionId).catch(() => undefined);
      }
    },
  };

  async function scheduleNext(
    project: Project,
    requestedFeatureId: Parameters<ForFeatures["show"]>[0],
    selection: OrchestrationTargetSelection,
    previewFingerprint: string,
  ): Promise<ExecutionRecord> {
    let currentProject = await requireAutomaticProject(project);
    const registry = await registryStore.load(currentProject);
    const active = registry.executions.find((record) => isActive(record));
    if (active !== undefined) throw new Error(`Execution ${active.id} is already ${active.status}; resolve it before scheduling another mission.`);

    // Preview is deliberately recomputed after arming and immediately before
    // the persistent registry write. A changed Pipeline, policy, health or
    // scope cannot turn the user's earlier agreement into a different run.
    const prepared = await prepareMissionPreview(currentProject, requestedFeatureId);
    const target = assertConfirmedPreview(prepared, selection, previewFingerprint);
    const executionId = nextExecutionId();
    const missionId = nextMissionId();
    // A user may have returned to manual while the control plane was
    // inspecting the Pipeline. Re-check before making a planned record, and
    // once more in launchOrReject immediately before any process is spawned.
    currentProject = await requireAutomaticProject(currentProject);
    const stored = await registryStore.update(currentProject, (currentRegistry) => {
      const currentActive = currentRegistry.executions.find((record) => isActive(record));
      if (currentActive !== undefined) {
        throw new Error(`Execution ${currentActive.id} is already ${currentActive.status}; resolve it before scheduling another mission.`);
      }
      const at = clock.now();
      const order = MissionOrder.create({
        id: missionId,
        scope: { projectId: currentProject.id, featureId: prepared.feature.id, paths: prepared.scopePaths },
        preconditions: { pipelineId: prepared.feature.pipelineId, nextStepId: prepared.nextStepId },
        requiredCapabilities: prepared.requirements.capabilities,
        requiredPermissions: prepared.requirements.permissions,
        summary: prepared.summary,
        issuedAt: at,
      });
      const planned = ExecutionRecord.planned(executionId, order, target, at).appendEvent(
        "target_selected",
        `target=${target.provider}/${target.model}; adapter=${target.adapter}; confirmed_preview=${previewFingerprint.slice(0, 16)}`,
        at,
      );
      return currentRegistry.add(planned, at);
    });
    const execution = stored.find(executionId);
    if (execution === undefined) throw new Error("Scheduled execution is missing from the registry.");
    return launchOrReject(currentProject, execution, { requireAutomaticMode: true });
  }

  async function loadCurrentMissionContext(project: Project, record: ExecutionRecord): Promise<CurrentMissionContext | undefined> {
    const featureId = record.order.scope.featureId;
    if (featureId === undefined) {
      await rejectPlanned(project, record.id, "scope_changed", "A Feature scope is required for automatic execution.");
      return undefined;
    }
    let feature: Feature;
    try {
      feature = await options.features.show(featureId);
      if (!feature.belongsTo(project.id)) throw new Error("feature-project-mismatch");
      const current = await inspectFeature(feature);
      const next = current.report.nextActions[0];
      if (next === undefined) throw new MissionPreconditionError("Pipeline no longer has an actionable next step.");
      const context: MissionOrderContext = {
        scope: { projectId: project.id, featureId: feature.id, paths: [relativeFeatureScope(project, feature)] },
        pipelineId: feature.pipelineId,
        nextStepId: next.stepId,
      };
      record.order.assertCurrent(context);
      if (record.target.source !== "user" || record.target.model === undefined) {
        await rejectPlanned(project, record.id, "policy_rejected", "This legacy mission has no confirmed model and cannot be dispatched or retried.");
        return undefined;
      }
      const policy = await policyStore.load(project);
      if (policy === undefined || !policy.allowsTarget(record.target, {
        capabilities: record.order.requiredCapabilities,
        permissions: record.order.requiredPermissions,
      })) {
        await rejectPlanned(project, record.id, "policy_rejected", "The Project policy no longer authorizes the confirmed assistant and version.");
        return undefined;
      }
      const health = targetHealthForPolicy(policy, await providerHealth(project));
      const healthy = health.find((entry) => sameExecutionTarget(entry.target, record.target));
      if (healthy?.healthy !== true || !includesAll(healthy.capabilities, record.order.requiredCapabilities)) {
        await rejectPlanned(project, record.id, "worker_unavailable", "The confirmed assistant and version are no longer available for this mission.");
        return undefined;
      }
      const role = roleForStep(next.stepId);
      if (role === undefined) {
        await rejectPlanned(project, record.id, "precondition_changed", "The current Pipeline step has no bounded execution role.");
        return undefined;
      }
      return {
        feature,
        nextStepId: next.stepId,
        role,
        requirements: requirementsForExecution(role),
        report: current.report,
      };
    } catch (error) {
      const code = error instanceof MissionPreconditionError ? "precondition_changed" : "scope_changed";
      await rejectPlanned(project, record.id, code, "The Project, Feature, scope, or Pipeline preconditions changed before dispatch.");
      return undefined;
    }
  }

  async function beginPreparedExecution(project: Project, executionId: string, context: CurrentMissionContext): Promise<{ readonly record: ExecutionRecord; readonly mission: AgentExecutionMission; readonly context: CurrentMissionContext } | undefined> {
    const record = (await registryStore.load(project)).find(executionId);
    if (record === undefined || record.status !== "planned") return undefined;
    try {
      const prompt = await agentOrchestration.initializationPrompt({
        projectId: project.id,
        featureId: context.feature.id,
        role: context.role,
        provider: providerLabel(record.provider),
        mode: "execute",
      });
      validatePreparedPrompt(prompt, project, context, record);

      // `initializationPrompt` is informational and can take time to build.
      // Re-read every immutable MissionOrder precondition immediately before
      // the state changes to running; the worker never receives a stale order.
      const rechecked = await loadCurrentMissionContext(project, record);
      if (rechecked === undefined) return undefined;
      const authorAgentId = await resolveBoundedAuthor(project, rechecked, prompt, record);
      const begun = await updateExecution(project, executionId, (candidate, at) => candidate.begin({ at }));
      const mission = providerMission(begun, boundedMissionPrompt(begun, prompt.skill, rechecked.role, authorAgentId), rechecked.feature.root, environment);
      return { record: begun, mission, context: { ...rechecked, authorAgentId } };
    } catch {
      const current = (await registryStore.load(project)).find(executionId);
      if (current?.status === "running") {
        await updateExecution(project, executionId, (candidate, at) => candidate.fail(
          executionSuspensionReason("worker_unavailable", "The bounded provider mission could not be prepared after dispatch began."),
          at,
        )).catch(() => undefined);
      } else {
        await rejectPlanned(project, executionId, "precondition_changed", "The bounded provider mission could not be prepared from the current Pipeline state.");
      }
      return undefined;
    }
  }

  async function dispatchAndObserve(mission: AgentExecutionMission, project: Project, executionId: string): Promise<AgentExecutionOutcome> {
    let outcome = await executionPort.dispatch(mission);
    while (outcome.status === "running") {
      await sleep(POLL_INTERVAL_MS);
      await workerStateStore.touch({ projectId: project.id, executionId, pid: process.pid, at: clock.now() });
      const current = (await registryStore.load(project)).find(executionId);
      if (current?.status !== "running") {
        await executionPort.cancel({ executionId }).catch(() => undefined);
        return { ...outcome, status: "cancelled", completedAt: clock.now().toISOString() };
      }
      const inspected = await executionPort.inspect({ executionId });
      if (inspected === undefined) return { ...outcome, status: "interrupted", completedAt: clock.now().toISOString() };
      outcome = inspected;
    }
    return outcome;
  }

  async function settleOutcome(project: Project, executionId: string, outcome: AgentExecutionOutcome, context: CurrentMissionContext): Promise<void> {
    let current = (await registryStore.load(project)).find(executionId);
    if (current === undefined || current.status !== "running") return;
    if (outcome.sessionId !== undefined && isSafeProviderSessionId(outcome.sessionId)) {
      current = await updateExecution(project, executionId, (record, at) => record.recordProviderSession(outcome.sessionId!, at));
    }
    if (outcome.status === "awaiting_approval") {
      // ACP permission requests have no portable, trustworthy contract for a
      // command/path grant. Never make `approve` an opaque escalation loop.
      await updateExecution(project, executionId, (record, at) => record.fail(
        executionSuspensionReason("permission_not_preapproved", "The provider requested a permission that is not structurally provable inside the preauthorized Feature scope."),
        at,
      ));
      return;
    }
    if (outcome.status === "completed") {
      if (isReadOnlyMission(current)) {
        const verdict = readOnlyAnalysisVerdict(outcome.output, current);
        if (verdict === undefined) {
          await updateExecution(project, executionId, (record, at) => record.fail(
            executionSuspensionReason("missing_proof", "The read-only provider completion has no bounded analysis conclusion and execution proof."),
            at,
          ));
          return;
        }
        const succeeded = await updateExecution(project, executionId, (record, at) => record.succeed([
          `analysis:verdict:${verdict}`,
        ], at));
        await auditSuccess(project, "orchestration.succeed", succeeded.id, {
          provider: succeeded.target.provider,
          model: succeeded.target.model ?? "legacy",
        });
        // Provider output remains ephemeral. The registry retains only a
        // closed conclusion and asks the human to validate the Pipeline
        // document separately, so it cannot become a secret-bearing log.
        await updateExecution(project, executionId, (record, at) => record.appendEvent(
          "read_only_analysis_ready",
          "A bounded read-only analysis conclusion is ready for human review.",
          at,
        ));
        await updateExecution(project, executionId, (record, at) => record.appendEvent(
          "manual_pipeline_validation_required",
          "The Pipeline remains unchanged until a human validates the official document.",
          at,
        ));
        return;
      }
      const proofReferences = await proofReferencesFor(context, current, outcome);
      if (proofReferences.length === 0) {
        await updateExecution(project, executionId, (record, at) => record.fail(
          executionSuspensionReason("missing_proof", "The provider completed without an execution-bound proof marker and a new valid Pipeline document."),
          at,
        ));
        return;
      }
      const succeeded = await updateExecution(project, executionId, (record, at) => record.succeed(proofReferences, at));
      await auditSuccess(project, "orchestration.succeed", succeeded.id, {
        provider: succeeded.target.provider,
        model: succeeded.target.model ?? "legacy",
      });
      // A Project in automatic mode is intentionally a *pilote assisté*.
      // The next Pipeline step can be previewed, but is never chained or
      // launched without a new explanation and explicit confirmation.
      await updateExecution(project, executionId, (record, at) => record.appendEvent(
        "next_preview_required",
        "Arka validated this result. Prepare and confirm the next mission before another assistant is launched.",
        at,
      ));
      return;
    }
    if (outcome.status === "cancelled") {
      await updateExecution(project, executionId, (record, at) => record.interrupt(
        executionSuspensionReason("interrupted", "The worker stopped before it returned verifiable proof."),
        at,
      ));
      return;
    }
    const reason = outcome.status === "interrupted" ? "interrupted" : "provider_error";
    await updateExecution(project, executionId, (record, at) => record.fail(
      executionSuspensionReason(reason, outcome.status === "interrupted"
        ? "The provider run was interrupted. Retry creates a fresh run."
        : "The provider failed before it returned verifiable proof."),
      at,
    ));
  }

  async function proofReferencesFor(
    context: CurrentMissionContext,
    record: ExecutionRecord,
    outcome: AgentExecutionOutcome,
  ): Promise<readonly string[]> {
    try {
      if (!hasExecutionProofMarker(outcome.output, record.id, record.order.preconditions.nextStepId)) return [];
      const current = await inspectFeature(context.feature);
      const next = current.report.nextActions[0];
      if (next?.stepId === record.order.preconditions.nextStepId) return [];
      if (context.authorAgentId === undefined) return [];
      const newDocuments = newValidPipelineDocuments(
        context.report,
        current.report,
        context.feature.root,
        record.order.preconditions.nextStepId,
        context.authorAgentId,
      );
      if (newDocuments.length === 0) return [];
      const transition = current.report.overallStatus === "completed"
        ? "pipeline:completed"
        : next === undefined ? undefined : `pipeline:next-step:${next.stepId}`;
      if (transition === undefined) return [];
      return [transition, ...newDocuments.map((filePath) => `document:${filePath}`)];
    } catch {
      return [];
    }
  }

  async function resolveBoundedAuthor(
    project: Project,
    context: CurrentMissionContext,
    prompt: AgentInitializationPrompt,
    record: ExecutionRecord,
  ): Promise<string> {
    const binding = (await options.agents.sessions(project)).find((candidate) => candidate.sessionId.value === prompt.sessionId);
    if (binding === undefined
      || !binding.agent.active
      || !binding.agent.coversFeature(context.feature.id)
      || !binding.agent.coversProjectPath(relativeFeatureScope(project, context.feature))
      || !matchesOrchestrationRole(binding.agent.role, context.role)
      || !matchesExecutionProvider(binding.agent.provider, record.provider)) {
      throw new MissionPreconditionError("The execution role has no active, scoped Agent identity compatible with the selected provider.");
    }
    return binding.agent.id.value;
  }

  async function resolveFeature(project: Project, requested?: Parameters<ForFeatures["show"]>[0]): Promise<Feature> {
    if (requested !== undefined) {
      const feature = await options.features.show(requested);
      if (!feature.belongsTo(project.id)) throw new Error(`Feature ${feature.id.value} does not belong to Project ${project.id.value}.`);
      return feature;
    }
    const features = await options.features.list(project.id);
    if (features.length !== 1) throw new Error("Automatic orchestration requires --feature unless the Project has exactly one Feature.");
    return features[0]!;
  }

  async function inspectFeature(feature: Feature): Promise<{ readonly report: Awaited<ReturnType<ForPipeline["inspect"]>> }> {
    const { authorRegistry } = await loadVerifiedFeatureContext(feature, { projects: options.projects, agents: options.agents });
    const report = await options.pipeline.inspect({
      featureRoot: feature.root,
      featureId: feature.id.value,
      pipelineId: feature.pipelineId,
      authorRegistry,
    });
    return { report };
  }

  async function loadPolicyForPreview(project: Project): Promise<ExecutionPolicy> {
    return (await policyStore.load(project)) ?? ExecutionPolicy.defaultFor(project.id, clock.now());
  }

  async function assertNoPendingReadOnlyAnalysis(project: Project, featureId: string, stepId: string): Promise<void> {
    const registry = await registryStore.load(project);
    const pending = registry.executions.some((record) => record.status === "succeeded"
      && record.order.scope.featureId?.value === featureId
      && record.order.preconditions.nextStepId === stepId
      && readOnlyAnalysisVerdictFromProofReferences(record.proofReferences) !== undefined);
    if (pending) {
      throw new Error("A read-only analysis awaits manual Pipeline validation. Create or validate the official document before preparing this step again.");
    }
  }

  async function prepareMissionPreview(
    project: Project,
    featureId: Parameters<ForFeatures["show"]>[0],
  ): Promise<PreparedMissionPreview> {
    const feature = await resolveFeature(project, featureId);
    const current = await inspectFeature(feature);
    const next = current.report.nextActions[0];
    if (next === undefined) throw new Error("The Pipeline has no next step to prepare with the Pilote assisté.");
    const role = roleForStep(next.stepId);
    if (role === undefined) throw new Error(`The current Pipeline step ${next.stepId} has no bounded assistant role.`);
    await assertNoPendingReadOnlyAnalysis(project, feature.id.value, next.stepId);
    const requirements = requirementsForExecution(role);
    const policy = await loadPolicyForPreview(project);
    const targetSelection = selectBestEligibleTarget(
      policy,
      requirements,
      targetHealthForPolicy(policy, await providerHealth(project)),
    );
    const scopePaths = [relativeFeatureScope(project, feature)] as const;
    const candidates = targetSelection.candidates.map((candidate) => ({
      target: candidate.target,
      eligible: candidate.eligible,
      reasons: candidate.reasons,
      recommended: targetSelection.selected !== undefined && sameExecutionTarget(candidate.target, targetSelection.selected),
    }));
    const summary = `Préparer l’étape ${next.stepId} pour la Feature ${feature.name}.`;
    const fingerprint = previewFingerprint({
      projectId: project.id.value,
      featureId: feature.id.value,
      nextStepId: next.stepId,
      role,
      scopePaths,
      requirements,
      policyUpdatedAt: policy.updatedAt.toISOString(),
      candidates,
    });
    const preview: OrchestrationPreview = {
      schemaVersion: 1,
      projectId: project.id.value,
      featureId: feature.id.value,
      featureName: feature.name,
      stepId: next.stepId,
      role,
      summary,
      scopePaths,
      requiredCapabilities: [...requirements.capabilities],
      requiredPermissions: [...requirements.permissions],
      candidates,
      fingerprint,
    };
    return { preview, feature, nextStepId: next.stepId, scopePaths, requirements, summary };
  }

  function assertConfirmedPreview(
    prepared: PreparedMissionPreview,
    selection: OrchestrationTargetSelection,
    expectedFingerprint: string,
  ): ExecutionTarget {
    if (expectedFingerprint !== prepared.preview.fingerprint) {
      throw new Error("The mission preview changed before confirmation. Review the updated mission before launching an assistant.");
    }
    const target = userExecutionTarget(selection.provider, selection.model);
    const candidate = prepared.preview.candidates.find((entry) => sameExecutionTarget(entry.target, target));
    if (candidate === undefined) {
      throw new Error("The selected assistant and version are not configured for this Project. Configure them, then prepare the mission again.");
    }
    if (!candidate.eligible) {
      throw new Error("The selected assistant and version cannot safely run this mission: " + candidate.reasons.join(", ") + ".");
    }
    return target;
  }

  function policyWithUserModel(
    source: ExecutionPolicy,
    selection: OrchestrationTargetSelection,
    updatedAt: Date,
  ): ExecutionPolicy {
    // Validates model text before it ever becomes durable Project state.
    userExecutionTarget(selection.provider, selection.model);
    const defaults = ExecutionPolicy.defaultFor(source.projectId, source.createdAt).toProps();
    const sourceByProvider = new Map(source.providers.map((provider) => [provider.provider, provider]));
    const providers = defaults.providers.map((defaultProvider) => {
      const current = sourceByProvider.get(defaultProvider.provider) ?? defaultProvider;
      if (current.provider !== selection.provider) return current;
      const existing = current.models.find((model) => model.id === selection.model);
      const models = [
        ...current.models.filter((model) => model.id !== selection.model),
        { id: selection.model, enabled: true, priority: existing?.priority ?? 1000 },
      ];
      // Choosing an assistant and model must never broaden a Project policy.
      // A Project owner can deliberately retain a read-only Claude or Z.AI
      // policy; the explicit configuration action only enables the model.
      return {
        ...current,
        enabled: true,
        models,
      };
    });
    return ExecutionPolicy.create({
      schemaVersion: defaults.schemaVersion,
      projectId: source.projectId,
      selectionMode: "assisted",
      providers,
      createdAt: source.createdAt,
      updatedAt,
    });
  }

  function targetHealthForPolicy(
    policy: ExecutionPolicy,
    providerEntries: readonly ExecutionProviderHealth[],
  ): readonly ExecutionTargetHealth[] {
    const byProvider = new Map(providerEntries.map((entry) => [entry.provider, entry]));
    return policy.providers.flatMap((provider) => provider.models.map((model) => {
      const health = byProvider.get(provider.provider);
      return {
        target: userExecutionTarget(provider.provider, model.id),
        healthy: health?.healthy ?? false,
        capabilities: health?.capabilities ?? [],
      };
    }));
  }

  async function providerHealth(project: Project): Promise<readonly ExecutionProviderHealth[]> {
    if (options.providerHealth !== undefined) return options.providerHealth(project);
    return configuredProviderHealth(environment);
  }

  async function updateExecution(project: Project, executionId: string, transition: (record: ExecutionRecord, at: Date) => ExecutionRecord): Promise<ExecutionRecord> {
    const registry = await registryStore.update(project, (current) => {
      const now = clock.now();
      const record = current.find(executionId);
      if (record === undefined) throw new Error(`Execution ${executionId} was not found.`);
      return current.replace(transition(record, now), now);
    });
    const updated = registry.find(executionId);
    if (updated === undefined) throw new Error(`Execution ${executionId} disappeared from the registry.`);
    return updated;
  }

  async function requireAutomaticProject(project: Project): Promise<Project> {
    const current = await options.projects.show(project.id);
    if (current.orchestrationMode !== "automatic") {
      throw new Error("Automatic orchestration is disabled for this Project; no new mission was scheduled.");
    }
    return current;
  }

  /**
   * Recover only through a private heartbeat, never by signalling a stored
   * PID. A reused PID must not become authority to kill an unrelated process.
   * Status stays read-only; recovery happens on an explicit user mutation.
   */
  async function recoverStaleExecutions(project: Project): Promise<void> {
    const registry = await registryStore.load(project);
    const now = clock.now().getTime();
    for (const record of registry.executions) {
      if (!isActive(record)) continue;
      let lastSeen = record.updatedAt;
      try {
        const worker = await workerStateStore.load(project.id, record.id);
        if (worker !== undefined) lastSeen = worker.updatedAt;
      } catch {
        // A corrupt private heartbeat is treated like an unavailable worker,
        // but only after the same bounded stale interval.
      }
      if (now - lastSeen.getTime() < STALE_WORKER_AFTER_MS) continue;
      if (record.status === "planned") {
        await updateExecution(project, record.id, (candidate, at) => candidate.reject(
          executionSuspensionReason("worker_unavailable", "The local worker did not start before its bounded heartbeat window elapsed."),
          at,
        )).catch(() => undefined);
      } else {
        await updateExecution(project, record.id, (candidate, at) => candidate.interrupt(
          executionSuspensionReason("interrupted", "The local worker heartbeat expired; retry starts a fresh provider run."),
          at,
        )).catch(() => undefined);
      }
    }
  }

  async function launchOrReject(
    project: Project,
    execution: ExecutionRecord,
    launchOptions: { readonly requireAutomaticMode?: boolean } = {},
  ): Promise<ExecutionRecord> {
    if (launchOptions.requireAutomaticMode) {
      const current = await options.projects.show(project.id);
      if (current.orchestrationMode !== "automatic") {
        return updateExecution(project, execution.id, (record, at) => record.reject(
          executionSuspensionReason("automatic_disabled", "The Project returned to manual mode before the next worker was launched."),
          at,
        ));
      }
    }
    try {
      await launcher.launch({ projectId: project.id.value, executionId: execution.id });
      return execution;
    } catch {
      return updateExecution(project, execution.id, (record, at) => record.reject(
        executionSuspensionReason("worker_unavailable", "The local worker could not be launched."),
        at,
      ));
    }
  }

  async function rejectPlanned(project: Project, executionId: string, code: "scope_changed" | "precondition_changed" | "policy_rejected" | "worker_unavailable", detail: string): Promise<void> {
    await updateExecution(project, executionId, (record, at) => record.reject(executionSuspensionReason(code, detail), at)).catch(() => undefined);
  }

  async function safelyInterruptWorker(project: Project, executionId: string): Promise<void> {
    const record = (await registryStore.load(project)).find(executionId);
    if (record?.status !== "running") return;
    await updateExecution(project, executionId, (candidate, at) => candidate.interrupt(
      executionSuspensionReason("interrupted", "The local worker ended before it returned a terminal outcome."),
      at,
    )).catch(() => undefined);
  }

  async function safelyRejectWorkerStartup(project: Project, executionId: string): Promise<void> {
    try {
      const record = (await registryStore.load(project)).find(executionId);
      if (record?.status === "planned") {
        await updateExecution(project, executionId, (candidate, at) => candidate.reject(
          executionSuspensionReason("worker_unavailable", "The local worker failed before it could dispatch the mission."),
          at,
        ));
      } else if (record?.status === "running") {
        await safelyInterruptWorker(project, executionId);
      }
    } catch {
      // The outer handler still returns a non-zero worker result; never turn a
      // failed registry write into an unbounded retry or expose its details.
    }
  }

  async function auditIntent(project: Project, action: string, entityId?: string): Promise<void> {
    await appendAudit({ occurredAt: clock.now(), action, outcome: "intent", entityType: "project", ...(entityId === undefined ? {} : { entityId }), root: project.root });
  }

  async function auditSuccess(project: Project, action: string, entityId: string, details: Readonly<Record<string, string | number | boolean>> = {}): Promise<void> {
    await appendAudit({ occurredAt: clock.now(), action, outcome: "success", entityType: "project", entityId, root: project.root, details });
  }

  async function auditFailure(project: Project, action: string, entityId?: string): Promise<void> {
    await appendAudit({ occurredAt: clock.now(), action, outcome: "failure", entityType: "project", ...(entityId === undefined ? {} : { entityId }), root: project.root });
  }

  async function appendAudit(event: AuditEvent): Promise<void> {
    try {
      await audit.append(event);
    } catch (error) {
      throw new AuditUnavailableError(event.action, error instanceof Error ? error.message : String(error));
    }
  }
}

interface CurrentMissionContext {
  readonly feature: Feature;
  readonly nextStepId: string;
  readonly role: OrchestratedAgentRole;
  readonly requirements: ExecutionRequirements;
  readonly report: PipelineReport;
  /** Set only after the selected Agent identity was revalidated at dispatch. */
  readonly authorAgentId?: string;
}

interface PreparedMissionPreview {
  readonly preview: OrchestrationPreview;
  readonly feature: Feature;
  readonly nextStepId: string;
  readonly scopePaths: readonly string[];
  readonly requirements: ExecutionRequirements;
  readonly summary: string;
}

function previewFingerprint(value: {
  readonly projectId: string;
  readonly featureId: string;
  readonly nextStepId: string;
  readonly role: string;
  readonly scopePaths: readonly string[];
  readonly requirements: ExecutionRequirements;
  readonly policyUpdatedAt: string;
  readonly candidates: readonly OrchestrationPreview["candidates"][number][];
}): string {
  const stable = JSON.stringify({
    projectId: value.projectId,
    featureId: value.featureId,
    nextStepId: value.nextStepId,
    role: value.role,
    scopePaths: [...value.scopePaths],
    capabilities: [...value.requirements.capabilities],
    permissions: [...value.requirements.permissions],
    policyUpdatedAt: value.policyUpdatedAt,
    candidates: value.candidates.map((candidate) => ({
      target: candidate.target,
      eligible: candidate.eligible,
      reasons: [...candidate.reasons],
      recommended: candidate.recommended,
    })),
  });
  return createHash("sha256").update(stable).digest("hex");
}

export function createNodeOrchestrationWorkerLauncher(input: {
  readonly frameworkRoot: string;
  readonly homeDir: string;
  readonly environment?: NodeJS.ProcessEnv;
}): OrchestrationWorkerLauncher {
  const cliEntry = resolve(input.frameworkRoot, "bin", "arka-norn.mjs");
  const environment = input.environment ?? process.env;
  return {
    launch(request): Promise<void> {
      if (!existsSync(cliEntry)) throw new Error("The local arka-norn worker entrypoint is unavailable.");
      const child = spawn(process.execPath, [cliEntry, "orchestration", "_worker", "--project", request.projectId, "--execution", request.executionId], {
        cwd: input.frameworkRoot,
        detached: true,
        stdio: "ignore",
        windowsHide: true,
        env: workerEnvironment(input.homeDir, environment),
      });
      child.unref();
      return Promise.resolve();
    },
  };
}

export function configuredProviderHealth(environment: NodeJS.ProcessEnv = process.env): readonly ExecutionProviderHealth[] {
  return [
    {
      provider: "claude",
      healthy: environment["ARKA_NORN_MASTRA_CLAUDE_ENABLED"] === "1" && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_CLAUDE_API_KEY"]),
      capabilities: CLAUDE_AUTOMATIC_CAPABILITIES,
    },
    {
      provider: "codex",
      healthy: isConfiguredAcpExecutable(environment["ARKA_NORN_CODEX_ACP_COMMAND"]) && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_CODEX_API_KEY"]),
      // ACP v1 emits generic permission requests with optional locations and
      // opaque tool input. It is a supported adapter, but is not advertised
      // for Feature writes until it proves a structured scope contract.
      capabilities: CODEX_ACP_SAFE_CAPABILITIES,
    },
    {
      provider: "kimi",
      healthy: isConfiguredAcpExecutable(environment["ARKA_NORN_KIMI_ACP_COMMAND"]) && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_KIMI_API_KEY"]),
      // Kimi Code exposes the same opaque ACP permission shape. Keep it
      // observable and selectable, but not eligible for Feature writes yet.
      capabilities: CODEX_ACP_SAFE_CAPABILITIES,
    },
    {
      provider: "zai",
      healthy: environment["ARKA_NORN_MASTRA_ZAI_ENABLED"] === "1" && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_ZAI_API_KEY"]),
      capabilities: ZAI_AUTOMATIC_CAPABILITIES,
    },
  ];
}

function providerMission(record: ExecutionRecord, prompt: string, workspace: string, environment: NodeJS.ProcessEnv): AgentExecutionMission {
  const permissionPolicy = {
    mode: "preauthorized-workspace" as const,
    // MissionOrder paths are Project-relative audit data. The provider's
    // process starts at the verified Feature root, so its only valid local
    // scope is the whole Feature workspace, represented by `.`.
    scopePaths: ["."],
    permissions: record.order.requiredPermissions.filter((permission): permission is "read_workspace" | "write_workspace" => permission === "read_workspace" || permission === "write_workspace"),
  };
  if (permissionPolicy.permissions.length === 0) throw new Error("The mission has no workspace permission.");
  if (record.target.source !== "user" || record.target.model === undefined) {
    throw new Error("A confirmed assistant and version are required for dispatch.");
  }
  if (record.target.provider === "claude") {
    return {
      provider: "claude",
      executionId: record.id,
      mission: prompt,
      workspace,
      permissionPolicy,
      model: record.target.model,
    };
  }
  if (record.target.provider === "zai") {
    return {
      provider: "claude",
      providerProfile: "zai",
      executionId: record.id,
      mission: prompt,
      workspace,
      permissionPolicy,
      model: record.target.model,
    };
  }
  if (record.target.provider === "kimi") {
    return {
      provider: "kimi-acp",
      executionId: record.id,
      mission: prompt,
      workspace,
      permissionPolicy,
      command: requiredAcpCommand(environment, "kimi"),
      // Kimi Code owns the ACP subcommand. It never comes from a Project
      // marker, the MissionOrder, or a free-form command-line option.
      args: ["acp"],
      model: record.target.model,
    };
  }
  return {
    provider: "codex-acp",
    executionId: record.id,
    mission: prompt,
    workspace,
    permissionPolicy,
    command: requiredAcpCommand(environment, "codex"),
    args: configuredAcpArguments(environment["ARKA_NORN_CODEX_ACP_ARGS"]),
    model: record.target.model,
  };
}

function workerEnvironment(homeDir: string, source: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const names = [
    "ARKA_NORN_CODEX_ACP_COMMAND",
    "ARKA_NORN_CODEX_ACP_ARGS",
    "ARKA_NORN_KIMI_ACP_COMMAND",
    "ARKA_NORN_MASTRA_CLAUDE_ENABLED",
    "ARKA_NORN_MASTRA_ZAI_ENABLED",
    "ARKA_NORN_MASTRA_CLAUDE_API_KEY",
    "ARKA_NORN_MASTRA_CODEX_API_KEY",
    "ARKA_NORN_MASTRA_KIMI_API_KEY",
    "ARKA_NORN_MASTRA_ZAI_API_KEY",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TERM",
    "NO_COLOR",
    "TZ",
  ] as const;
  const result: NodeJS.ProcessEnv = { ARKA_NORN_HOME: homeDir };
  for (const name of names) {
    const value = source[name];
    if (value !== undefined) result[name] = value;
  }
  return result;
}

function requirementsForExecution(role: OrchestratedAgentRole): ExecutionRequirements {
  // An audit is valuable before any mutation and is intentionally treated as
  // a read-only mission. The MissionOrder, preview, provider selection and
  // Claude tool surface all derive from this same requirement set.
  if (role === "audit") {
    return { capabilities: READ_ONLY_CAPABILITIES, permissions: READ_ONLY_WORKER_PERMISSIONS };
  }
  return { capabilities: WRITE_CAPABILITIES, permissions: WRITE_WORKER_PERMISSIONS };
}

function validatePreparedPrompt(
  prompt: AgentInitializationPrompt,
  project: Project,
  context: CurrentMissionContext,
  record: ExecutionRecord,
): void {
  const requiresWrite = record.order.requiredPermissions.includes("write_workspace");
  if (prompt.projectId !== project.id.value
    || prompt.featureId !== context.feature.id.value
    || prompt.role !== context.role
    || prompt.mode !== "execute"
    // The interactive initialization prompt may be writable, but it never
    // grants a worker more than the immutable MissionOrder. Only a write
    // mission needs a writable prompt to remain internally coherent.
    || (requiresWrite && !prompt.canWrite)
    || prompt.expectedStepId !== record.order.preconditions.nextStepId) {
    throw new MissionPreconditionError("The generated Agent prompt no longer matches the immutable MissionOrder.");
  }
}

/**
 * The regular Agent initialization prompt contains Project-wide shell setup
 * guidance for an interactive session. A local automatic worker instead gets
 * a Feature-root-only mission with no shell/network authority.
 */
function boundedMissionPrompt(record: ExecutionRecord, skill: string, role: OrchestratedAgentRole, authorAgentId: string): string {
  const expectedStepId = record.order.preconditions.nextStepId;
  const canWrite = record.order.requiredPermissions.includes("write_workspace");
  return [
    "MISSION ARKA NORN BORNÉE",
    `- Exécution: ${record.id}`,
    `- Rôle: ${role}`,
    `- Étape Pipeline immuable: ${expectedStepId}`,
    `- Référence skill: $${skill}`,
    `- author_agent_id obligatoire: ${authorAgentId}`,
    "",
    canWrite
      ? "La racine de travail fournie est exactement la racine de la Feature. Lis et écris uniquement dans cette racine."
      : "La racine de travail fournie est exactement la racine de la Feature. Cette mission est strictement en lecture seule : ne modifie aucun fichier.",
    "N'utilise ni shell, ni sous-processus, ni réseau, ni accès à une racine Project parente. Ne modifie ni marker Project, ni politique, ni registre d'exécutions, ni identité Agent.",
    canWrite
      ? `Vérifie les documents locaux puis produis seulement l'artefact valide attendu pour ${expectedStepId}. Si la situation ne correspond plus, arrête sans écrire.`
      : `Analyse les documents locaux pour l'étape ${expectedStepId}, puis restitue une synthèse factuelle dans ta réponse. Si la situation ne correspond plus, arrête sans écrire.`,
    canWrite
      ? "Ne déclare pas de succès sans un document Pipeline valide nouvellement produit."
      : "Cette analyse ne fait pas progresser le Pipeline sans une validation humaine et un livrable vérifiable.",
    "",
    ...(canWrite
      ? [
          "Après une production validable, termine exactement par cette ligne, sans autre valeur dans le marqueur :",
          `ARKA_NORN_PROOF:${record.id}:${expectedStepId}`,
        ]
      : [
          "Après l’analyse, termine exactement par ces deux lignes, sans autre valeur dans les marqueurs :",
          "ARKA_NORN_ANALYSIS:<no_blocker|findings_require_review|scope_change_required|inconclusive>",
          `ARKA_NORN_PROOF:${record.id}:${expectedStepId}`,
        ]),
  ].join("\n");
}

function matchesOrchestrationRole(value: string, expected: OrchestratedAgentRole): boolean {
  const role = value.trim().toLowerCase();
  if (expected === "product") return role === "product" || role === "product-owner" || role === "po";
  if (expected === "architecte") return role === "architecte" || role.includes("architect");
  if (expected === "audit") return role.includes("audit");
  if (expected === "dev") return role === "dev" || role.includes("developer");
  return role === "qa" || role.includes("recette");
}

function isReadOnlyMission(record: ExecutionRecord): boolean {
  return !record.order.requiredPermissions.includes("write_workspace");
}

function readOnlyAnalysisVerdict(output: string | undefined, record: ExecutionRecord): ReadOnlyAnalysisVerdict | undefined {
  if (!hasExecutionProofMarker(output, record.id, record.order.preconditions.nextStepId) || output === undefined) return undefined;
  const verdicts = output.split(/\r?\n/u)
    .map((line) => line.trim())
    .flatMap((line) => line.startsWith("ARKA_NORN_ANALYSIS:") ? [line.slice("ARKA_NORN_ANALYSIS:".length)] : []);
  if (verdicts.length !== 1) return undefined;
  return isReadOnlyAnalysisVerdict(verdicts[0]) ? verdicts[0] : undefined;
}

function readOnlyAnalysisVerdictFromProofReferences(references: readonly string[]): ReadOnlyAnalysisVerdict | undefined {
  const values = references
    .flatMap((reference) => reference.startsWith("analysis:verdict:") ? [reference.slice("analysis:verdict:".length)] : []);
  if (values.length !== 1) return undefined;
  return isReadOnlyAnalysisVerdict(values[0]) ? values[0] : undefined;
}

function isReadOnlyAnalysisVerdict(value: string | undefined): value is ReadOnlyAnalysisVerdict {
  return value !== undefined && (READ_ONLY_ANALYSIS_VERDICTS as readonly string[]).includes(value);
}

function hasExecutionProofMarker(output: string | undefined, executionId: string, expectedStepId: string): boolean {
  if (output === undefined || output.length > 64 * 1024) return false;
  const expected = `ARKA_NORN_PROOF:${executionId}:${expectedStepId}`;
  return output.split(/\r?\n/u).some((line) => line.trim() === expected);
}

function newValidPipelineDocuments(
  before: PipelineReport,
  after: PipelineReport,
  featureRoot: string,
  expectedStepId: string,
  expectedAuthorAgentId: string,
): readonly string[] {
  const known = new Set(pipelineDocumentSnapshots(before).map((document) => document.fingerprint));
  const paths = pipelineDocumentSnapshots(after)
    .filter((document) => document.valid
      && document.source === "step"
      && document.stepId === expectedStepId
      && document.documentType === expectedStepId
      && document.authorAgentId === expectedAuthorAgentId
      && !known.has(document.fingerprint))
    .map((document) => relative(featureRoot, document.filePath).replaceAll("\\", "/"))
    .filter(isSafeFeatureRelativeProofPath);
  return Object.freeze([...new Set(paths)].sort((left, right) => left.localeCompare(right)).slice(0, 20));
}

interface PipelineDocumentSnapshot {
  readonly fingerprint: string;
  readonly filePath: string;
  readonly valid: boolean;
  readonly source: "step" | "transversal";
  readonly stepId: string | undefined;
  readonly documentType: string | undefined;
  readonly authorAgentId: string | undefined;
}

function pipelineDocumentSnapshots(report: PipelineReport): readonly PipelineDocumentSnapshot[] {
  const result: PipelineDocumentSnapshot[] = [];
  for (const step of report.steps) {
    for (const document of step.documents) {
      result.push({
        fingerprint: ["step", step.id, document.filePath, document.id ?? "", document.type ?? "", document.authorAgentId ?? "", document.valid ? "valid" : "invalid", document.createdAt ?? ""].join("\u0001"),
        filePath: document.filePath,
        valid: document.valid,
        source: "step",
        stepId: step.id,
        documentType: document.type,
        authorAgentId: document.authorAgentId,
      });
    }
  }
  for (const transversal of report.transversalDocuments) {
    for (const document of transversal.documents) {
      result.push({
        fingerprint: ["transversal", transversal.type, document.filePath, document.id ?? "", document.type ?? "", document.authorAgentId ?? "", document.valid ? "valid" : "invalid", document.createdAt ?? ""].join("\u0001"),
        filePath: document.filePath,
        valid: document.valid,
        source: "transversal",
        stepId: undefined,
        documentType: document.type,
        authorAgentId: document.authorAgentId,
      });
    }
  }
  return result;
}

function isSafeFeatureRelativeProofPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return normalized.length > 0
    && normalized.length <= 480
    && !normalized.startsWith("/")
    && !normalized.startsWith("../")
    && normalized !== ".."
    && !normalized.split("/").includes("..")
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    && !containsSecretLikeText(normalized);
}

function isSafeProviderSessionId(value: string): boolean {
  return value.length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !containsSecretLikeText(value);
}

function actionRequired(record: ExecutionRecord | undefined): OrchestrationActionRequired | undefined {
  if (record === undefined) return undefined;
  if (record.status === "succeeded" && readOnlyAnalysisVerdictFromProofReferences(record.proofReferences) !== undefined) {
    return {
      kind: "inspect",
      executionId: record.id,
      reason: "The read-only analysis is ready. Validate the official Pipeline document before preparing this step again.",
    };
  }
  if (record.status === "awaiting_approval") return { kind: "approve", executionId: record.id, reason: record.suspensionReason?.detail ?? "A provider permission requires explicit approval." };
  if (record.status === "failed" && record.suspensionReason?.code === "permission_not_preapproved") {
    return { kind: "inspect", executionId: record.id, reason: record.suspensionReason.detail };
  }
  if (record.status === "failed" || record.status === "cancelled" || record.status === "interrupted") return { kind: "retry", executionId: record.id, reason: record.suspensionReason?.detail ?? "The mission can be retried as a new provider run." };
  if (record.status === "rejected") return { kind: "inspect", executionId: record.id, reason: record.suspensionReason?.detail ?? "The control plane rejected the mission." };
  return undefined;
}

function isActive(record: ExecutionRecord): boolean {
  return record.status === "planned" || record.status === "running" || record.status === "awaiting_approval";
}

function relativeFeatureScope(project: Project, feature: Feature): string {
  const scope = relative(project.root, feature.root).replaceAll("\\", "/");
  if (scope.length === 0 || scope === ".." || scope.startsWith("../") || scope.startsWith("/")) {
    throw new Error("Feature scope is outside the Project root.");
  }
  return scope;
}

function includesAll<T>(available: readonly T[], required: readonly T[]): boolean {
  const set = new Set(available);
  return required.every((value) => set.has(value));
}

function providerLabel(provider: ExecutionProvider): string {
  if (provider === "claude") return "Claude";
  if (provider === "codex") return "Codex";
  if (provider === "kimi") return "Kimi Platform";
  return "Z.AI Coding Plan";
}

function matchesExecutionProvider(agentProvider: string, selectedProvider: ExecutionProvider): boolean {
  const normalized = agentProvider.trim().toLowerCase();
  if (selectedProvider === "claude") return normalized.includes("claude");
  if (selectedProvider === "codex") return normalized.includes("codex");
  if (selectedProvider === "kimi") return normalized.includes("kimi");
  return normalized.includes("z.ai") || normalized.includes("zai");
}

function isConfiguredAcpExecutable(value: string | undefined): boolean {
  if (value === undefined || !safeConfigurationValue(value)) return false;
  try {
    resolveAcpExecutable(value);
    return true;
  } catch {
    return false;
  }
}

function requiredAcpCommand(environment: NodeJS.ProcessEnv, provider: "codex" | "kimi"): string {
  const name = provider === "codex" ? "ARKA_NORN_CODEX_ACP_COMMAND" : "ARKA_NORN_KIMI_ACP_COMMAND";
  const value = environment[name];
  if (value === undefined || !safeConfigurationValue(value)) {
    throw new Error(`A configured absolute ${provider === "codex" ? "Codex" : "Kimi Code"} ACP executable is required.`);
  }
  return resolveAcpExecutable(value);
}

function configuredAcpArguments(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("ARKA_NORN_CODEX_ACP_ARGS must be a JSON string array.");
  }
  if (!Array.isArray(parsed)) {
    throw new Error("ARKA_NORN_CODEX_ACP_ARGS contains an unsafe value.");
  }
  const argumentsList: string[] = [];
  for (const item of parsed as readonly unknown[]) {
    if (typeof item !== "string" || !safeConfigurationValue(item)) {
      throw new Error("ARKA_NORN_CODEX_ACP_ARGS contains an unsafe value.");
    }
    argumentsList.push(item);
  }
  return Object.freeze(argumentsList);
}

function providerCredentialsFrom(environment: NodeJS.ProcessEnv): {
  readonly claudeApiKey?: string;
  readonly codexApiKey?: string;
  readonly kimiApiKey?: string;
  readonly zaiApiKey?: string;
} {
  const claudeApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_CLAUDE_API_KEY"]);
  const codexApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_CODEX_API_KEY"]);
  const kimiApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_KIMI_API_KEY"]);
  const zaiApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_ZAI_API_KEY"]);
  return {
    ...(claudeApiKey === undefined ? {} : { claudeApiKey }),
    ...(codexApiKey === undefined ? {} : { codexApiKey }),
    ...(kimiApiKey === undefined ? {} : { kimiApiKey }),
    ...(zaiApiKey === undefined ? {} : { zaiApiKey }),
  };
}

function hasExplicitProviderCredential(value: string | undefined): boolean {
  return explicitProviderCredential(value) !== undefined;
}

function explicitProviderCredential(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 16 * 1024 || value.includes("\u0000")) {
    throw new Error("An explicit provider credential is invalid.");
  }
  return value;
}

function safeConfigurationValue(value: string): boolean {
  return value.length <= 4_096
    && !value.includes("\u0000")
    && !containsSecretLikeText(value)
    && !/(?:token|secret|password|api[_-]?key|authorization|credential)/iu.test(value);
}

function nextExecutionId(): string {
  return `execution-${randomUUID()}`;
}

function nextMissionId(): string {
  return `mission-${randomUUID()}`;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
