/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { randomBytes } from "node:crypto";
import { join } from "node:path";

import { FsExecutionRegistryStore } from "../../adapters/outbound/filesystem/fs-orchestration-execution-registry-store.js";
import { FsOrchestrationWorkerStateStore } from "../../adapters/outbound/filesystem/fs-orchestration-worker-state-store.js";
import { FsOrchestrationCampaignStore } from "../../adapters/outbound/filesystem/fs-orchestration-campaign-store.js";
import { FsOrchestrationWorkspaceManager } from "../../adapters/outbound/filesystem/fs-orchestration-workspace.js";
import { FsOrchestrationCampaignV23Store } from "../../adapters/outbound/filesystem/fs-orchestration-campaign-v23-store.js";
import { FsOrchestrationEventStore } from "../../adapters/outbound/filesystem/fs-orchestration-event-store.js";
import { readJson } from "../../adapters/outbound/filesystem/_shared/atomic-json.js";
import { FsAuditStore } from "../../adapters/outbound/filesystem/fs-audit-store.js";
import { LocalAuditCollector } from "../../adapters/outbound/audit/local-audit-collector.js";
import { AuditService, type AuditProjectContext } from "../audit/audit-service.js";
import type { FsLocalePreferenceStore } from "../../adapters/outbound/filesystem/fs-locale-preference-store.js";
import { resolveLocale, translate } from "../localization/locale.js";
import { roleForStep } from "../agents/agent-orchestration.js";
import { projectOrchestration } from "../../domain/orchestration/orchestration-projection.js";
import { projectCampaignEvents } from "../../domain/orchestration/orchestration-event.js";
import { createGovernanceEvent } from "../../domain/governance/governance-event.js";
import { reduceGovernance } from "../../domain/governance/governance-ledger.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
import type { Feature } from "../../domain/feature/feature.js";
import { createWebOnboardingState } from "../../domain/onboarding/web-onboarding-state.js";
import { ProjectId } from "../../domain/project/project-id.js";
import type { Project } from "../../domain/project/project.js";
import { framingPlanFingerprint } from "../../domain/framing/framing-plan.js";
import type { DoctorReport, ForDoctor } from "../../ports/inbound/for-doctor.js";
import type { ForAgentOrchestration } from "../../ports/inbound/for-agent-orchestration.js";
import type { ForPipeline, PipelineAuthorAuthorization } from "../../ports/inbound/for-pipeline.js";
import type { ForFraming } from "../../ports/inbound/for-framing.js";
import type { GovernanceStore } from "../../ports/outbound/governance-store.js";
import type { FolderPicker } from "../../ports/outbound/folder-picker.js";
import type { ManagementRuntime } from "../../composition/management-runtime.js";
import type {
  AgentTrackingView,
  AuditRunView,
  AuditTrackingView,
  CreateGovernanceEventInput,
  FeatureContinuationView,
  FeatureTrackingView,
  FramingDetailView,
  FramingSummaryView,
  GovernanceEventView,
  GovernanceView,
  HumanDocumentView,
  OrchestrationTrackingView,
  ProjectListItem,
  ProjectOverview,
  ProjectRelationshipGraph,
  PrepareAuditInput,
  ProductPromptTarget,
  ProductPromptView,
  RelationshipEdge,
  RelationshipNode,
  SaveWebPreferencesInput,
  TrackingHealth,
  WebPreferences,
} from "./contracts.js";
import { createFeatureTrackingView } from "./feature-tracking.js";
import { framingDetail, framingSummary, revisionMilestone } from "./framing-projection.js";
import { v23Campaign, v23Dag, v23Tasks } from "./orchestration-v23-projection.js";

interface TrackingServiceOptions {
  readonly management: ManagementRuntime;
  readonly pipeline: ForPipeline;
  readonly agentOrchestration: ForAgentOrchestration;
  readonly governance: GovernanceStore;
  readonly preferences: FsLocalePreferenceStore;
  readonly doctor: ForDoctor;
  readonly folderPicker: FolderPicker;
  readonly homeDir: string;
  readonly framing: ForFraming;
  readonly environment?: Readonly<Record<string, string | undefined>>;
  readonly now?: () => Date;
}

