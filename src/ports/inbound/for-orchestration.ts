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

import type {
  ExecutionPolicy,
  TargetIneligibility,
} from "../../domain/orchestration/execution-policy.js";
import type { ExecutionRecord } from "../../domain/orchestration/execution-record.js";
import type { OrchestrationCampaign } from "../../domain/orchestration/orchestration-campaign.js";
import type { OrchestrationProjection } from "../../domain/orchestration/orchestration-projection.js";
import type { OrchestrationWorkspaceMode } from "../../domain/orchestration/execution-policy.js";
import type { WorkspaceChanges } from "../outbound/orchestration-workspace.js";
import type {
  ExecutionCapability,
  ExecutionPermission,
  ExecutionProvider,
  ExecutionTarget,
} from "../../domain/orchestration/types.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { ProjectOrchestrationMode } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface OrchestrationStartInput {
  readonly projectId: ProjectId;
  readonly featureId: FeatureId;
  /** User-confirmed target. Arka recreates its adapter and source fields. */
  readonly selection: OrchestrationTargetSelection;
  /** Opaque snapshot of the exact non-mutating preview that was confirmed. */
  readonly previewFingerprint: string;
}

export interface OrchestrationTargetSelection {
  readonly provider: ExecutionProvider;
  readonly model: string;
}

export interface OrchestrationConfigureInput {
  readonly projectId: ProjectId;
  /** Adds or enables this explicit Project-owned model choice, never a credential. */
  readonly selection: OrchestrationTargetSelection;
  readonly workspaceMode?: Exclude<OrchestrationWorkspaceMode, "unconfigured">;
}

export interface OrchestrationPreviewInput {
  readonly projectId: ProjectId;
  readonly featureId: FeatureId;
}

/** Human-facing, read-only statement of the next bounded mission. */
export interface OrchestrationPreview {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly featureId: string;
  readonly featureName: string;
  readonly stepId: string;
  readonly role: string;
  readonly summary: string;
  readonly logicalRoot?: string;
  readonly workspaceMode?: OrchestrationWorkspaceMode;
  readonly maximumMissions?: number;
  readonly scopePaths: readonly string[];
  readonly requiredCapabilities: readonly ExecutionCapability[];
  readonly requiredPermissions: readonly ExecutionPermission[];
  readonly candidates: readonly OrchestrationPreviewCandidate[];
  /** Rechecked by start; it includes no secret or worker-process state. */
  readonly fingerprint: string;
}

export interface OrchestrationPreviewCandidate {
  readonly target: ExecutionTarget;
  readonly eligible: boolean;
  readonly reasons: readonly TargetIneligibility[];
  readonly recommended: boolean;
  readonly runtimeVersion?: string;
  readonly runtimeFingerprint?: string;
}

export interface OrchestrationExecutionInput {
  readonly projectId: ProjectId;
  readonly executionId: string;
}

export interface OrchestrationStatus {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly orchestrationMode: ProjectOrchestrationMode;
  readonly policy: ExecutionPolicy | undefined;
  readonly executions: readonly ExecutionRecord[];
  /** An actually live mission only; terminal history never masquerades as active. */
  readonly activeExecution: ExecutionRecord | undefined;
  readonly latestExecution: ExecutionRecord | undefined;
  readonly activeCampaign?: OrchestrationCampaign;
  readonly latestCampaign?: OrchestrationCampaign;
  readonly projection?: OrchestrationProjection;
  readonly actionRequired: OrchestrationActionRequired | undefined;
}

export interface OrchestrationActionRequired {
  readonly kind: "approve" | "business_decision" | "scope_expansion" | "capability_expansion" | "apply_changes" | "retry" | "inspect";
  readonly executionId: string;
  readonly reason: string;
}

export interface OrchestrationCampaignInput {
  readonly projectId: ProjectId;
  readonly campaignId: string;
  readonly expectedRevision: number;
}

export interface OrchestrationApplyInput extends OrchestrationCampaignInput { readonly fingerprint: string }
export interface OrchestrationCampaignRetryInput extends OrchestrationCampaignInput { readonly fingerprint: string }
export interface OrchestrationDecisionInput extends OrchestrationCampaignInput {
  readonly fingerprint: string;
  readonly actor: string;
  readonly choice: string;
  readonly reason?: string;
}

/** Public control-plane API. It never exposes worker process state or secrets. */
export interface ForOrchestration {
  configure(input: OrchestrationConfigureInput): Promise<ExecutionPolicy>;
  preview(input: OrchestrationPreviewInput): Promise<OrchestrationPreview>;
  start(input: OrchestrationStartInput): Promise<ExecutionRecord>;
  status(input: { readonly projectId: ProjectId }): Promise<OrchestrationStatus>;
  pause?(input: OrchestrationCampaignInput): Promise<OrchestrationCampaign>;
  resume?(input: OrchestrationCampaignInput): Promise<OrchestrationCampaign>;
  decide?(input: OrchestrationDecisionInput): Promise<OrchestrationCampaign>;
  changes?(input: { readonly projectId: ProjectId; readonly campaignId: string }): Promise<WorkspaceChanges>;
  apply?(input: OrchestrationApplyInput): Promise<OrchestrationCampaign>;
  retryCampaign?(input: OrchestrationCampaignRetryInput): Promise<OrchestrationCampaign>;
  abandon?(input: OrchestrationCampaignInput): Promise<OrchestrationCampaign>;
  cancelCampaign?(input: OrchestrationCampaignInput): Promise<OrchestrationCampaign>;
  cancel(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
  approve(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
  retry(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
}
