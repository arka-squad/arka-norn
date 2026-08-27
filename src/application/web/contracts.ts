/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { GovernanceEventKind, GovernanceTarget } from "../../domain/governance/governance-event.js";
import type { WebOnboardingProgress, WebOnboardingState } from "../../domain/onboarding/web-onboarding-state.js";
import type { OrchestrationProjection } from "../../domain/orchestration/orchestration-projection.js";
import type { DoctorInspectionReport, DoctorRepairOutcome, DoctorRepairPlan } from "../../ports/inbound/for-doctor.js";
import type { CapabilityCatalog, CapabilityInvalidationScope } from "../capabilities/capability-registry.js";

export type TrackingHealth = "healthy" | "attention" | "blocked" | "invalid";

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly featureCount: number;
  readonly health: TrackingHealth;
  readonly updatedAt: string;
  readonly lifecycle: "draft" | "materialized";
  readonly materialization?: "draft" | "publishing" | "recovery_required";
  readonly framing?: FramingSummaryView;
}

export interface ProjectOverview {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly updatedAt: string;
  readonly health: TrackingHealth;
  readonly orchestrationMode: "manual" | "automatic";
  readonly orchestration: ProjectOrchestrationModeView;
  readonly lifecycle: "draft" | "materialized";
  readonly materialization?: "draft" | "publishing" | "recovery_required";
  readonly availability: {
    readonly markerReady: boolean;
    readonly reason: "framing_publication_required" | "project_recovery_required" | null;
  };
  readonly coverage: { readonly tracked: number; readonly total: number };
  readonly freshness: { readonly observedAt: string; readonly stale: boolean };
  readonly counts: {
    readonly features: number;
    readonly completedFeatures: number;
    readonly blockedFeatures: number;
    readonly invalidDocuments: number;
    readonly openDecisions: number;
    readonly openCorrections: number;
    readonly audits: number;
    readonly activeOrchestrations: number;
  };
  readonly features: readonly FeatureSummary[];
  readonly framing?: FramingSummaryView;
}

export interface ProjectOrchestrationModeView {
  readonly activeRuns: readonly { readonly id: string; readonly status: string }[];
  readonly preflight: {
    readonly readyForPreview: boolean;
    readonly configurationPresent: boolean;
    readonly configuredProfiles: number;
    readonly enabledProfiles: number;
    readonly missing: readonly ("project_materialization" | "configuration_missing" | "enabled_profile_missing" | "configuration_invalid")[];
  };
}

export interface FeatureSummary {
  readonly id: string;
  readonly name: string;
  readonly pipelineId: string;
  readonly pipelineDefinitionVersion?: "legacy-2.0" | "2.3";
  readonly status: string;
  readonly health: TrackingHealth;
  readonly progress: { readonly completed: number; readonly required: number };
  readonly nextStepId?: string;
  readonly updatedAt: string;
  readonly documentCount: number;
  readonly invalidDocumentCount: number;
}

export interface FeatureTrackingView extends FeatureSummary {
  readonly root: string;
  readonly projectId: string;
  readonly documentContractVersion: number;
  readonly steps: readonly TrackingStep[];
  readonly documents: readonly HumanDocumentView[];
  readonly anomalies: readonly TrackingAnomaly[];
  readonly framing?: FramingDetailView;
}

export interface FramingSummaryView {
  readonly planId: string;
  readonly framingId: string;
  readonly targetKind: "project" | "feature";
  readonly targetTitle: string;
  readonly revision: number;
  readonly repositoryNature: "empty" | "skeleton" | "implemented" | "indeterminate";
  readonly attention: "agent" | "human_substance" | "human_stabilization" | "worker" | "complete" | "recoverable_failure";
  readonly published: boolean;
  readonly summary: string;
  readonly nextMove: string;
  readonly recommendedPipelineId: string | null;
  readonly updatedAt: string;
}

