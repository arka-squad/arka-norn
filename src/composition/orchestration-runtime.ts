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

import { roleForStep } from "../application/agents/agent-orchestration.js";
import { FsExecutionRegistryStore } from "../adapters/outbound/filesystem/fs-orchestration-execution-registry-store.js";
import { FsOrchestrationPolicyStore } from "../adapters/outbound/filesystem/fs-orchestration-policy-store.js";
import { FsOrchestrationWorkerStateStore } from "../adapters/outbound/filesystem/fs-orchestration-worker-state-store.js";
import { FsAuditTrail } from "../adapters/outbound/filesystem/fs-audit-trail.js";
import { createMastraExecutionPort } from "../adapters/outbound/execution/mastra-agent-execution-adapter.js";
import { SystemClock } from "../adapters/outbound/system/system-clock.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
import { AuditUnavailableError } from "../domain/errors.js";
import type { Feature } from "../domain/feature/feature.js";
import { MissionPreconditionError } from "../domain/orchestration/errors.js";
import {
  type ExecutionProviderHealth,
} from "../domain/orchestration/execution-policy.js";
import { ExecutionRecord, executionSuspensionReason } from "../domain/orchestration/execution-record.js";
import { MissionOrder, type MissionOrderContext } from "../domain/orchestration/mission-order.js";
import {
  sameExecutionTarget,
} from "../domain/orchestration/types.js";
import type { Project } from "../domain/project/project.js";
import { ProjectId } from "../domain/project/project-id.js";
import type { ForAgentOrchestration } from "../ports/inbound/for-agent-orchestration.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type {
  ForOrchestration,
  OrchestrationTargetSelection,
} from "../ports/inbound/for-orchestration.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import type { AgentExecutionMission, AgentExecutionOutcome, AgentExecutionPort } from "../ports/outbound/agent-execution-port.js";
import type { AuditEvent, AuditTrail } from "../ports/outbound/audit-trail.js";
import type { Clock } from "../ports/outbound/clock.js";
import type { ExecutionRegistryStore } from "../ports/outbound/execution-registry-store.js";
import type { OrchestrationPolicyStore } from "../ports/outbound/orchestration-policy-store.js";
import {
  providerCredentialsFrom,
  providerLabel,
  providerMission,
  requirementsForExecution,
} from "./orchestration-provider-configuration.js";
import {
  actionRequired,
  boundedMissionPrompt,
  isReadOnlyMission,
  isSafeProviderSessionId,
  proofReferencesFor,
  readOnlyAnalysisVerdict,
  validatePreparedPrompt,
} from "./orchestration-proof-validation.js";
import {
  createOrchestrationMissionPlanner,
  relativeFeatureScope,
} from "./orchestration-mission-planner.js";
import {
  createNodeOrchestrationWorkerLauncher,
  type OrchestrationWorkerLaunch,
  type OrchestrationWorkerLauncher,
} from "./orchestration-worker-launcher.js";
import {
  delay,
  includesAll,
  isActive,
  nextExecutionId,
  nextMissionId,
  resolveBoundedAuthor,
  type CurrentMissionContext,
} from "./orchestration-runtime-support.js";

export { configuredProviderHealth } from "./orchestration-provider-configuration.js";
export { createNodeOrchestrationWorkerLauncher } from "./orchestration-worker-launcher.js";
export type { OrchestrationWorkerLaunch, OrchestrationWorkerLauncher } from "./orchestration-worker-launcher.js";

const POLL_INTERVAL_MS = 200;
const STALE_WORKER_AFTER_MS = 60_000;

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
  const missionPlanner = createOrchestrationMissionPlanner({
    projects: options.projects,
    features: options.features,
    agents: options.agents,
    pipeline: options.pipeline,
    policyStore,
    registryStore,
    clock,
    environment,
    ...(options.providerHealth === undefined ? {} : { providerHealth: options.providerHealth }),
  });
  return {
    async configure(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.configure", input.selection.provider);
      try {
        const current = await missionPlanner.loadPolicyForPreview(project);
        const policy = missionPlanner.policyWithUserModel(current, input.selection, clock.now());
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
      return (await missionPlanner.prepareMissionPreview(project, input.featureId)).preview;
    },

    async start(input) {
      const project = await options.projects.show(input.projectId);
      await auditIntent(project, "orchestration.start", input.featureId.value);
      try {
        await recoverStaleExecutions(project);
        const beforeArming = await missionPlanner.prepareMissionPreview(project, input.featureId);
        missionPlanner.assertConfirmedPreview(beforeArming, input.selection, input.previewFingerprint);
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
    const prepared = await missionPlanner.prepareMissionPreview(currentProject, requestedFeatureId);
    const target = missionPlanner.assertConfirmedPreview(prepared, selection, previewFingerprint);
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
      const current = await missionPlanner.inspectFeature(feature);
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
      const health = await missionPlanner.targetHealth(project, policy);
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
      const authorAgentId = await resolveBoundedAuthor({ agents: options.agents, project, context: rechecked, prompt, record });
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
      const proofReferences = await proofReferencesFor({
        before: context.report,
        featureRoot: context.feature.root,
        expectedAuthorAgentId: context.authorAgentId,
        record: current,
        outcome,
        inspect: async () => (await missionPlanner.inspectFeature(context.feature)).report,
      });
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