export class ProjectTrackingService {
  private readonly executions = new FsExecutionRegistryStore();
  private readonly campaigns = new FsOrchestrationCampaignStore();
  private readonly workspaces: FsOrchestrationWorkspaceManager;
  private readonly workers: FsOrchestrationWorkerStateStore;
  private readonly campaignsV23: FsOrchestrationCampaignV23Store;
  private readonly eventsV23: FsOrchestrationEventStore;
  private readonly now: () => Date;

  public constructor(private readonly options: TrackingServiceOptions) {
    this.workers = new FsOrchestrationWorkerStateStore(options.homeDir);
    this.workspaces = new FsOrchestrationWorkspaceManager(options.homeDir);
    this.campaignsV23 = new FsOrchestrationCampaignV23Store(options.homeDir);
    this.eventsV23 = new FsOrchestrationEventStore(options.homeDir);
    this.now = options.now ?? (() => new Date());
  }

  public async listProjects(): Promise<readonly ProjectListItem[]> {
    const projects = await this.options.management.projects.list();
    return Promise.all(projects.map(async (project) => {
      const overview = await this.getProject(project.id.value);
      return {
        id: project.id.value, name: project.name, root: project.root, featureCount: overview.counts.features,
        health: overview.health, updatedAt: project.updatedAt.toISOString(),
      };
    }));
  }

  public async getProject(projectId: string): Promise<ProjectOverview> {
    const project = await this.project(projectId);
    const [features, governance, audits, orchestrations, framings] = await Promise.all([
      this.options.management.features.list(project.id), this.getGovernance(projectId), this.getAudits(projectId), this.getOrchestrations(projectId), this.listFramings(projectId),
    ]);
    const summaries = await Promise.all(features.map(async (feature) => {
      const report = await this.inspectFeature(project, feature);
      return (await createFeatureTrackingView(feature, report));
    }));
    const health = worstHealth(summaries.map((feature) => feature.health));
    const observedAt = this.now();
    return {
      id: project.id.value,
      name: project.name,
      root: project.root,
      health,
      orchestrationMode: project.orchestrationMode,
      coverage: { tracked: summaries.length, total: features.length },
      freshness: { observedAt: observedAt.toISOString(), stale: false },
      counts: {
        features: features.length,
        completedFeatures: summaries.filter((feature) => feature.status === "completed").length,
        blockedFeatures: summaries.filter((feature) => feature.health === "blocked" || feature.health === "invalid").length,
        invalidDocuments: summaries.reduce((count, feature) => count + feature.invalidDocumentCount, 0),
        openDecisions: governance.openDecisions.length,
        openCorrections: governance.openCorrections.length,
        audits: audits.length,
        activeOrchestrations: orchestrations.filter((item) => item.status === "running" || item.status === "planned" || item.status === "awaiting_approval" || item.status === "awaiting_application" || item.status === "authorized").length,
      },
      features: summaries,
      ...(framings[0] === undefined ? {} : { framing: framings.find((item) => !item.published) ?? framings[0] }),
    };
  }

  public async getFeature(projectId: string, featureId: string): Promise<FeatureTrackingView> {
    const project = await this.project(projectId);
    const feature = await this.feature(project, featureId);
    const view = await createFeatureTrackingView(feature, await this.inspectFeature(project, feature));
    const framing = await this.featureFraming(feature);
    return { ...view, ...(framing === undefined ? {} : { framing }) };
  }

  public async listFramings(projectId: string): Promise<readonly FramingSummaryView[]> {
    const references = await this.options.framing.list(projectId);
    const values: FramingSummaryView[] = [];
    for (const reference of references) {
      const plan = await this.options.framing.show(projectId, reference.framingId);
      values.push(framingSummary(plan));
    }
    return values;
  }

  public async getFraming(projectId: string, framingId: string): Promise<FramingDetailView> {
    const plan = await this.options.framing.show(projectId, framingId);
    const history: Array<FramingDetailView["history"][number]> = [];
    for (let revision = 1; revision <= plan.revision; revision += 1) {
      const candidate = await this.options.framing.showRevision(projectId, framingId, revision);
      if (candidate !== undefined) history.push({
        revision, updatedAt: candidate.updatedAt, fingerprint: framingPlanFingerprint(candidate), milestone: revisionMilestone(candidate),
      });
    }
    return framingDetail(plan, history);
  }