export interface FramingDetailView extends FramingSummaryView {
  readonly resumeContext: string;
  readonly sections: readonly {
    readonly id: string;
    readonly title: string;
    readonly items: readonly { readonly id: string; readonly text: string; readonly source: string; readonly active: boolean }[];
  }[];
  readonly evidence: {
    readonly snapshot: string;
    readonly gitCommit: string | null;
    readonly inventory: {
      readonly files: number;
      readonly sourceFiles: number;
      readonly testFiles: number;
      readonly manifestFiles: number;
      readonly constraintFiles: number;
    };
    readonly claims: readonly { readonly id: string; readonly text: string; readonly reference: string }[];
    readonly limitations: readonly string[];
  };
  readonly decomposition: null | {
    readonly kind: "features" | "lots";
    readonly entries: readonly { readonly id: string; readonly title: string; readonly outcome: string; readonly dependsOn: readonly string[] }[];
  };
  readonly history: readonly { readonly revision: number; readonly updatedAt: string; readonly fingerprint: string; readonly milestone: string }[];
  readonly stabilizations: readonly { readonly label: string; readonly confirmedAt: string; readonly actorId: string; readonly fingerprint: string }[];
}

export type ProductPromptTarget = "chatgpt" | "claude";

export interface FeatureContinuationView {
  readonly projectId: string;
  readonly featureId: string;
  readonly orchestrationMode: "manual" | "automatic";
  readonly phase: string;
  readonly nextStepId?: string;
  readonly requiredRole?: "product" | "architecte" | "audit" | "dev" | "qa";
  readonly kind: "complete" | "product" | "specialist" | "blocked";
  readonly product: {
    readonly sessionId: "main";
    readonly status: "ready" | "unbound" | "missing" | "conflict";
    readonly agentId?: string;
  };
  readonly canPrepareProduct: boolean;
  readonly canResumeProduct: boolean;
}

export interface ProductPromptView {
  readonly projectId: string;
  readonly featureId: string;
  readonly sessionId: "main";
  readonly target: ProductPromptTarget;
  readonly targetUrl: string;
  readonly purpose: "next_step" | "resume";
  readonly reusesAgent: boolean;
  readonly agentId?: string;
  readonly expectedStepId?: string;
  readonly prompt: string;
}

export interface TrackingStep {
  readonly id: string;
  readonly order: number;
  readonly required: boolean;
  readonly status: string;
  readonly businessStatus: string;
  readonly documentIds: readonly string[];
}

export interface TrackingAnomaly {
  readonly code: "invalid_document" | "broken_dependency" | "unknown_file" | "pipeline_error";
  readonly message: string;
  readonly documentId?: string;
}

export interface HumanDocumentView {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly featureId?: string;
  readonly stepId: string;
  readonly valid: boolean;
  readonly obsolete: boolean;
  readonly authorAgentId?: string;
  readonly createdAt?: string;
  readonly dependencies: readonly DocumentReference[];
  readonly presentation: {
    readonly version?: string;
    readonly documentDate?: string;
    readonly status?: string;
    readonly contentLocale?: string;
  };
  readonly sections: readonly HumanDocumentSection[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly raw: Readonly<Record<string, unknown>>;
  readonly errors: readonly string[];
}

export interface DocumentReference {
  readonly id: string;
  readonly resolved: boolean;
  readonly title?: string;
}

export interface HumanDocumentSection {
  readonly id: string;
  readonly title: string;
  readonly kind: "fields" | "list" | "table" | "text";
  readonly value: unknown;
}

export interface ProjectRelationshipGraph {
  readonly nodes: readonly RelationshipNode[];
  readonly edges: readonly RelationshipEdge[];
  readonly anomalies: readonly TrackingAnomaly[];
}

export interface RelationshipNode {
  readonly id: string;
  readonly kind: "project" | "feature" | "step" | "document" | "agent" | "decision" | "audit";
  readonly label: string;
  readonly status?: string;
  readonly featureId?: string;
}

export interface RelationshipEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly kind: "contains" | "produced" | "depends_on" | "authored_by" | "targets";
  readonly broken?: boolean;
}

export interface GovernanceView {
  readonly revision: number;
  readonly openDecisions: readonly GovernanceEventView[];
  readonly openCorrections: readonly GovernanceEventView[];
  readonly acknowledgements: readonly GovernanceEventView[];
  readonly history: readonly GovernanceEventView[];
}

export interface GovernanceEventView {
  readonly id: string;
  readonly kind: GovernanceEventKind;
  readonly targets: readonly GovernanceTarget[];
  readonly reason: string;
  readonly occurredAt: string;
  readonly author: { readonly id: string; readonly name: string; readonly email?: string };
  readonly resolvesEventId?: string;
  readonly supersedesEventId?: string;
}

