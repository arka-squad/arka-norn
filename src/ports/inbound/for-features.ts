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

import type { Feature } from "../../domain/feature/feature.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface CreateFeatureInput {
  readonly id: FeatureId;
  readonly projectId: ProjectId;
  readonly name: string;
  readonly root: string;
  readonly pipelineId?: string;
}

export interface ImportFeatureInput {
  readonly root: string;
  readonly projectId: ProjectId;
}

export interface SetFeatureWorkflowInput {
  readonly id: FeatureId;
  readonly pipelineId: string;
  readonly recognizedDocumentTypes: readonly string[];
}

export interface ForgetFeatureOptions {
  /** Recovery path for an indexed Feature whose local marker has disappeared. */
  readonly indexOnly?: boolean;
}

export interface ForFeatures {
  list(projectId?: ProjectId): Promise<readonly Feature[]>;
  create(input: CreateFeatureInput): Promise<Feature>;
  importFrom(input: ImportFeatureInput): Promise<Feature>;
  show(id: FeatureId): Promise<Feature>;
  forget(id: FeatureId, options?: ForgetFeatureOptions): Promise<void>;
  switchTo(id: FeatureId): Promise<Feature>;
  setWorkflow(input: SetFeatureWorkflowInput): Promise<Feature>;
}
