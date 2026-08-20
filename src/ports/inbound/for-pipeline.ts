import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";
import type { PipelineWorkflow } from "../../domain/pipeline/pipeline-catalog.js";

export interface InspectPipelineInput {
  readonly featureRoot: string;
  /**
   * A defined feature id denotes a managed Feature. Its inspection must also
   * provide the Project registry; otherwise the resulting report is invalid.
   */
  readonly featureId?: string;
  readonly pipelineId?: string;
  readonly authorRegistry?: readonly PipelineAuthorAuthorization[];
}

export interface PipelineAuthorAuthorization {
  readonly id: string;
  readonly active: boolean;
  readonly authorized: boolean;
}

export interface ForPipeline {
  inspect(input: InspectPipelineInput): Promise<PipelineReport>;
  validate(input: { readonly filePath: string; readonly pipelineId?: string }): Promise<PipelineDocumentValidation>;
  scaffold(input: { readonly stepId: string; readonly outputPath: string; readonly authorAgentId: string; readonly featureId?: string; readonly projectId?: string; readonly pipelineId?: string; readonly force?: boolean; readonly allowedRoot?: string }): Promise<PipelineScaffoldResult>;
  listSteps(pipelineId?: string): Promise<readonly PipelineStepOption[]>;
  listWorkflows(): Promise<readonly PipelineWorkflow[]>;
  showWorkflow(pipelineId: string): Promise<PipelineWorkflow>;
}

export interface PipelineStepOption {
  readonly id: string;
  readonly required: boolean;
  readonly transversal: boolean;
}

export interface PipelineDocumentValidation {
  readonly valid: boolean;
  readonly type?: string;
  readonly schemaPath?: string;
  readonly errors: readonly string[];
}

export interface PipelineScaffoldResult {
  readonly stepId: string;
  readonly outputPath: string;
  readonly sentinelPaths: readonly string[];
}
