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

export const AUDIT_MODES = ["discovery", "audit", "mixed"] as const;
export type AuditMode = typeof AUDIT_MODES[number];

export const AUDIT_DEPTHS = ["inventory", "static", "connected", "dynamic"] as const;
export type AuditDepth = typeof AUDIT_DEPTHS[number];

export const AUDIT_MODULE_IDS = ["M00", "M01", "M02", "M03", "M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11"] as const;
export type AuditModuleId = typeof AUDIT_MODULE_IDS[number];

export const AUDIT_RUN_STATUSES = ["planned", "collecting", "analyzing", "completed", "partial", "blocked", "failed", "cancelled", "interrupted"] as const;
export type AuditRunStatus = typeof AUDIT_RUN_STATUSES[number];

export const MODULE_EXECUTION_STATUSES = ["complete", "partial", "blocked", "error", "skipped"] as const;
export type ModuleExecutionStatus = typeof MODULE_EXECUTION_STATUSES[number];

export const ASSESSMENT_STATUSES = ["pass", "warn", "fail", "unknown", "not_applicable"] as const;
export type AssessmentStatus = typeof ASSESSMENT_STATUSES[number];

export const FINDING_SEVERITIES = ["critical", "high", "medium", "low", "info"] as const;
export type FindingSeverity = typeof FINDING_SEVERITIES[number];

export const CONFIDENCE_LEVELS = ["high", "medium", "low"] as const;
export type ConfidenceLevel = typeof CONFIDENCE_LEVELS[number];

export const FINDING_ORIGINS = ["observed", "inferred"] as const;
export type FindingOrigin = typeof FINDING_ORIGINS[number];

export const KB_RECORD_TYPES = ["fact", "metric", "evidence", "finding", "risk", "decision", "artifact"] as const;
export type KbRecordType = typeof KB_RECORD_TYPES[number];

export interface AuditModuleSelection {
  readonly moduleId: AuditModuleId;
  readonly intent: "discover" | "audit";
  readonly depth: AuditDepth;
  readonly criteria: readonly string[];
}

export interface AuditRequest {
  readonly objective: string;
  readonly mode: AuditMode;
  readonly paths: readonly string[];
  readonly modules: readonly AuditModuleSelection[];
  readonly sources: {
    readonly paths: readonly string[];
    readonly urls: readonly string[];
  };
  readonly capabilities: {
    readonly allowImagePulls: boolean;
    readonly allowedHosts: readonly string[];
    readonly credentialRefs: readonly string[];
    readonly dynamicTargets: readonly string[];
  };
}

export interface AuditSignal {
  readonly id: string;
  readonly detected: boolean;
  readonly evidence: readonly string[];
}

export interface AuditModuleRecommendation {
  readonly moduleId: AuditModuleId;
  readonly state: "recommended" | "available" | "limited" | "probably_not_applicable";
  readonly reason: string;
  readonly suggestedDepth: AuditDepth;
}

export interface AuditInspection {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly featureId: string | null;
  readonly scopePaths: readonly string[];
  readonly commitExact: string | null;
  readonly workspaceClean: boolean | null;
  readonly workspaceFingerprint: string;
  readonly sandbox: { readonly runtime: "docker" | "podman" | null; readonly available: boolean };
  readonly signals: readonly AuditSignal[];
  readonly recommendations: readonly AuditModuleRecommendation[];
}

export interface AuditEvidence {
  readonly id: string;
  readonly kind: "command" | "file" | "metric" | "external";
  readonly summary: string;
  readonly source: string;
  readonly location: string | null;
  readonly observedAt: string;
  readonly producer: string;
  readonly toolVersion: string | null;
  readonly dataVersion: string | null;
  readonly contentHash: string;
  readonly classification: "public" | "internal" | "sensitive";
  readonly redacted: boolean;
}

export interface AuditFinding {
  readonly id: string;
  readonly ruleId: string;
  readonly title: string;
  readonly description: string;
  readonly severity: FindingSeverity;
  readonly confidence: ConfidenceLevel;
  readonly origin: FindingOrigin;
  readonly status: "open" | "accepted" | "resolved";
  readonly evidenceIds: readonly string[];
  readonly scope: string;
  readonly location: string | null;
  readonly recommendation: string | null;
  readonly fingerprint: string;
}