export interface AgentTrackingView {
  readonly id: string;
  readonly provider: string;
  readonly role: string;
  readonly active: boolean;
  readonly featureIds: readonly string[];
  readonly paths: readonly string[];
  readonly responsibilities: readonly string[];
  readonly productionIds: readonly string[];
  readonly currentSessionIds: readonly string[];
  readonly replacesAgentId?: string;
  readonly replacedByAgentId?: string;
  readonly registeredAt: string;
  readonly updatedAt: string;
  readonly registryRevision: number;
}

export interface AgentRegistryView {
  readonly registryRevision: number;
  readonly agents: readonly AgentTrackingView[];
}

export interface AgentMutationInput {
  readonly provider: string;
  readonly role: string;
  readonly sessionId: string;
  readonly scope?: { readonly featureIds?: readonly string[]; readonly paths?: readonly string[]; readonly responsibilities?: readonly string[] };
  readonly expectedRegistryRevision: number;
}

export interface AuditTrackingView {
  readonly id: string;
  readonly status: string;
  readonly mode: string;
  readonly featureId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly commitExact?: string;
}

export interface AuditRunView {
  readonly id: string;
  readonly status: string;
  readonly fingerprint: string;
  readonly featureId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly selectedModules: readonly string[];
  readonly plan: {
    readonly scopePaths: readonly string[];
    readonly logicalCommands: readonly string[];
    readonly estimatedDuration: string;
    readonly requiresAdditionalConfirmation: boolean;
  };
}

export interface PrepareAuditInput {
  readonly featureId?: string;
  readonly objective: string;
  readonly mode: "discovery" | "audit" | "mixed";
  readonly paths: readonly string[];
  readonly modules: readonly { readonly moduleId: string; readonly intent: "discover" | "audit"; readonly depth: "inventory" | "static"; readonly criteria: readonly string[] }[];
}

export interface OrchestrationTrackingView {
  readonly id: string;
  readonly status: string;
  readonly featureId?: string;
  readonly stepId: string;
  readonly role?: string;
  readonly provider: string;
  readonly model?: string;
  readonly agentId?: string;
  readonly providerSessionId?: string;
  readonly startedAt?: string;
  readonly updatedAt: string;
  readonly durationMs?: number;
  readonly heartbeatAt?: string;
  readonly heartbeatAlive: boolean;
  readonly lastEvent?: { readonly type: string; readonly at: string };
  readonly timeline: readonly { readonly type: string; readonly at: string }[];
  readonly stale: boolean;
  readonly providerUsage: { readonly available: false } | { readonly available: true; readonly consumed: number; readonly unit: string };
  readonly proofReferences: readonly string[];
  readonly projection?: OrchestrationProjection;
  readonly suspension?: { readonly code: string; readonly detail: string };
  readonly dag?: {
    readonly planFingerprint: string;
    readonly riskPolicyFingerprint?: string;
    readonly tasks: readonly {
      readonly id: string;
      readonly agentId: string;
      readonly role: string;
      readonly status: string;
      readonly profileId?: string;
      readonly dependencies: readonly string[];
      readonly readScopes: readonly string[];
      readonly writeScopes: readonly string[];
      readonly proofCount: number;
    }[];
    readonly risk?: { readonly score: number; readonly automaticEligible: boolean; readonly hardDenials: readonly string[] };
    readonly applicationFingerprint?: string;
    readonly applicationGate?: { readonly code: string; readonly message: string };
    readonly requiresHumanApproval: boolean;
    readonly discardedHunkCount: number;
  };
  readonly campaign?: {
    readonly id: string;
    readonly status: string;
    readonly revision: number;
    readonly workspaceMode: "isolated" | "direct";
    readonly completedMissions: number;
    readonly maximumMissions: number;
    readonly currentStepId: string;
    readonly decisionCount: number;
    readonly runtimeVersion?: string;
    readonly changedFiles?: {
      readonly total: number;
      readonly created: number;
      readonly modified: number;
      readonly deleted: number;
      readonly renamed: number;
      readonly files: readonly { readonly path: string; readonly previousPath?: string; readonly kind: "created" | "modified" | "deleted" | "renamed"; readonly risk: "low" | "medium" | "high"; readonly binary: boolean }[];
    };
    readonly actionRequired?: { readonly kind: string; readonly reason: string };
  };
}

export interface WebPreferences {
  readonly locale: "auto" | "en" | "fr";
  readonly resolvedLocale: "en" | "fr";
  readonly preferredSurface: "web" | "tui" | "cli";
  readonly humanProfile?: { readonly id: string; readonly name: string; readonly email?: string };
  readonly onboarding?: WebOnboardingState;
}

