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
import { AuditService } from "../audit/audit-service.js";
import { resolveLocale, translate } from "../localization/locale.js";
import { projectCampaignEvents } from "../../domain/orchestration/orchestration-event.js";
import { createGovernanceEvent } from "../../domain/governance/governance-event.js";
import { reduceGovernance } from "../../domain/governance/governance-ledger.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
import { createWebOnboardingState } from "../../domain/onboarding/web-onboarding-state.js";
import { ProjectId } from "../../domain/project/project-id.js";
import { framingPlanFingerprint } from "../../domain/framing/framing-plan.js";
import { createFeatureTrackingView } from "./feature-tracking.js";
import { framingDetail, framingSummary, revisionMilestone } from "./framing-projection.js";
import { v23Campaign, v23Dag, v23Tasks } from "./orchestration-v23-projection.js";
import { createLegacyOrchestrationView } from "./legacy-orchestration-projection.js";
import { createProjectDraftListItem, createProjectDraftOverview } from "./project-draft-projection.js";
import { CAPABILITY_CATALOG } from "../capabilities/capability-registry.js";
import { buildProjectRelationshipGraph } from "./relationship-graph.js";
import { projectOrchestrationModeView, setProjectOrchestrationMode } from "./project-orchestration-mode-service.js";
import { agentRegistryView, deactivateAgent, registerAgent, replaceAgent, selectAgent } from "./agent-management-service.js";
import { createDoctorRepairCoordinator, DoctorRepairPlanChangedError } from "../doctor/doctor-repair-coordinator.js";
import { WebMutationError } from "./web-mutation-concurrency.js";
export class ProjectTrackingService {
    options;
    executions = new FsExecutionRegistryStore();
    campaigns = new FsOrchestrationCampaignStore();
    workspaces;
    workers;
    campaignsV23;
    eventsV23;
    now;
    doctorRepairs;
    constructor(options) {
        this.options = options;
        this.workers = new FsOrchestrationWorkerStateStore(options.homeDir);
        this.workspaces = new FsOrchestrationWorkspaceManager(options.homeDir);
        this.campaignsV23 = new FsOrchestrationCampaignV23Store(options.homeDir);
        this.eventsV23 = new FsOrchestrationEventStore(options.homeDir);
        this.now = options.now ?? (() => new Date());
        this.doctorRepairs = createDoctorRepairCoordinator(options.doctor, {
            now: this.now,
            ...(options.doctorExclusive === undefined ? {} : { exclusive: options.doctorExclusive }),
        });
    }
    getCapabilities() {
        return CAPABILITY_CATALOG;
    }
    async listProjects() {
        const [projects, drafts] = await Promise.all([
            this.options.management.projects.list(),
            this.options.framing.listProjectDrafts(),
        ]);
        const materialized = await Promise.all(projects.map(async (project) => {
            const overview = await this.getProject(project.id.value);
            return {
                id: project.id.value, name: project.name, root: project.root, featureCount: overview.counts.features,
                health: overview.health, updatedAt: project.updatedAt.toISOString(), lifecycle: "materialized",
                ...(overview.framing === undefined ? {} : { framing: overview.framing }),
            };
        }));
        const projectedDrafts = await Promise.all(drafts.map(async (draft) => {
            const framing = await this.latestFraming(draft.id);
            return createProjectDraftListItem(draft, framing);
        }));
        return [...materialized, ...projectedDrafts].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    async getProject(projectId) {
        const project = (await this.options.management.projects.list()).find((candidate) => candidate.id.value === projectId);
        if (project === undefined) {
            const draft = await this.options.framing.showProjectDraft(projectId);
            if (draft === undefined) {
                await this.project(projectId);
                throw new Error("Unreachable Project resolution.");
            }
            return createProjectDraftOverview(draft, await this.latestFraming(draft.id));
        }
        const [features, governance, audits, orchestrations, framings] = await Promise.all([
            this.options.management.features.list(project.id), this.getGovernance(projectId), this.getAudits(projectId), this.getOrchestrations(projectId), this.listFramings(projectId),
        ]);
        const summaries = await Promise.all(features.map(async (feature) => {
            const report = await this.inspectFeature(project, feature);
            return (await createFeatureTrackingView(feature, report));
        }));
        const health = worstHealth(summaries.map((feature) => feature.health));
        const orchestration = await projectOrchestrationModeView(this.options.orchestrationConfigurations, project, orchestrations);
        const observedAt = this.now();
        return {
            id: project.id.value,
            name: project.name,
            root: project.root,
            updatedAt: project.updatedAt.toISOString(),
            health,
            orchestrationMode: project.orchestrationMode,
            orchestration,
            lifecycle: "materialized",
            availability: { markerReady: true, reason: null },
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
    async setProjectOrchestrationMode(projectId, input) {
        await setProjectOrchestrationMode({ management: this.options.management, framing: this.options.framing, configurations: this.options.orchestrationConfigurations, now: this.now }, projectId, input);
        return this.getProject(projectId);
    }
    async enterProjectFraming(input) {
        if (typeof input.root !== "string" || input.root.trim().length === 0 || input.root.length > 4_096) {
            throw new Error("A valid Project root is required for framing.");
        }
        const preferences = await this.getPreferences();
        const entry = await this.options.framing.enter({ path: input.root, contentLocale: preferences.resolvedLocale });
        return this.getProject(entry.project.id.value);
    }
    async getFeature(projectId, featureId) {
        const project = await this.project(projectId);
        const feature = await this.feature(project, featureId);
        const view = await createFeatureTrackingView(feature, await this.inspectFeature(project, feature));
        const framing = await this.featureFraming(feature);
        return { ...view, ...(framing === undefined ? {} : { framing }) };
    }
    async listFramings(projectId) {
        const references = await this.options.framing.list(projectId);
        const values = [];
        for (const reference of references) {
            const plan = await this.options.framing.show(projectId, reference.framingId);
            values.push(framingSummary(plan));
        }
        return values;
    }
    async getFraming(projectId, framingId) {
        const plan = await this.options.framing.show(projectId, framingId);
        const history = [];
        for (let revision = 1; revision <= plan.revision; revision += 1) {
            const candidate = await this.options.framing.showRevision(projectId, framingId, revision);
            if (candidate !== undefined)
                history.push({
                    revision, updatedAt: candidate.updatedAt, fingerprint: framingPlanFingerprint(candidate), milestone: revisionMilestone(candidate),
                });
        }
        return framingDetail(plan, history);
    }
    async startFraming(projectId, input) {
        const draft = await this.options.framing.showProjectDraft(projectId);
        const root = draft?.root ?? (await this.project(projectId)).root;
        const preferences = await this.getPreferences();
        const entry = await this.options.framing.enter({
            path: root,
            contentLocale: preferences.resolvedLocale,
            ...(input.existingFeatureId === undefined ? {} : { existingFeatureId: input.existingFeatureId }),
            ...(input.newFeatureTitle === undefined ? {} : { newFeatureTitle: input.newFeatureTitle }),
        });
        return this.getFraming(projectId, entry.plan.target.framingId);
    }
    async latestFraming(projectId) {
        const values = await this.listFramings(projectId);
        return values.find((item) => !item.published) ?? values[0];
    }
    async getFeatureContinuation(projectId, featureId) {
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
    async prepareProductPrompt(projectId, featureId, input) {
        if (!["chatgpt", "claude"].includes(input.target))
            throw new Error("Unsupported Product prompt target.");
        if (!["next_step", "resume"].includes(input.purpose))
            throw new Error("Unsupported Product prompt purpose.");
        const ids = { projectId: ProjectId.of(projectId), featureId: FeatureId.of(featureId) };
        const advice = await this.options.agentOrchestration.advise(ids);
        const requiredRole = advice.frameworkContext?.expectedRole;
        if (advice.productPrincipal.status === "conflict")
            throw new Error("The main Product session has an identity conflict.");
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
    async getDocument(projectId, featureId, documentId) {
        const feature = await this.getFeature(projectId, featureId);
        const document = feature.documents.find((candidate) => candidate.id === documentId);
        if (document === undefined)
            throw new Error(`Document not found: ${documentId}`);
        return document;
    }
    async getGovernance(projectId) {
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
    async appendGovernance(projectId, input) {
        const project = await this.project(projectId);
        const preferences = await this.options.preferences.loadPreferences();
        if (preferences.humanProfile === undefined)
            throw new Error("A human profile is required before recording governance.");
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
    async getAgents(projectId) {
        const project = await this.project(projectId);
        const features = await this.options.management.features.list(project.id);
        const documents = (await Promise.all(features.map((feature) => this.getFeature(projectId, feature.id.value)))).flatMap((feature) => feature.documents);
        const productions = new Map(documents.flatMap((document) => document.authorAgentId === undefined ? [] : [[document.authorAgentId, documents.filter((item) => item.authorAgentId === document.authorAgentId).map((item) => item.id)]]));
        return agentRegistryView({ management: this.options.management, registry: this.options.agentRegistry }, project, productions);
    }
    async registerAgent(projectId, input) { await registerAgent(this.agentManagementDeps(), projectId, input); return this.getAgents(projectId); }
    async selectAgent(projectId, agentId, input) { await selectAgent(this.agentManagementDeps(), projectId, agentId, input); return this.getAgents(projectId); }
    async replaceAgent(projectId, agentId, input) { await replaceAgent(this.agentManagementDeps(), projectId, agentId, input); return this.getAgents(projectId); }
    async deactivateAgent(projectId, agentId, input) { await deactivateAgent(this.agentManagementDeps(), projectId, agentId, input); return this.getAgents(projectId); }
    async getAudits(projectId) {
        const project = await this.project(projectId);
        const index = await readJson(join(project.root, ".arka-norn", "audits", "index.json"));
        if (!isRecord(index) || index["schemaVersion"] !== 1 || !Array.isArray(index["audits"]))
            return [];
        return index["audits"].flatMap(parseAuditEntry);
    }
    async getAudit(projectId, auditId) {
        const { service } = await this.auditContext(projectId);
        return auditRunView(await service.requiredRun(auditId));
    }
    async prepareAudit(projectId, input) {
        const resolved = await this.auditContext(projectId, input.featureId);
        const run = await resolved.service.prepare(resolved.context, {
            objective: input.objective,
            mode: input.mode,
            paths: input.featureId === undefined ? input.paths : [resolved.context.featurePath],
            modules: input.modules,
            sources: { paths: [], urls: [] },
            capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
        });
        return auditRunView(run);
    }
    async startAudit(projectId, auditId, confirmation) {
        const resolved = await this.auditContext(projectId);
        const run = await resolved.service.requiredRun(auditId);
        const context = await this.auditProjectContext(await this.project(projectId), run.featureId ?? undefined);
        return auditRunView(await resolved.service.start(context, auditId, confirmation));
    }
    async finalizeAudit(projectId, auditId) {
        const { service } = await this.auditContext(projectId);
        return auditRunView((await service.finalize(auditId)).run);
    }
    async cancelAudit(projectId, auditId) {
        const { service } = await this.auditContext(projectId);
        return auditRunView(await service.cancel(auditId));
    }
    async resumeAudit(projectId, auditId) {
        const resolved = await this.auditContext(projectId);
        const run = await resolved.service.requiredRun(auditId);
        const context = await this.auditProjectContext(await this.project(projectId), run.featureId ?? undefined);
        return auditRunView(await resolved.service.resume(context, auditId));
    }
    async getOrchestrations(projectId) {
        const project = await this.project(projectId);
        const [registry, campaigns] = await Promise.all([this.executions.load(project), this.campaigns.load(project)]);
        const legacy = await Promise.all(registry.executions.map(async (record) => {
            const worker = await this.workers.load(project.id, record.id).catch(() => undefined);
            const campaign = campaigns.find((candidate) => candidate.missionIds.includes(record.id));
            const changes = campaign?.status === "awaiting_application"
                ? (await this.workspaces.changes(project, campaign).catch(() => undefined))?.changes
                : undefined;
            return createLegacyOrchestrationView({
                projectId,
                record,
                ...(worker === undefined ? {} : { worker }),
                ...(campaign === undefined ? {} : { campaign }),
                ...(changes === undefined ? {} : { changes }),
                now: this.now,
            });
        }));
        return [...await this.getV23Orchestrations(project), ...legacy];
    }
    async getV23Orchestrations(project) {
        const ids = await this.campaignsV23.listCampaignIds(project.id.value);
        return Promise.all(ids.map(async (id) => this.getV23Orchestration(project, id)));
    }
    async getV23Orchestration(project, id) {
        const plan = await this.campaignsV23.loadPlan(project.id.value, id);
        if (plan === undefined)
            throw new Error(`Norn 2.3 campaign plan is missing: ${id}`);
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
    async getGraph(projectId, featureId) {
        const project = await this.project(projectId);
        const features = featureId === undefined
            ? await this.options.management.features.list(project.id)
            : [await this.feature(project, featureId)];
        const views = await Promise.all(features.map((feature) => this.getFeature(projectId, feature.id.value)));
        const governance = await this.getGovernance(projectId);
        const agents = await this.getAgents(projectId);
        return buildProjectRelationshipGraph(project, views, governance, agents.agents);
    }
    async getPreferences() {
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
    async savePreferences(input) {
        if (input.locale !== undefined)
            await this.options.preferences.save(input.locale);
        if (input.name !== undefined)
            await this.options.preferences.saveHumanProfile({ name: input.name, ...(input.email === undefined ? {} : { email: input.email }) });
        if (input.preferredSurface !== undefined)
            await this.options.preferences.savePreferredSurface(input.preferredSurface);
        if (input.onboarding !== undefined) {
            const preferences = await this.options.preferences.loadPreferences();
            if (preferences.humanProfile === undefined)
                throw new Error("A human profile is required before saving Web onboarding.");
            await this.options.preferences.saveOnboardingState(createWebOnboardingState(input.onboarding, preferences.humanProfile.id, this.now()));
        }
        return this.getPreferences();
    }
    async pickFolder(input) {
        if (input.purpose !== "project" && input.purpose !== "feature")
            throw new Error("A valid folder picker purpose is required.");
        if (input.defaultPath !== undefined && (typeof input.defaultPath !== "string" || input.defaultPath.length > 4_096)) {
            throw new Error("The folder picker default path is invalid.");
        }
        const preferences = await this.getPreferences();
        return this.options.folderPicker.pick({
            title: translate(input.purpose === "project" ? "web.folderPicker.projectTitle" : "web.folderPicker.featureTitle", {}, preferences.resolvedLocale),
            ...(input.defaultPath === undefined ? {} : { defaultPath: input.defaultPath }),
        });
    }
    async createProject(input) {
        const project = await this.options.management.projects.create({ id: ProjectId.of(input.id), name: input.name, root: input.root });
        return this.getProject(project.id.value);
    }
    async createFeature(projectId, input) {
        const project = await this.project(projectId);
        const feature = await this.options.management.features.create({
            id: FeatureId.of(input.id), projectId: project.id, name: input.name, root: input.root,
            ...(input.pipelineId === undefined ? {} : { pipelineId: input.pipelineId }),
        });
        return this.getFeature(projectId, feature.id.value);
    }
    inspectDoctor() {
        return this.doctorRepairs.inspect();
    }
    previewDoctorRepairs() {
        return this.doctorRepairs.preview();
    }
    async applyDoctorRepairs(input) {
        if (!input.confirmed)
            throw new WebMutationError(400, "invalid_doctor_confirmation");
        try {
            return await this.doctorRepairs.apply({ fingerprint: input.fingerprint, confirmed: true });
        }
        catch (error) {
            if (error instanceof DoctorRepairPlanChangedError) {
                throw new WebMutationError(409, "repair_plan_changed", { plan: error.plan });
            }
            throw error;
        }
    }
    project(id) {
        return this.options.management.projects.show(ProjectId.of(id));
    }
    agentManagementDeps() { return { management: this.options.management, registry: this.options.agentRegistry, agentsForSession: this.options.agentsForSession }; }
    async feature(project, id) {
        const feature = await this.options.management.features.show(FeatureId.of(id));
        if (!feature.projectId.equals(project.id))
            throw new Error("Feature belongs to another Project.");
        return feature;
    }
    async featureFraming(feature) {
        if (feature.framingPlanRef === null)
            return undefined;
        const references = await this.options.framing.list(feature.projectId.value);
        const reference = references.find((item) => item.planId === feature.framingPlanRef?.planId);
        return reference === undefined ? undefined : this.getFraming(feature.projectId.value, reference.framingId);
    }
    async inspectFeature(project, feature) {
        const agents = await this.options.management.agents.list(project);
        const authorRegistry = agents.map((agent) => ({ id: agent.id.value, active: agent.active, authorized: agent.coversFeature(feature.id) }));
        return this.options.pipeline.inspect({
            featureRoot: feature.root,
            featureId: feature.id.value,
            pipelineId: feature.pipelineId,
            documentContractVersion: feature.documentContractVersion,
            authorRegistry,
        });
    }
    async auditContext(projectId, featureId) {
        const project = await this.project(projectId);
        return {
            service: new AuditService(new FsAuditStore(project.root), new LocalAuditCollector(), this.now),
            context: await this.auditProjectContext(project, featureId),
        };
    }
    async auditProjectContext(project, featureId) {
        if (featureId === undefined)
            return { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: null, featurePath: null };
        const feature = await this.feature(project, featureId);
        const featurePath = feature.root.slice(project.root.length + 1).replaceAll("\\", "/");
        return { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: feature.id.value, featurePath };
    }
}
function eventView(event) {
    return { ...event, targets: event.targets, author: event.author };
}
function worstHealth(values) {
    const order = ["healthy", "attention", "blocked", "invalid"];
    return values.reduce((worst, value) => order.indexOf(value) > order.indexOf(worst) ? value : worst, "healthy");
}
function parseAuditEntry(value) {
    if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["status"] !== "string"
        || typeof value["mode"] !== "string" || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string")
        return [];
    return [{
            id: value["id"], status: value["status"], mode: value["mode"], createdAt: value["createdAt"], updatedAt: value["updatedAt"],
            ...(typeof value["featureId"] === "string" ? { featureId: value["featureId"] } : {}),
            ...(typeof value["commitExact"] === "string" ? { commitExact: value["commitExact"] } : {}),
        }];
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function auditRunView(run) {
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
//# sourceMappingURL=project-tracking-service.js.map