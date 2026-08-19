import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";

export interface InspectPipelineInput {
  readonly featureRoot: string;
  readonly featureId?: string;
}

export interface ForPipeline {
  inspect(input: InspectPipelineInput): Promise<PipelineReport>;
  validate(input: { readonly filePath: string }): Promise<PipelineDocumentValidation>;
  scaffold(input: { readonly stepId: string; readonly outputPath: string; readonly authorAgentId: string; readonly featureId?: string; readonly force?: boolean; readonly allowedRoot?: string }): Promise<PipelineScaffoldResult>;
  listSteps(): Promise<readonly PipelineStepOption[]>;
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
