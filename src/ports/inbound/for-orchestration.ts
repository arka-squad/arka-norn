import type {
  ExecutionPolicy,
  TargetIneligibility,
} from "../../domain/orchestration/execution-policy.js";
import type { ExecutionRecord } from "../../domain/orchestration/execution-record.js";
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
  readonly actionRequired: OrchestrationActionRequired | undefined;
}

export interface OrchestrationActionRequired {
  readonly kind: "approve" | "retry" | "inspect";
  readonly executionId: string;
  readonly reason: string;
}

/** Public control-plane API. It never exposes worker process state or secrets. */
export interface ForOrchestration {
  configure(input: OrchestrationConfigureInput): Promise<ExecutionPolicy>;
  preview(input: OrchestrationPreviewInput): Promise<OrchestrationPreview>;
  start(input: OrchestrationStartInput): Promise<ExecutionRecord>;
  status(input: { readonly projectId: ProjectId }): Promise<OrchestrationStatus>;
  cancel(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
  approve(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
  retry(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
}
