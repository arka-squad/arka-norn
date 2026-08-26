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
import { PRODUCT_VERSION } from "../application/product-metadata.js";
import { FsExecutionRegistryStore } from "../adapters/outbound/filesystem/fs-orchestration-execution-registry-store.js";
import { FsOrchestrationPolicyStore } from "../adapters/outbound/filesystem/fs-orchestration-policy-store.js";
import { FsOrchestrationWorkerStateStore } from "../adapters/outbound/filesystem/fs-orchestration-worker-state-store.js";
import { FsOrchestrationCampaignStore } from "../adapters/outbound/filesystem/fs-orchestration-campaign-store.js";
import { FsOrchestrationWorkspaceManager } from "../adapters/outbound/filesystem/fs-orchestration-workspace.js";
import { FsAuditTrail } from "../adapters/outbound/filesystem/fs-audit-trail.js";
import { createMastraExecutionPort } from "../adapters/outbound/execution/mastra-agent-execution-adapter.js";
import { SystemClock } from "../adapters/outbound/system/system-clock.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
import type { Feature } from "../domain/feature/feature.js";
import { MissionPreconditionError } from "../domain/orchestration/errors.js";
import type { ExecutionProviderHealth } from "../domain/orchestration/execution-policy.js";
import { ExecutionRecord, executionSuspensionReason } from "../domain/orchestration/execution-record.js";
import { OrchestrationCampaign } from "../domain/orchestration/orchestration-campaign.js";
import { projectOrchestration } from "../domain/orchestration/orchestration-projection.js";
import { MissionOrder, type MissionOrderContext } from "../domain/orchestration/mission-order.js";
import { sameExecutionTarget } from "../domain/orchestration/types.js";
import type { Project } from "../domain/project/project.js";
import { ProjectId } from "../domain/project/project-id.js";
import type { ForAgentOrchestration } from "../ports/inbound/for-agent-orchestration.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type { ForOrchestration, OrchestrationTargetSelection } from "../ports/inbound/for-orchestration.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import type { AgentExecutionMission, AgentExecutionOutcome, AgentExecutionPort } from "../ports/outbound/agent-execution-port.js";
import type { AuditTrail } from "../ports/outbound/audit-trail.js";
import type { Clock } from "../ports/outbound/clock.js";
import type { ExecutionRegistryStore } from "../ports/outbound/execution-registry-store.js";
import type { OrchestrationPolicyStore } from "../ports/outbound/orchestration-policy-store.js";
import type { OrchestrationCampaignStore } from "../ports/outbound/orchestration-campaign-store.js";
import type { OrchestrationWorkspaceManager } from "../ports/outbound/orchestration-workspace.js";
import { providerCredentialsFrom, providerLabel, providerMission, requirementsForExecution } from "./orchestration-provider-configuration.js";
import { actionRequired, boundedMissionPrompt, isReadOnlyMission, isSafeProviderSessionId, proofReferencesFor, readOnlyAnalysisVerdict, validatePreparedPrompt } from "./orchestration-proof-validation.js";
import { createOrchestrationMissionPlanner } from "./orchestration-mission-planner.js";
import { createCampaignRuntime } from "./orchestration-campaign-runtime.js";
import { createOrchestrationLifecycle } from "./orchestration-runtime-lifecycle.js";
import { createNodeOrchestrationWorkerLauncher, type OrchestrationWorkerLaunch, type OrchestrationWorkerLauncher } from "./orchestration-worker-launcher.js";
import { delay, frameworkContextForMission, includesAll, isActive, nextExecutionId, nextCampaignId, nextMissionId, resolveBoundedAuthor, type CurrentMissionContext } from "./orchestration-runtime-support.js";

export { configuredProviderHealth } from "./orchestration-provider-configuration.js";
export { createNodeOrchestrationWorkerLauncher } from "./orchestration-worker-launcher.js";
export type { OrchestrationWorkerLaunch, OrchestrationWorkerLauncher } from "./orchestration-worker-launcher.js";
const POLL_INTERVAL_MS = 200;

