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

import type { PipelineCatalog } from "../../domain/pipeline/pipeline-catalog.js";
import type { PipelineDefinition } from "../../domain/pipeline/pipeline-definition.js";

export interface PipelineDocumentCandidate {
  readonly filePath: string;
  readonly content?: Readonly<Record<string, unknown>>;
  readonly readErrors: readonly string[];
}

export interface PipelineDocumentSource {
  loadCatalog(): Promise<PipelineCatalog>;
  loadDefinition(pipelineId?: string): Promise<PipelineDefinition>;
  list(featureRoot: string): Promise<readonly PipelineDocumentCandidate[]>;
  read(filePath: string): Promise<PipelineDocumentCandidate>;
  loadSchema(schemaPath: string): Promise<Readonly<Record<string, unknown>>>;
  write(filePath: string, content: Readonly<Record<string, unknown>>, options?: { readonly force?: boolean; readonly allowedRoot?: string }): Promise<void>;
}