  public async startFraming(projectId: string, input: { readonly existingFeatureId?: string; readonly newFeatureTitle?: string }): Promise<FramingDetailView> {
    const project = await this.project(projectId);
    const preferences = await this.getPreferences();
    const entry = await this.options.framing.enter({
      path: project.root,
      contentLocale: preferences.resolvedLocale,
      ...(input.existingFeatureId === undefined ? {} : { existingFeatureId: input.existingFeatureId }),
      ...(input.newFeatureTitle === undefined ? {} : { newFeatureTitle: input.newFeatureTitle }),
    });
    return this.getFraming(projectId, entry.plan.target.framingId);
  }

  public async getFeatureContinuation(projectId: string, featureId: string): Promise<FeatureContinuationView> {
    const advice = await this.options.agentOrchestration.advise({ projectId: ProjectId.of(projectId), featureId: FeatureId.of(featureId) });
    const requiredRole = advice.frameworkContext?.expectedRole;
    const product = advice.productPrincipal;
    const blocked = product.status === "conflict";
    const kind = advice.nextStepId === undefined
      ? "complete"
      : blocked ? "blocked" : requiredRole === "product" ? "product" : "specialist";
    return {
      projectId,
      featureId,
      orchestrationMode: advice.orchestrationMode,
      phase: advice.phase,
      ...(advice.nextStepId === undefined ? {} : { nextStepId: advice.nextStepId }),
      ...(requiredRole === undefined ? {} : { requiredRole }),
      kind,
      product: {
        sessionId: "main",
        status: product.status,
        ...(product.agentId === undefined ? {} : { agentId: product.agentId }),
      },
      canPrepareProduct: !blocked && requiredRole === "product" && advice.nextStepId !== undefined,
      canResumeProduct: !blocked && product.agentId !== undefined,
    };
  }

  public async prepareProductPrompt(
    projectId: string,
    featureId: string,
    input: { readonly target: ProductPromptTarget; readonly purpose: "next_step" | "resume" },
  ): Promise<ProductPromptView> {
    if (!(["chatgpt", "claude"] as const).includes(input.target)) throw new Error("Unsupported Product prompt target.");
    if (!(["next_step", "resume"] as const).includes(input.purpose)) throw new Error("Unsupported Product prompt purpose.");
    const ids = { projectId: ProjectId.of(projectId), featureId: FeatureId.of(featureId) };
    const advice = await this.options.agentOrchestration.advise(ids);
    const requiredRole = advice.frameworkContext?.expectedRole;
    if (advice.productPrincipal.status === "conflict") throw new Error("The main Product session has an identity conflict.");
    if (input.purpose === "next_step" && (requiredRole !== "product" || advice.nextStepId === undefined)) {
      throw new Error("The next verified step does not belong to Product.");
    }
    if (input.purpose === "resume" && advice.productPrincipal.agentId === undefined) {
      throw new Error("No Product identity is available to resume.");
    }
    const existing = advice.productPrincipal.agentId !== undefined;
    const prepared = existing
      ? await this.options.agentOrchestration.productHandoffPrompt(ids)
      : await this.options.agentOrchestration.initializationPrompt({
        ...ids,
        role: "product",
        provider: input.target === "chatgpt" ? "ChatGPT" : "Claude.ai",
        mode: "execute",
      });
    return {
      projectId,
      featureId,
      sessionId: "main",
      target: input.target,
      targetUrl: input.target === "chatgpt" ? "https://chatgpt.com/" : "https://claude.ai/new",
      purpose: input.purpose,
      reusesAgent: existing,
      ...(advice.productPrincipal.agentId === undefined ? {} : { agentId: advice.productPrincipal.agentId }),
      ...(input.purpose === "next_step" && advice.nextStepId !== undefined ? { expectedStepId: advice.nextStepId } : {}),
      prompt: prepared.prompt,
    };
  }

  public async getDocument(projectId: string, featureId: string, documentId: string): Promise<HumanDocumentView> {
    const feature = await this.getFeature(projectId, featureId);
    const document = feature.documents.find((candidate) => candidate.id === documentId);
    if (document === undefined) throw new Error(`Document not found: ${documentId}`);
    return document;
  }