export interface OrchestrationRuntime extends ForOrchestration {
  /** Internal entrypoint used only by `orchestration _worker`. */
  runWorker(input: OrchestrationWorkerLaunch): Promise<void>;
}
function requireCampaign(campaigns: readonly OrchestrationCampaign[], campaignId: string): OrchestrationCampaign { const campaign = campaigns.find((candidate) => candidate.id === campaignId); if (campaign === undefined) throw new Error(`Campaign ${campaignId} was not found.`); return campaign; }
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
  readonly campaignStore?: OrchestrationCampaignStore;
  readonly workspaceManager?: OrchestrationWorkspaceManager;
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
  const campaignStore = options.campaignStore ?? new FsOrchestrationCampaignStore();
  const workspaceManager = options.workspaceManager ?? new FsOrchestrationWorkspaceManager(options.homeDir);
  const workerStateStore = options.workerStateStore ?? new FsOrchestrationWorkerStateStore(options.homeDir);
  const environment = options.environment ?? process.env;
  const executionPort = options.executionPort ?? createMastraExecutionPort({ providerCredentials: providerCredentialsFrom(environment), localCliEnvironment: environment });
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
  const lifecycle = createOrchestrationLifecycle({ projects: options.projects, registryStore, workerStateStore, launcher, audit, clock });
  const campaignRuntime = createCampaignRuntime({
    frameworkVersion: PRODUCT_VERSION,
    projects: options.projects,
    features: options.features,
    policyStore,
    registryStore,
    campaignStore,
    workspaceManager,
    missionPlanner,
    clock,
    launch: (project, execution) => lifecycle.launchOrReject(project, execution, true),
  });
  return {
    async configure(input) {
      const project = await options.projects.show(input.projectId);
      await lifecycle.auditIntent(project, "orchestration.configure", input.selection.provider);
      try {
        const current = await missionPlanner.loadPolicyForPreview(project);
        const selected = missionPlanner.policyWithUserModel(current, input.selection, clock.now());
        const policy = input.workspaceMode === undefined ? selected : selected.withWorkspaceMode(input.workspaceMode, clock.now());
        await policyStore.save(project, policy);
        await lifecycle.auditSuccess(project, "orchestration.configure", input.selection.provider, {
          provider: input.selection.provider,
          model: input.selection.model,
          workspaceMode: policy.workspaceMode,
        });
        return policy;
      } catch (error) {
        await lifecycle.auditFailure(project, "orchestration.configure", input.selection.provider).catch(() => undefined);
        throw error;
      }
    },

    async preview(input) {
      const project = await options.projects.show(input.projectId);
      return (await missionPlanner.prepareMissionPreview(project, input.featureId)).preview;
    },

    async start(input) {
      const project = await options.projects.show(input.projectId);
      let campaignForCleanup: OrchestrationCampaign | undefined;
      await lifecycle.auditIntent(project, "orchestration.start", input.featureId.value);
      try {
        if (project.orchestrationMode !== "automatic") {
          throw new Error("This Project is in manual mode. Change its orchestration mode explicitly before starting an automatic campaign.");
        }
        await lifecycle.recoverStaleExecutions(project);
        const beforeArming = await missionPlanner.prepareMissionPreview(project, input.featureId);
        const target = missionPlanner.assertConfirmedPreview(beforeArming, input.selection, input.previewFingerprint);
        const confirmedCandidate = beforeArming.preview.candidates.find((candidate) => sameExecutionTarget(candidate.target, target));
        if (confirmedCandidate === undefined) throw new Error("The confirmed CLI runtime is absent from the current preview.");
        const policy = await missionPlanner.loadPolicyForPreview(project);
        if (policy.workspaceMode === "unconfigured") throw new Error("Choose isolated or direct workspace mode before starting an automatic campaign.");
        const campaign = OrchestrationCampaign.planned({
          id: nextCampaignId(),
          projectId: project.id,
          featureId: beforeArming.feature.id,
          target,
          workspaceMode: policy.workspaceMode,
          scopePaths: beforeArming.scopePaths,
          previewFingerprint: input.previewFingerprint,
          frameworkVersion: PRODUCT_VERSION,
          ...(confirmedCandidate.runtimeVersion === undefined ? {} : { runtimeVersion: confirmedCandidate.runtimeVersion }),
          ...(confirmedCandidate.runtimeFingerprint === undefined ? {} : { runtimeFingerprint: confirmedCandidate.runtimeFingerprint }),
          maxMissions: beforeArming.preview.maximumMissions ?? 1,
          retryCount: 0,
          currentStepId: beforeArming.nextStepId,
        }, clock.now());
        campaignForCleanup = campaign;
        await campaignStore.update(project, (campaigns) => {
          const active = campaigns.find((candidate) => !["completed", "cancelled", "abandoned"].includes(candidate.status));
          if (active !== undefined) throw new Error(`Campaign ${active.id} is already ${active.status}; resolve it before starting another.`);
          return [...campaigns, campaign];
        });
        await workspaceManager.prepare(project, campaign);
        const execution = await scheduleNext(project, input.featureId, input.selection, input.previewFingerprint, async (planned) => {
          await campaignRuntime.update(project, campaign.id, (current) => current.start(planned.id, clock.now()));
        });
        if (execution.status === "rejected") {
          await campaignRuntime.update(project, campaign.id, (current) => current.requireAction("inspect", "The local worker could not start; inspect the runtime before retrying.", input.previewFingerprint, clock.now(), "blocked"));
        }
        await lifecycle.auditSuccess(project, "orchestration.start", execution.id, {
          provider: execution.target.provider,
          model: execution.target.model ?? "legacy",
          campaignId: campaign.id,
          workspaceMode: campaign.workspaceMode,
        });
        return execution;
      } catch (error) {
        if (campaignForCleanup !== undefined) await campaignRuntime.cleanupUnstarted(project, campaignForCleanup).catch(() => undefined);
        await lifecycle.auditFailure(project, "orchestration.start", input.featureId.value).catch(() => undefined);
        throw error;
      }
    },
    async status(input) {
      const project = await options.projects.show(input.projectId);
      const [policy, registry, campaigns] = await Promise.all([policyStore.load(project), registryStore.load(project), campaignStore.load(project)]);
      const active = registry.executions.find((record) => isActive(record));
      const latest = registry.executions.at(-1);
      const focus = active ?? latest;
      const activeCampaign = campaigns.find((campaign) => !["completed", "cancelled", "abandoned"].includes(campaign.status));
      const latestCampaign = campaigns.at(-1);
      const campaignAction = activeCampaign?.actionRequired;
      const pendingChanges = activeCampaign?.status === "awaiting_application" ? await workspaceManager.changes(project, activeCampaign).catch(() => undefined) : undefined;
      const changed = pendingChanges?.changes.reduce((counts, change) => ({ ...counts, [change.kind]: counts[change.kind] + 1 }), { created: 0, modified: 0, deleted: 0, renamed: 0 });
      return {
        schemaVersion: 1,
        projectId: project.id.value,
        orchestrationMode: project.orchestrationMode,
        policy,
        executions: registry.executions,
        activeExecution: active,
        latestExecution: latest,
        ...(activeCampaign === undefined ? {} : { activeCampaign }),
        ...(latestCampaign === undefined ? {} : { latestCampaign }),
        projection: projectOrchestration({ projectId: project.id.value, ...(activeCampaign === undefined ? {} : { campaign: activeCampaign }), ...(focus === undefined ? {} : { execution: focus }), ...(changed === undefined ? {} : { changed }), now: clock.now() }),
        actionRequired: campaignAction === undefined
          ? actionRequired(focus)
          : { kind: campaignAction.kind, executionId: focus?.id ?? "campaign", reason: campaignAction.reason },
      };
    },
    async pause(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      const paused = await campaignRuntime.update(project, input.campaignId, (current) => current.pause(clock.now()));
      const active = (await registryStore.load(project)).executions.find((record) => campaign.missionIds.includes(record.id) && isActive(record));
      if (active !== undefined) {
        if (active.status === "running") await executionPort.cancel({ executionId: active.id }).catch(() => undefined);
        await lifecycle.updateExecution(project, active.id, (record, at) => record.interrupt(executionSuspensionReason("interrupted", "The campaign was paused by the user."), at));
      }
      return paused;
    },
    async resume(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      await campaignRuntime.validateContinuation(project, campaign);
      const resumed = await campaignRuntime.update(project, input.campaignId, (candidate) => candidate.resume(input.expectedRevision, clock.now()));
      await campaignRuntime.continueOrBlock(project, resumed, resumed.currentStepId);
      return requireCampaign(await campaignStore.load(project), resumed.id);
    },
    async decide(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      await campaignRuntime.validateContinuation(project, campaign);
      const decided = await campaignRuntime.update(project, input.campaignId, (candidate) => candidate.decide(input, clock.now()));
      await campaignRuntime.continueOrBlock(project, decided, decided.currentStepId);
      return requireCampaign(await campaignStore.load(project), decided.id);
    },
    async changes(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      return workspaceManager.changes(project, campaign);
    },

    async apply(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      if (campaign.actionRequired?.kind !== "apply_changes") throw new Error("This campaign is not waiting for change application.");
      await workspaceManager.apply(project, campaign, input.fingerprint, async () => {
        const currentProject = await options.projects.show(project.id);
        const currentFeature = await options.features.show(campaign.featureId);
        if (!currentFeature.belongsTo(currentProject.id)) throw new Error("Applied Feature no longer belongs to the Project.");
        await missionPlanner.inspectFeature(currentFeature);
      });
      return campaignRuntime.update(project, campaign.id, (current) => current.complete(clock.now()));
    },

    async retryCampaign(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      await campaignRuntime.validateContinuation(project, campaign);
      const executionId = campaign.missionIds.at(-1);
      if (executionId === undefined) throw new Error("The campaign has no mission to retry.");
      const planned = await lifecycle.updateExecution(project, executionId, (record, at) => record.retry(at));
      const resumed = await campaignRuntime.update(project, campaign.id, (current) => current.retry(input, clock.now()));
      const launched = await lifecycle.launchOrReject(project, planned, true);
      if (launched.status === "rejected") {
        return campaignRuntime.update(project, resumed.id, (current) => current.requireAction("inspect", "The confirmed retry could not start; inspect the runtime and create a new preview.", input.fingerprint, clock.now(), "blocked"));
      }
      return resumed;
    },

    async abandon(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      await workspaceManager.discard(project, campaign);
      return campaignRuntime.update(project, campaign.id, (current) => current.abandon(clock.now()));
    },

    async cancelCampaign(input) {
      const project = await options.projects.show(input.projectId);
      const campaign = requireCampaign(await campaignStore.load(project), input.campaignId);
      campaign.assertRevision(input.expectedRevision);
      const cancelled = await campaignRuntime.update(project, campaign.id, (current) => current.cancel(clock.now()));
      const active = (await registryStore.load(project)).executions.find((record) => campaign.missionIds.includes(record.id) && isActive(record));
      if (active !== undefined) {
        if (active.status === "running") await executionPort.cancel({ executionId: active.id }).catch(() => undefined);
        await lifecycle.updateExecution(project, active.id, (record, at) => record.cancel(executionSuspensionReason("cancelled_by_user", "The campaign was cancelled by the user."), at));
      }
      // The private mirror is intentionally retained. `abandon` is the only
      // explicit action that discards it before retention cleanup.
      return cancelled;
    },

    async cancel(input) {
      const project = await options.projects.show(input.projectId);
      await lifecycle.auditIntent(project, "orchestration.cancel", input.executionId);
      try {
        const campaign = (await campaignStore.load(project)).find((candidate) => !["completed", "cancelled", "abandoned"].includes(candidate.status) && candidate.missionIds.includes(input.executionId));
        if (campaign !== undefined) throw new Error(`Execution ${input.executionId} belongs to automatic campaign ${campaign.id}; cancel the campaign with its current revision instead.`);
        const execution = await lifecycle.updateExecution(project, input.executionId, (record, at) => record.cancel(
          executionSuspensionReason("cancelled_by_user", "Cancellation requested explicitly by the user."),
          at,
        ));
        await lifecycle.auditSuccess(project, "orchestration.cancel", execution.id, { status: execution.status });
        return execution;
      } catch (error) {
        await lifecycle.auditFailure(project, "orchestration.cancel", input.executionId).catch(() => undefined);
        throw error;
      }
    },

    async approve(input) {
      const project = await options.projects.show(input.projectId);
      await lifecycle.auditIntent(project, "orchestration.approve", input.executionId);
      try {
        await lifecycle.recoverStaleExecutions(project);
        const campaign = (await campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(input.executionId));
        if (campaign !== undefined) throw new Error(`Execution ${input.executionId} belongs to automatic campaign ${campaign.id}; generic approval is not an allowed campaign action.`);
        const planned = await lifecycle.updateExecution(project, input.executionId, (record, at) => record.approve(at));
        const execution = await lifecycle.launchOrReject(project, planned);
        await lifecycle.auditSuccess(project, "orchestration.approve", execution.id, { provider: execution.provider, status: execution.status });
        return execution;
      } catch (error) {
        await lifecycle.auditFailure(project, "orchestration.approve", input.executionId).catch(() => undefined);
        throw error;
      }
    },

    async retry(input) {
      const project = await options.projects.show(input.projectId);
      await lifecycle.auditIntent(project, "orchestration.retry", input.executionId);
      try {
        await lifecycle.recoverStaleExecutions(project);
        const campaign = (await campaignStore.load(project)).find((candidate) => !["completed", "cancelled", "abandoned"].includes(candidate.status) && candidate.missionIds.includes(input.executionId));
        if (campaign !== undefined) throw new Error(`Execution ${input.executionId} belongs to automatic campaign ${campaign.id}; confirm the campaign retry instead.`);
        const planned = await lifecycle.updateExecution(project, input.executionId, (record, at) => record.retry(at));
        const execution = await lifecycle.launchOrReject(project, planned);
        await lifecycle.auditSuccess(project, "orchestration.retry", execution.id, { provider: execution.provider, status: execution.status });
        return execution;
      } catch (error) {
        await lifecycle.auditFailure(project, "orchestration.retry", input.executionId).catch(() => undefined);
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
          if (ownsExecution) await lifecycle.safelyInterruptWorker(project, input.executionId);
          else await lifecycle.safelyRejectWorkerStartup(project, input.executionId);
          await lifecycle.auditFailure(project, "orchestration.worker", input.executionId).catch(() => undefined);
        }
        // The detached CLI worker must not report a successful exit when it
        // could not even claim or dispatch its planned mission. The original
        // error can contain provider/runtime details, so keep the public
        // message fixed and persist only the bounded suspension reason.
        throw new Error("Orchestration worker terminated safely after an internal failure.");
      } finally {
        if (project !== undefined) await campaignRuntime.reconcileFailure(project, input.executionId).catch(() => undefined);
        if (hasState && project !== undefined) await workerStateStore.clear(project.id, input.executionId).catch(() => undefined);
      }
    },
  };

  async function scheduleNext(
    project: Project,
    requestedFeatureId: Parameters<ForFeatures["show"]>[0],
    selection: OrchestrationTargetSelection,
    previewFingerprint: string,
    beforeLaunch?: (execution: ExecutionRecord) => Promise<void>,
  ): Promise<ExecutionRecord> {
    let currentProject = await lifecycle.requireAutomaticProject(project);
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
    currentProject = await lifecycle.requireAutomaticProject(currentProject);
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
    if (beforeLaunch !== undefined) await beforeLaunch(execution);
    return lifecycle.launchOrReject(currentProject, execution, true);
  }

  async function loadCurrentMissionContext(project: Project, record: ExecutionRecord): Promise<CurrentMissionContext | undefined> {
    const featureId = record.order.scope.featureId;
    if (featureId === undefined) {
      await lifecycle.rejectPlanned(project, record.id, "scope_changed", "A Feature scope is required for automatic execution.");
      return undefined;
    }
    let feature: Feature;
    try {
      feature = await options.features.show(featureId);
      if (!feature.belongsTo(project.id)) throw new Error("feature-project-mismatch");
      const campaign = (await campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(record.id));
      if (campaign === undefined) throw new Error("campaign-missing");
      const workspaceFeature = await campaignRuntime.featureInWorkspace(project, feature, campaign);
      const current = await missionPlanner.inspectWorkspaceFeature(project, workspaceFeature);
      const next = current.report.nextActions[0];
      if (next === undefined) throw new MissionPreconditionError("Pipeline no longer has an actionable next step.");
      const context: MissionOrderContext = {
        scope: { projectId: project.id, featureId: feature.id, paths: record.order.scope.paths },
        pipelineId: feature.pipelineId,
        nextStepId: next.stepId,
      };
      record.order.assertCurrent(context);
      if (record.target.source !== "user" || record.target.model === undefined) {
        await lifecycle.rejectPlanned(project, record.id, "policy_rejected", "This legacy mission has no confirmed model and cannot be dispatched or retried.");
        return undefined;
      }
      const policy = await policyStore.load(project);
      if (policy === undefined || !policy.allowsTarget(record.target, {
        capabilities: record.order.requiredCapabilities,
        permissions: record.order.requiredPermissions,
      })) {
        await lifecycle.rejectPlanned(project, record.id, "policy_rejected", "The Project policy no longer authorizes the confirmed assistant and version.");
        return undefined;
      }
      const health = await missionPlanner.targetHealth(project, policy);
      const healthy = health.find((entry) => sameExecutionTarget(entry.target, record.target));
      if (healthy?.healthy !== true || !includesAll(healthy.capabilities, record.order.requiredCapabilities)) {
        await lifecycle.rejectPlanned(project, record.id, "worker_unavailable", "The confirmed assistant and version are no longer available for this mission.");
        return undefined;
      }
      const role = roleForStep(next.stepId);
      if (role === undefined) {
        await lifecycle.rejectPlanned(project, record.id, "precondition_changed", "The current Pipeline step has no bounded execution role.");
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
      await lifecycle.rejectPlanned(project, record.id, code, "The Project, Feature, scope, or Pipeline preconditions changed before dispatch.");
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
      const campaign = (await campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(record.id));
      if (campaign === undefined) throw new Error("The mission has no durable campaign envelope.");
      const workspace = await workspaceManager.open(project, campaign);
      const workspaceFeature = await campaignRuntime.featureInWorkspace(project, rechecked.feature, campaign);
      const productAgentId = (await options.agents.sessions(project)).find((binding) => binding.sessionId.value === "main")?.agent.id.value;
      const begun = await lifecycle.updateExecution(project, executionId, (candidate, at) => candidate.begin({ at }));
      const frameworkContext = frameworkContextForMission({ frameworkVersion: PRODUCT_VERSION, project, campaign, context: rechecked, skill: prompt.skill, ...(productAgentId === undefined ? {} : { productAgentId }) });
      const mission = providerMission(begun, boundedMissionPrompt(begun, prompt.skill, rechecked.role, authorAgentId), workspace.physicalRoot, environment, frameworkContext);
      return { record: begun, mission, context: { ...rechecked, feature: workspaceFeature, authorAgentId } };
    } catch {
      const current = (await registryStore.load(project)).find(executionId);
      if (current?.status === "running") {
        await lifecycle.updateExecution(project, executionId, (candidate, at) => candidate.fail(
          executionSuspensionReason("worker_unavailable", "The bounded provider mission could not be prepared after dispatch began."),
          at,
        )).catch(() => undefined);
      } else {
        await lifecycle.rejectPlanned(project, executionId, "precondition_changed", "The bounded provider mission could not be prepared from the current Pipeline state.");
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
      current = await lifecycle.updateExecution(project, executionId, (record, at) => record.recordProviderSession(outcome.sessionId!, at));
    }
    if (outcome.status === "awaiting_approval") {
      // ACP permission requests have no portable, trustworthy contract for a
      // command/path grant. Never make `approve` an opaque escalation loop.
      await lifecycle.updateExecution(project, executionId, (record, at) => record.fail(
        executionSuspensionReason("permission_not_preapproved", "The provider requested a permission that is not structurally provable inside the preauthorized Feature scope."),
        at,
      ));
      return;
    }
    if (outcome.status === "completed") {
      if (outcome.receipts?.some((receipt) => receipt.startsWith("receipt-decision-")) === true) {
        await lifecycle.updateExecution(project, executionId, (record, at) => record.fail(executionSuspensionReason("decision_required", "The worker requested a Product decision and was stopped before further work."), at));
        const campaign = (await campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(executionId));
        if (campaign !== undefined) await campaignRuntime.requestDecision(project, campaign, "The worker found an unplanned Product decision that must be resolved before continuing.");
        return;
      }
      if (isReadOnlyMission(current)) {
        const verdict = readOnlyAnalysisVerdict(outcome.output, current);
        if (verdict === undefined) {
          await lifecycle.updateExecution(project, executionId, (record, at) => record.fail(
            executionSuspensionReason("missing_proof", "The read-only provider completion has no bounded analysis conclusion and execution proof."),
            at,
          ));
          return;
        }
        const succeeded = await lifecycle.updateExecution(project, executionId, (record, at) => record.succeed([
          `analysis:verdict:${verdict}`,
        ], at));
        await lifecycle.auditSuccess(project, "orchestration.succeed", succeeded.id, {
          provider: succeeded.target.provider,
          model: succeeded.target.model ?? "legacy",
        });
        // Provider output remains ephemeral. The registry retains only a
        // closed conclusion and asks the human to validate the Pipeline
        // document separately, so it cannot become a secret-bearing log.
        await lifecycle.updateExecution(project, executionId, (record, at) => record.appendEvent(
          "read_only_analysis_ready",
          "A bounded read-only analysis conclusion is ready for human review.",
          at,
        ));
        await lifecycle.updateExecution(project, executionId, (record, at) => record.appendEvent(
          "manual_pipeline_validation_required",
          "The Pipeline remains unchanged until a human validates the official document.",
          at,
        ));
        const campaign = (await campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(executionId));
        if (campaign !== undefined) await campaignRuntime.update(project, campaign.id, (candidate) => candidate.requireAction("inspect", "Review the bounded analysis before the campaign can continue.", campaign.previewFingerprint, clock.now()));
        return;
      }
      const proofReferences = await proofReferencesFor({
        before: context.report,
        featureRoot: context.feature.root,
        expectedAuthorAgentId: context.authorAgentId,
        record: current,
        outcome,
        inspect: async () => (await missionPlanner.inspectWorkspaceFeature(project, context.feature)).report,
      });
      if (proofReferences.length === 0) {
        await lifecycle.updateExecution(project, executionId, (record, at) => record.fail(
          executionSuspensionReason("missing_proof", "The provider completed without an execution-bound proof marker and a new valid Pipeline document."),
          at,
        ));
        return;
      }
      const succeeded = await lifecycle.updateExecution(project, executionId, (record, at) => record.succeed(proofReferences, at));
      await lifecycle.auditSuccess(project, "orchestration.succeed", succeeded.id, {
        provider: succeeded.target.provider,
        model: succeeded.target.model ?? "legacy",
      });
      await lifecycle.updateExecution(project, executionId, (record, at) => record.appendEvent(
        "campaign_recalculated",
        "Arka validated this result and recalculated the campaign from the mirrored Pipeline.",
        at,
      ));
      const campaign = (await campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(executionId));
      if (campaign?.workspaceMode === "direct") await workspaceManager.snapshotDirectBaseline(project, campaign);
      await campaignRuntime.advance(project, executionId, context.feature);
      return;
    }
    if (outcome.status === "cancelled") {
      await lifecycle.updateExecution(project, executionId, (record, at) => record.interrupt(
        executionSuspensionReason("interrupted", "The worker stopped before it returned verifiable proof."),
        at,
      ));
      return;
    }
    const reason = outcome.status === "interrupted" ? "interrupted" : "provider_error";
    await lifecycle.updateExecution(project, executionId, (record, at) => record.fail(
      executionSuspensionReason(reason, outcome.status === "interrupted"
        ? "The provider run was interrupted. Retry creates a fresh run."
        : "The provider failed before it returned verifiable proof."),
      at,
    ));
  }

}
