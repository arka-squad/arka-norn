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

export type PresenceStatus = "absent" | "present";
export type SchemaStatus = "valid" | "invalid";
export type BusinessStatus = "not_started" | "in_progress" | "passed" | "failed" | "blocked";
export type DependencyStatus = "satisfied" | "unsatisfied";
export type CompletionStatus = "not_started" | "in_progress" | "completed" | "failed" | "blocked";
export type PipelineOverallStatus = "incomplete" | "completed" | "failed" | "invalid";

export type NextActionKind =
  | "create_document"
  | "fix_document"
  | "continue_development"
  | "run_qa"
  | "return_to_development"
  | "resolve_qa"
  | "run_audit"
  | "run_validation";

export interface NextAction {
  readonly kind: NextActionKind;
  readonly stepId: string;
  readonly reason: string;
  readonly relatedDocumentId?: string;
  readonly phase?: string;
  readonly instructions?: readonly string[];
  readonly suggestedCommand?: string;
}

export interface DocumentSummary {
  readonly id?: string;
  readonly type?: string;
  readonly filePath: string;
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly sequence?: number;
  readonly createdAt?: string;
  readonly featureId?: string;
  readonly crDevId?: string;
  readonly businessVerdict?: string;
  readonly authorAgentId?: string;
  readonly exactCommit?: string;
  readonly findingCount?: number;
  readonly openFindingCount?: number;
  readonly correctionCount?: number;
  readonly dependencyDocumentIds: readonly string[];
}

export interface StepState {
  readonly id: string;
  readonly order: number;
  readonly required: boolean;
  readonly multiple: boolean;
  readonly presenceStatus: PresenceStatus;
  readonly schemaStatus: SchemaStatus;
  readonly businessStatus: BusinessStatus;
  readonly dependencyStatus: DependencyStatus;
  readonly completionStatus: CompletionStatus;
  readonly documents: readonly DocumentSummary[];
  readonly selectedDocumentId?: string;
  readonly nextActions: readonly NextAction[];
}

export interface TransversalDocumentState {
  readonly type: string;
  readonly documents: readonly DocumentSummary[];
}

export interface PipelineReport {
  readonly schemaVersion: 1;
  readonly pipelineId: string;
  readonly featureRoot: string;
  readonly featureId?: string;
  readonly selectedDocuments: Readonly<Record<string, string>>;
  readonly overallStatus: PipelineOverallStatus;
  readonly latestCrDevId?: string;
  readonly selectedQaId?: string;
  readonly selectedAuditId?: string;
  readonly selectedValidationId?: string;
  readonly steps: readonly StepState[];
  readonly transversalDocuments: readonly TransversalDocumentState[];
  readonly nextActions: readonly NextAction[];
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
  readonly unknownFiles: readonly string[];
}

export interface EvaluatedDocument extends DocumentSummary {
  readonly content: Readonly<Record<string, unknown>>;
}

export interface PipelineEvaluationInput {
  readonly pipelineId: string;
  readonly featureRoot: string;
  readonly featureId?: string;
  readonly steps: readonly {
    readonly id: string;
    readonly order: number;
    readonly required: boolean;
    readonly multiple: boolean;
    readonly dependsOn: readonly string[];
    readonly businessPolicy?: PipelineBusinessPolicy;
  }[];
  readonly documents: readonly EvaluatedDocument[];
  readonly unknownFiles?: readonly string[];
  readonly sourceErrors?: readonly string[];
  readonly transversalDocumentTypes?: readonly string[];
  readonly authorRegistry?: readonly {
    readonly id: string;
    readonly active: boolean;
    readonly authorized: boolean;
  }[];
}
import type { PipelineBusinessPolicy } from "./pipeline-definition.js";