  public async getGovernance(projectId: string): Promise<GovernanceView> {
    const ledger = await this.options.governance.load(await this.project(projectId));
    const state = reduceGovernance(ledger);
    return {
      revision: ledger.revision,
      openDecisions: state.openDecisions.map(eventView),
      openCorrections: state.openCorrections.map(eventView),
      acknowledgements: state.acknowledgements.map(eventView),
      history: state.history.map(eventView),
    };
  }

  public async appendGovernance(projectId: string, input: CreateGovernanceEventInput): Promise<GovernanceView> {
    const project = await this.project(projectId);
    const preferences = await this.options.preferences.loadPreferences();
    if (preferences.humanProfile === undefined) throw new Error("A human profile is required before recording governance.");
    const event = createGovernanceEvent({
      id: `gov_${randomBytes(12).toString("hex")}`,
      kind: input.kind,
      projectId,
      targets: input.targets,
      reason: input.reason,
      occurredAt: this.now().toISOString(),
      author: preferences.humanProfile,
      ...(input.resolvesEventId === undefined ? {} : { resolvesEventId: input.resolvesEventId }),
      ...(input.supersedesEventId === undefined ? {} : { supersedesEventId: input.supersedesEventId }),
    });
    await this.options.governance.append(project, event);
    return this.getGovernance(projectId);
  }

  public async getAgents(projectId: string): Promise<readonly AgentTrackingView[]> {
    const project = await this.project(projectId);
    const [agents, features] = await Promise.all([this.options.management.agents.list(project), this.options.management.features.list(project.id)]);
    const documents = (await Promise.all(features.map((feature) => this.getFeature(projectId, feature.id.value)))).flatMap((feature) => feature.documents);
    return agents.map((agent) => ({
      id: agent.id.value,
      provider: agent.provider,
      role: agent.role,
      active: agent.active,
      featureIds: agent.scope.featureIds.map((id) => id.value),
      paths: agent.scope.paths,
      responsibilities: agent.scope.responsibilities,
      productionIds: documents.filter((document) => document.authorAgentId === agent.id.value).map((document) => document.id),
    }));
  }

  public async getAudits(projectId: string): Promise<readonly AuditTrackingView[]> {
    const project = await this.project(projectId);
    const index = await readJson<unknown>(join(project.root, ".arka-norn", "audits", "index.json"));
    if (!isRecord(index) || index["schemaVersion"] !== 1 || !Array.isArray(index["audits"])) return [];
    return index["audits"].flatMap(parseAuditEntry);
  }

  public async getAudit(projectId: string, auditId: string): Promise<AuditRunView> {
    const { service } = await this.auditContext(projectId);
    return auditRunView(await service.requiredRun(auditId));
  }

  public async prepareAudit(projectId: string, input: PrepareAuditInput): Promise<AuditRunView> {
    const resolved = await this.auditContext(projectId, input.featureId);
    const run = await resolved.service.prepare(resolved.context, {
      objective: input.objective,
      mode: input.mode,
      paths: input.featureId === undefined ? input.paths : [resolved.context.featurePath!],
      modules: input.modules,
      sources: { paths: [], urls: [] },
      capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
    });
    return auditRunView(run);
  }

  public async startAudit(projectId: string, auditId: string, confirmation: string): Promise<AuditRunView> {
    const resolved = await this.auditContext(projectId);
    const run = await resolved.service.requiredRun(auditId);
    const context = await this.auditProjectContext(await this.project(projectId), run.featureId ?? undefined);
    return auditRunView(await resolved.service.start(context, auditId, confirmation));
  }

  public async finalizeAudit(projectId: string, auditId: string): Promise<AuditRunView> {
    const { service } = await this.auditContext(projectId);
    return auditRunView((await service.finalize(auditId)).run);
  }

  public async cancelAudit(projectId: string, auditId: string): Promise<AuditRunView> {
    const { service } = await this.auditContext(projectId);
    return auditRunView(await service.cancel(auditId));
  }

  public async resumeAudit(projectId: string, auditId: string): Promise<AuditRunView> {
    const resolved = await this.auditContext(projectId);
    const run = await resolved.service.requiredRun(auditId);
    const context = await this.auditProjectContext(await this.project(projectId), run.featureId ?? undefined);
    return auditRunView(await resolved.service.resume(context, auditId));
  }

