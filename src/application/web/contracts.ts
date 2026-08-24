/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { GovernanceEventKind, GovernanceTarget } from "../../domain/governance/governance-event.js";

export type TrackingHealth = "healthy" | "attention" | "blocked" | "invalid";

export interface ProjectListItem {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly featureCount: number;
  readonly health: TrackingHealth;
  readonly updatedAt: string;
}

export interface ProjectOverview {
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly health: TrackingHealth;
  readonly orchestrationMode: "manual" | "automatic";
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
}

export interface FeatureSummary {
  readonly id: string;
  readonly name: string;
  readonly pipelineId: string;
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
  readonly proofReferences: readonly string[];
  readonly suspension?: { readonly code: string; readonly detail: string };
}

export interface WebPreferences {
  readonly locale: "auto" | "en" | "fr";
  readonly resolvedLocale: "en" | "fr";
  readonly humanProfile?: { readonly id: string; readonly name: string; readonly email?: string };
}

export interface CreateGovernanceEventInput {
  readonly kind: GovernanceEventKind;
  readonly targets: readonly GovernanceTarget[];
  readonly reason: string;
  readonly resolvesEventId?: string;
  readonly supersedesEventId?: string;
}

export interface LiveInvalidation {
  readonly scope: "projects" | "project" | "feature" | "documents" | "governance" | "audits" | "agents" | "orchestration";
  readonly projectId?: string;
  readonly featureId?: string;
  readonly executionId?: string;
  readonly revision: number;
  readonly occurredAt: string;
}

export interface NornBridge {
  listProjects(): Promise<readonly ProjectListItem[]>;
  getProject(projectId: string): Promise<ProjectOverview>;
  getFeature(projectId: string, featureId: string): Promise<FeatureTrackingView>;
  getDocument(projectId: string, featureId: string, documentId: string): Promise<HumanDocumentView>;
  getGraph(projectId: string, featureId?: string): Promise<ProjectRelationshipGraph>;
  getGovernance(projectId: string): Promise<GovernanceView>;
  getAgents(projectId: string): Promise<readonly AgentTrackingView[]>;
  getAudits(projectId: string): Promise<readonly AuditTrackingView[]>;
  getAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  prepareAudit(projectId: string, input: PrepareAuditInput): Promise<AuditRunView>;
  startAudit(projectId: string, auditId: string, confirmation: string): Promise<AuditRunView>;
  finalizeAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  cancelAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  resumeAudit(projectId: string, auditId: string): Promise<AuditRunView>;
  getOrchestrations(projectId: string): Promise<readonly OrchestrationTrackingView[]>;
  getPreferences(): Promise<WebPreferences>;
  savePreferences(input: { readonly locale?: "auto" | "en" | "fr"; readonly name?: string; readonly email?: string }): Promise<WebPreferences>;
  pickFolder(input: { readonly purpose: "project" | "feature"; readonly defaultPath?: string }): Promise<string | null>;
  createProject(input: { readonly id: string; readonly name: string; readonly root: string }): Promise<ProjectOverview>;
  createFeature(projectId: string, input: { readonly id: string; readonly name: string; readonly root: string; readonly pipelineId?: string }): Promise<FeatureTrackingView>;
  appendGovernance(projectId: string, input: CreateGovernanceEventInput): Promise<GovernanceView>;
  inspectDoctor(): Promise<unknown>;
  repairDoctor(input: { readonly apply: boolean; readonly confirmed: boolean }): Promise<unknown>;
  subscribe(listener: (event: LiveInvalidation) => void, signal?: AbortSignal): Promise<void>;
}