export interface AuditModuleResult {
  readonly schemaVersion: 1;
  readonly auditId: string;
  readonly moduleId: AuditModuleId;
  readonly intent: "discover" | "audit";
  readonly depth: AuditDepth;
  readonly execution: {
    readonly status: ModuleExecutionStatus;
    readonly startedAt: string;
    readonly endedAt: string;
    readonly tools: readonly { readonly name: string; readonly version: string | null; readonly dataVersion: string | null }[];
  };
  readonly assessment: { readonly status: AssessmentStatus; readonly confidence: ConfidenceLevel } | null;
  readonly coverage: {
    readonly requested: readonly string[];
    readonly completed: readonly string[];
    readonly missing: readonly string[];
  };
  readonly summary: string;
  readonly strengths: readonly string[];
  readonly findings: readonly AuditFinding[];
  readonly evidence: readonly AuditEvidence[];
  readonly limitations: readonly string[];
  readonly recommendations: readonly string[];
  readonly decisionsRequired: readonly string[];
}

export interface AuditAttempt {
  readonly number: number;
  readonly status: "running" | "completed" | "failed" | "cancelled" | "interrupted";
  readonly startedAt: string;
  readonly endedAt: string | null;
}

export interface AuditRun {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly featureId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: AuditRunStatus;
  readonly fingerprint: string;
  readonly inspection: AuditInspection;
  readonly request: AuditRequest;
  readonly plan: {
    readonly scopePaths: readonly string[];
    readonly commitExact: string | null;
    readonly images: readonly { readonly reference: string; readonly installed: boolean | null; readonly sizeBytes: number | null }[];
    readonly hosts: readonly string[];
    readonly credentialRefs: readonly string[];
    readonly dynamicTargets: readonly string[];
    readonly logicalCommands: readonly string[];
    readonly timeoutMs: number;
    readonly estimatedDuration: string;
    readonly requiresAdditionalConfirmation: boolean;
  };
  readonly selectedModules: readonly AuditModuleId[];
  readonly moduleStatuses: Readonly<Record<string, ModuleExecutionStatus | "pending">>;
  readonly attempts: readonly AuditAttempt[];
  readonly warnings: readonly string[];
}

export interface AuditCanonical {
  readonly schemaVersion: 1;
  readonly auditId: string;
  readonly projectId: string;
  readonly commitExact: string | null;
  readonly mode: AuditMode;
  readonly status: "completed" | "partial";
  readonly generatedAt: string;
  readonly coverage: { readonly complete: number; readonly partial: number; readonly skipped: number; readonly total: number };
  readonly moduleResults: readonly AuditModuleResult[];
  readonly findings: readonly AuditFinding[];
  readonly strengths: readonly string[];
  readonly limitations: readonly string[];
  readonly recommendations: readonly string[];
  readonly decisionsRequired: readonly string[];
}

export interface AuditKbRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly auditId: string;
  readonly projectId: string;
  readonly commitExact: string | null;
  readonly moduleId: AuditModuleId;
  readonly type: KbRecordType;
  readonly title: string;
  readonly statement: string;
  readonly status: string;
  readonly scope: string;
  readonly priority: FindingSeverity | "none";
  readonly severity: FindingSeverity | null;
  readonly confidence: ConfidenceLevel;
  readonly origin: FindingOrigin;
  readonly evidenceIds: readonly string[];
  readonly fingerprint: string;
  readonly observedAt: string;
}

export function isAuditModuleId(value: unknown): value is AuditModuleId {
  return typeof value === "string" && (AUDIT_MODULE_IDS as readonly string[]).includes(value);
}

export function isAuditDepth(value: unknown): value is AuditDepth {
  return typeof value === "string" && (AUDIT_DEPTHS as readonly string[]).includes(value);
}

export function isAuditMode(value: unknown): value is AuditMode {
  return typeof value === "string" && (AUDIT_MODES as readonly string[]).includes(value);
}

export function isModuleExecutionStatus(value: unknown): value is ModuleExecutionStatus {
  return typeof value === "string" && (MODULE_EXECUTION_STATUSES as readonly string[]).includes(value);
}

export function isAssessmentStatus(value: unknown): value is AssessmentStatus {
  return typeof value === "string" && (ASSESSMENT_STATUSES as readonly string[]).includes(value);
}

export function isFindingSeverity(value: unknown): value is FindingSeverity {
  return typeof value === "string" && (FINDING_SEVERITIES as readonly string[]).includes(value);
}

export function isConfidenceLevel(value: unknown): value is ConfidenceLevel {
  return typeof value === "string" && (CONFIDENCE_LEVELS as readonly string[]).includes(value);
}

export function isFindingOrigin(value: unknown): value is FindingOrigin {
  return typeof value === "string" && (FINDING_ORIGINS as readonly string[]).includes(value);
}