export interface SaveWebPreferencesInput {
  readonly locale?: "auto" | "en" | "fr";
  readonly name?: string;
  readonly email?: string;
  readonly preferredSurface?: "web" | "tui" | "cli";
  readonly onboarding?: WebOnboardingProgress;
}

export interface CreateGovernanceEventInput {
  readonly kind: GovernanceEventKind;
  readonly targets: readonly GovernanceTarget[];
  readonly reason: string;
  readonly resolvesEventId?: string;
  readonly supersedesEventId?: string;
}

export interface LiveInvalidation {
  readonly scope: CapabilityInvalidationScope;
  readonly projectId?: string;
  readonly featureId?: string;
  readonly executionId?: string;
  readonly revision: number;
  readonly occurredAt: string;
}

export interface NornBridge {
  getCapabilities(): Promise<CapabilityCatalog>;
  listProjects(): Promise<readonly ProjectListItem[]>;
  enterProjectFraming(input: { readonly root: string }): Promise<ProjectOverview>;
  getProject(projectId: string): Promise<ProjectOverview>;
  setProjectOrchestrationMode(projectId: string, input: { readonly mode: "manual" | "automatic"; readonly expectedUpdatedAt: string }): Promise<ProjectOverview>;
  getFeature(projectId: string, featureId: string): Promise<FeatureTrackingView>;
  listFramings(projectId: string): Promise<readonly FramingSummaryView[]>;
  getFraming(projectId: string, framingId: string): Promise<FramingDetailView>;
  startFraming(projectId: string, input: { readonly existingFeatureId?: string; readonly newFeatureTitle?: string }): Promise<FramingDetailView>;
  getFeatureContinuation(projectId: string, featureId: string): Promise<FeatureContinuationView>;
  prepareProductPrompt(projectId: string, featureId: string, input: { readonly target: ProductPromptTarget; readonly purpose: "next_step" | "resume" }): Promise<ProductPromptView>;
  getDocument(projectId: string, featureId: string, documentId: string): Promise<HumanDocumentView>;
  getGraph(projectId: string, featureId?: string): Promise<ProjectRelationshipGraph>;
  getGovernance(projectId: string): Promise<GovernanceView>;
  getAgents(projectId: string): Promise<AgentRegistryView>;
  registerAgent(projectId: string, input: AgentMutationInput): Promise<AgentRegistryView>;
  selectAgent(projectId: string, agentId: string, input: { readonly sessionId: string; readonly expectedRegistryRevision: number }): Promise<AgentRegistryView>;
  replaceAgent(projectId: string, agentId: string, input: AgentMutationInput): Promise<AgentRegistryView>;
  deactivateAgent(projectId: string, agentId: string, input: { readonly expectedRegistryRevision: number; readonly confirmation: string }): Promise<AgentRegistryView>;
  getAudits(projectId: string): Promise<readonly AuditTrackingView[]>;
  getAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  prepareAudit(projectId: string, input: PrepareAuditInput): Promise<AuditRunView>;
  startAudit(projectId: string, auditId: string, confirmation: string): Promise<AuditRunView>;
  finalizeAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  cancelAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  resumeAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  getOrchestrations(projectId: string): Promise<readonly OrchestrationTrackingView[]>;
  getPreferences(): Promise<WebPreferences>;
  savePreferences(input: SaveWebPreferencesInput): Promise<WebPreferences>;
  pickFolder(input: { readonly purpose: "project" | "feature"; readonly defaultPath?: string }): Promise<string | null>;
  createProject(input: { readonly id: string; readonly name: string; readonly root: string }): Promise<ProjectOverview>;
  createFeature(projectId: string, input: { readonly id: string; readonly name: string; readonly root: string; readonly pipelineId?: string }): Promise<FeatureTrackingView>;
  appendGovernance(projectId: string, input: CreateGovernanceEventInput): Promise<GovernanceView>;
  inspectDoctor(): Promise<DoctorInspectionReport>;
  previewDoctorRepairs(): Promise<DoctorRepairPlan>;
  applyDoctorRepairs(input: { readonly fingerprint: string; readonly confirmed: boolean }): Promise<DoctorRepairOutcome>;
  subscribe(listener: (event: LiveInvalidation) => void, signal?: AbortSignal): Promise<void>;
}
