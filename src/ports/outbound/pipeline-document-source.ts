import type { PipelineDefinition } from "../../domain/pipeline/pipeline-definition.js";

export interface PipelineDocumentCandidate {
  readonly filePath: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly readErrors: readonly string[];
}

export interface PipelineDocumentSource {
  loadDefinition(): Promise<PipelineDefinition>;
  list(featureRoot: string): Promise<readonly PipelineDocumentCandidate[]>;
  read(filePath: string): Promise<PipelineDocumentCandidate>;
  loadSchema(schemaPath: string): Promise<Readonly<Record<string, unknown>>>;
  write(filePath: string, content: Readonly<Record<string, unknown>>, options?: { readonly force?: boolean; readonly allowedRoot?: string }): Promise<void>;
}