  public async getOrchestrations(projectId: string): Promise<readonly OrchestrationTrackingView[]> {
    const project = await this.project(projectId);
    const [registry, campaigns] = await Promise.all([this.executions.load(project), this.campaigns.load(project)]);
    const legacy = await Promise.all(registry.executions.map(async (record) => {
      const worker = await this.workers.load(project.id, record.id).catch(() => undefined);
      const startedAt = record.attempts.at(-1)?.startedAt;
      const endedAt = record.attempts.at(-1)?.endedAt;
      const heartbeatAlive = worker !== undefined && this.now().getTime() - worker.updatedAt.getTime() < 60_000;
      const lastEvent = record.events.at(-1);
      const campaign = campaigns.find((candidate) => candidate.missionIds.includes(record.id));
      const changedFiles = campaign?.status === "awaiting_application"
        ? summarizeChanges((await this.workspaces.changes(project, campaign).catch(() => undefined))?.changes ?? [])
        : undefined;
      const changed = changedFiles === undefined ? undefined : { created: changedFiles.created, modified: changedFiles.modified, deleted: changedFiles.deleted, renamed: changedFiles.renamed };
      const role = roleForStep(record.order.preconditions.nextStepId);
      return {
        id: record.id,
        status: record.status,
        ...(record.order.scope.featureId === undefined ? {} : { featureId: record.order.scope.featureId.value }),
        stepId: record.order.preconditions.nextStepId,
        ...(role === undefined ? {} : { role }),
        provider: record.target.provider,
        ...(record.target.model === undefined ? {} : { model: record.target.model }),
        ...(record.providerSessionId === undefined ? {} : { providerSessionId: record.providerSessionId }),
        ...(startedAt === undefined ? {} : { startedAt: startedAt.toISOString() }),
        updatedAt: record.updatedAt.toISOString(),
        ...(startedAt === undefined ? {} : { durationMs: (endedAt ?? this.now()).getTime() - startedAt.getTime() }),
        ...(worker === undefined ? {} : { heartbeatAt: worker.updatedAt.toISOString() }),
        heartbeatAlive,
        ...(lastEvent === undefined ? {} : { lastEvent: { type: lastEvent.type, at: lastEvent.at.toISOString() } }),
        timeline: record.events.slice(-20).map((event) => ({ type: event.type, at: event.at.toISOString() })),
        stale: (record.status === "planned" || record.status === "running") && !heartbeatAlive,
        providerUsage: { available: false as const },
        proofReferences: record.proofReferences,
        projection: projectOrchestration({ projectId, ...(campaign === undefined ? {} : { campaign }), execution: record, ...(changed === undefined ? {} : { changed }), now: this.now() }),
        ...(record.suspensionReason === undefined ? {} : { suspension: record.suspensionReason }),
        ...(campaign === undefined ? {} : { campaign: {
          id: campaign.id,
          status: campaign.status,
          revision: campaign.revision,
          workspaceMode: campaign.workspaceMode,
          completedMissions: campaign.missionIds.length,
          maximumMissions: campaign.maxMissions,
          currentStepId: campaign.currentStepId,
          decisionCount: campaign.decisions.length,
          ...(campaign.runtimeVersion === undefined ? {} : { runtimeVersion: campaign.runtimeVersion }),
          ...(changedFiles === undefined ? {} : { changedFiles }),
          ...(campaign.actionRequired === undefined ? {} : { actionRequired: { kind: campaign.actionRequired.kind, reason: campaign.actionRequired.reason } }),
        } }),
      };
    }));
    return [...await this.getV23Orchestrations(project), ...legacy];
  }

  private async getV23Orchestrations(project: Project): Promise<readonly OrchestrationTrackingView[]> {
    const ids = await this.campaignsV23.listCampaignIds(project.id.value);
    return Promise.all(ids.map(async (id) => this.getV23Orchestration(project, id)));
  }

