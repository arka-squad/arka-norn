import type { ExecutionPolicy } from "../../domain/orchestration/execution-policy.js";
import type { ExecutionRecord } from "../../domain/orchestration/execution-record.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { ProjectOrchestrationMode } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface OrchestrationStartInput {
  readonly projectId: ProjectId;
  readonly featureId?: FeatureId;
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
  readonly activeExecution: ExecutionRecord | undefined;
  readonly actionRequired: OrchestrationActionRequired | undefined;
}

export interface OrchestrationActionRequired {
  readonly kind: "approve" | "retry" | "inspect";
  readonly executionId: string;
  readonly reason: string;
}

/** Public control-plane API. It never exposes worker process state or secrets. */
export interface ForOrchestration {
  start(input: OrchestrationStartInput): Promise<ExecutionRecord>;
  status(input: { readonly projectId: ProjectId }): Promise<OrchestrationStatus>;
  cancel(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
  approve(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
  retry(input: OrchestrationExecutionInput): Promise<ExecutionRecord>;
}