  private async getV23Orchestration(project: Project, id: string): Promise<OrchestrationTrackingView> {
    const plan = await this.campaignsV23.loadPlan(project.id.value, id);
    if (plan === undefined) throw new Error(`Norn 2.3 campaign plan is missing: ${id}`);
    const [events, attempts, result, application, authorization] = await Promise.all([
      this.eventsV23.load(project.id.value, id),
      this.campaignsV23.loadAttempts(project.id.value, id),
      this.campaignsV23.loadResult(project.id.value, id),
      this.campaignsV23.loadApplication(project.id.value, id),
      this.campaignsV23.loadAuthorization(project.id.value, id, plan),
    ]);
    const projection = projectCampaignEvents(events);
    const tasks = v23Tasks(plan, attempts, projection);
    const activeTask = tasks.find((task) => task.status === "running" || task.status === "prepared") ?? tasks.find((task) => task.status === "planned") ?? tasks.at(-1);
    const lastEvent = events.at(-1);
    const status = projection?.status ?? "planned";
    return {
      id,
      status,
      featureId: plan.props.featureId,
      stepId: activeTask?.id ?? "campaign",
      role: activeTask?.role ?? "orchestration",
      provider: "Norn DAG",
      ...(activeTask?.profileId === undefined ? {} : { model: activeTask.profileId }),
      startedAt: plan.props.createdAt.toISOString(),
      updatedAt: lastEvent?.at.toISOString() ?? plan.props.createdAt.toISOString(),
      durationMs: (lastEvent?.at ?? this.now()).getTime() - plan.props.createdAt.getTime(),
      heartbeatAlive: false,
      ...(lastEvent === undefined ? {} : { lastEvent: { type: lastEvent.kind, at: lastEvent.at.toISOString() } }),
      timeline: events.slice(-50).map((event) => ({ type: event.taskId === undefined ? event.kind : `${event.kind}:${event.taskId}`, at: event.at.toISOString() })),
      stale: status === "running" && lastEvent !== undefined && this.now().getTime() - lastEvent.at.getTime() >= 60_000,
      providerUsage: { available: false },
      proofReferences: [...new Set(attempts.flatMap((attempt) => [...attempt.props.proofReferences]))],
      dag: v23Dag(plan, tasks, result, application, authorization),
      campaign: v23Campaign(id, status, plan, projection, activeTask?.id),
    };
  }

  public async getGraph(projectId: string, featureId?: string): Promise<ProjectRelationshipGraph> {
    const project = await this.project(projectId);
    const features = featureId === undefined
      ? await this.options.management.features.list(project.id)
      : [await this.feature(project, featureId)];
    const views = await Promise.all(features.map((feature) => this.getFeature(projectId, feature.id.value)));
    const governance = await this.getGovernance(projectId);
    const agents = await this.getAgents(projectId);
    return buildGraph(project, views, governance, agents);
  }

  public async getPreferences(): Promise<WebPreferences> {
    const preferences = await this.options.preferences.loadPreferences();
    return {
      locale: preferences.locale,
      resolvedLocale: resolveLocale({
        preference: preferences.locale,
        ...(this.options.environment === undefined ? {} : { environment: this.options.environment }),
      }),
      preferredSurface: preferences.preferredSurface,
      ...(preferences.humanProfile === undefined ? {} : { humanProfile: preferences.humanProfile }),
      ...(preferences.onboarding === undefined ? {} : { onboarding: preferences.onboarding }),
    };
  }

  public async savePreferences(input: SaveWebPreferencesInput): Promise<WebPreferences> {
    if (input.locale !== undefined) await this.options.preferences.save(input.locale);
    if (input.name !== undefined) await this.options.preferences.saveHumanProfile({ name: input.name, ...(input.email === undefined ? {} : { email: input.email }) });
    if (input.preferredSurface !== undefined) await this.options.preferences.savePreferredSurface(input.preferredSurface);
    if (input.onboarding !== undefined) {
      const preferences = await this.options.preferences.loadPreferences();
      if (preferences.humanProfile === undefined) throw new Error("A human profile is required before saving Web onboarding.");
      await this.options.preferences.saveOnboardingState(createWebOnboardingState(input.onboarding, preferences.humanProfile.id, this.now()));
    }
    return this.getPreferences();
  }

  public async pickFolder(input: { readonly purpose?: "project" | "feature"; readonly defaultPath?: string }): Promise<string | null> {
    if (input.purpose !== "project" && input.purpose !== "feature") throw new Error("A valid folder picker purpose is required.");
    if (input.defaultPath !== undefined && (typeof input.defaultPath !== "string" || input.defaultPath.length > 4_096)) {
      throw new Error("The folder picker default path is invalid.");
    }
    const preferences = await this.getPreferences();
    return this.options.folderPicker.pick({
      title: translate(
        input.purpose === "project" ? "web.folderPicker.projectTitle" : "web.folderPicker.featureTitle",
        {},
        preferences.resolvedLocale,
      ),
      ...(input.defaultPath === undefined ? {} : { defaultPath: input.defaultPath }),
    });
  }

  public async createProject(input: { readonly id: string; readonly name: string; readonly root: string }): Promise<ProjectOverview> {
    const project = await this.options.management.projects.create({ id: ProjectId.of(input.id), name: input.name, root: input.root });
    return this.getProject(project.id.value);
  }

  public async createFeature(projectId: string, input: { readonly id: string; readonly name: string; readonly root: string; readonly pipelineId?: string }): Promise<FeatureTrackingView> {
    const project = await this.project(projectId);
    const feature = await this.options.management.features.create({
      id: FeatureId.of(input.id), projectId: project.id, name: input.name, root: input.root,
      ...(input.pipelineId === undefined ? {} : { pipelineId: input.pipelineId }),
    });
    return this.getFeature(projectId, feature.id.value);
  }

  public inspectDoctor(): Promise<DoctorReport> {
    return this.options.doctor.run();
  }

  public repairDoctor(input: { readonly apply: boolean; readonly confirmed: boolean }): Promise<DoctorReport> {
    if (input.apply && !input.confirmed) throw new Error("Doctor apply requires explicit confirmation.");
    return this.options.doctor.run({ repair: true, apply: input.apply });
  }

  private project(id: string): Promise<Project> {
    return this.options.management.projects.show(ProjectId.of(id));
  }

  private async feature(project: Project, id: string): Promise<Feature> {
    const feature = await this.options.management.features.show(FeatureId.of(id));
    if (!feature.projectId.equals(project.id)) throw new Error("Feature belongs to another Project.");
    return feature;
  }

  private async featureFraming(feature: Feature): Promise<FramingDetailView | undefined> {
    if (feature.framingPlanRef === null) return undefined;
    const references = await this.options.framing.list(feature.projectId.value);
    const reference = references.find((item) => item.planId === feature.framingPlanRef?.planId);
    return reference === undefined ? undefined : this.getFraming(feature.projectId.value, reference.framingId);
  }

  private async inspectFeature(project: Project, feature: Feature) {
    const agents = await this.options.management.agents.list(project);
    const authorRegistry: readonly PipelineAuthorAuthorization[] = agents.map((agent) => ({ id: agent.id.value, active: agent.active, authorized: agent.coversFeature(feature.id) }));
    return this.options.pipeline.inspect({
      featureRoot: feature.root,
      featureId: feature.id.value,
      pipelineId: feature.pipelineId,
      documentContractVersion: feature.documentContractVersion,
      authorRegistry,
    });
  }

  private async auditContext(projectId: string, featureId?: string): Promise<{ readonly service: AuditService; readonly context: AuditProjectContext }> {
    const project = await this.project(projectId);
    return {
      service: new AuditService(new FsAuditStore(project.root), new LocalAuditCollector(), this.now),
      context: await this.auditProjectContext(project, featureId),
    };
  }

  private async auditProjectContext(project: Project, featureId?: string): Promise<AuditProjectContext> {
    if (featureId === undefined) return { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: null, featurePath: null };
    const feature = await this.feature(project, featureId);
    const featurePath = feature.root.slice(project.root.length + 1).replaceAll("\\", "/");
    return { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: feature.id.value, featurePath };
  }
}

function eventView(event: ReturnType<typeof reduceGovernance>["history"][number]): GovernanceEventView {
  return { ...event, targets: event.targets, author: event.author };
}

function worstHealth(values: readonly TrackingHealth[]): TrackingHealth {
  const order: readonly TrackingHealth[] = ["healthy", "attention", "blocked", "invalid"];
  return values.reduce((worst, value) => order.indexOf(value) > order.indexOf(worst) ? value : worst, "healthy");
}

function buildGraph(project: Project, features: readonly FeatureTrackingView[], governance: GovernanceView, agents: readonly AgentTrackingView[]): ProjectRelationshipGraph {
  const nodes: RelationshipNode[] = [{ id: `project:${project.id.value}`, kind: "project", label: project.name }];
  const edges: RelationshipEdge[] = [];
  for (const feature of features) {
    const featureNode = `feature:${feature.id}`;
    nodes.push({ id: featureNode, kind: "feature", label: feature.name, status: feature.status, featureId: feature.id });
    edges.push(edge("contains", `project:${project.id.value}`, featureNode));
    for (const step of feature.steps) {
      const stepNode = `step:${feature.id}:${step.id}`;
      nodes.push({ id: stepNode, kind: "step", label: step.id, status: step.status, featureId: feature.id });
      edges.push(edge("contains", featureNode, stepNode));
    }
    for (const document of feature.documents) {
      const documentNode = `document:${document.id}`;
      nodes.push({ id: documentNode, kind: "document", label: document.title, status: document.valid ? "valid" : "invalid", featureId: feature.id });
      edges.push(edge("produced", `step:${feature.id}:${document.stepId}`, documentNode));
      for (const dependency of document.dependencies) edges.push(edge("depends_on", documentNode, `document:${dependency.id}`, !dependency.resolved));
      if (document.authorAgentId !== undefined) edges.push(edge("authored_by", documentNode, `agent:${document.authorAgentId}`));
    }
  }
  for (const agent of agents) nodes.push({ id: `agent:${agent.id}`, kind: "agent", label: `${agent.provider} · ${agent.role}`, status: agent.active ? "active" : "inactive" });
  for (const decision of governance.history) {
    nodes.push({ id: `decision:${decision.id}`, kind: "decision", label: decision.reason, status: decision.kind });
    for (const target of decision.targets) edges.push(edge("targets", `decision:${decision.id}`, `${target.type}:${target.id}`));
  }
  return { nodes, edges, anomalies: features.flatMap((feature) => feature.anomalies) };
}

function edge(kind: RelationshipEdge["kind"], source: string, target: string, broken = false): RelationshipEdge {
  return { id: `${kind}:${source}:${target}`, source, target, kind, ...(broken ? { broken: true } : {}) };
}

function parseAuditEntry(value: unknown): readonly AuditTrackingView[] {
  if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["status"] !== "string"
    || typeof value["mode"] !== "string" || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string") return [];
  return [{
    id: value["id"], status: value["status"], mode: value["mode"], createdAt: value["createdAt"], updatedAt: value["updatedAt"],
    ...(typeof value["featureId"] === "string" ? { featureId: value["featureId"] } : {}),
    ...(typeof value["commitExact"] === "string" ? { commitExact: value["commitExact"] } : {}),
  }];
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function summarizeChanges(changes: readonly { readonly path: string; readonly previousPath?: string; readonly kind: "created" | "modified" | "deleted" | "renamed"; readonly binary: boolean }[]) {
  const created = changes.filter((change) => change.kind === "created").length;
  const modified = changes.filter((change) => change.kind === "modified").length;
  const deleted = changes.filter((change) => change.kind === "deleted").length;
  const renamed = changes.filter((change) => change.kind === "renamed").length;
  return {
    total: changes.length,
    created,
    modified,
    deleted,
    renamed,
    files: changes.slice(0, 100).map((change) => ({
      path: change.path,
      ...(change.previousPath === undefined ? {} : { previousPath: change.previousPath }),
      kind: change.kind,
      binary: change.binary,
      risk: change.binary || change.kind === "deleted" ? "high" as const : change.kind === "modified" || change.kind === "renamed" ? "medium" as const : "low" as const,
    })),
  };
}

function auditRunView(run: Awaited<ReturnType<AuditService["requiredRun"]>>): AuditRunView {
  return {
    id: run.id,
    status: run.status,
    fingerprint: run.fingerprint,
    ...(run.featureId === null ? {} : { featureId: run.featureId }),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    selectedModules: run.selectedModules,
    plan: {
      scopePaths: run.plan.scopePaths,
      logicalCommands: run.plan.logicalCommands,
      estimatedDuration: run.plan.estimatedDuration,
      requiresAdditionalConfirmation: run.plan.requiresAdditionalConfirmation,
    },
  };
}
