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

import type { PipelineDefinition } from "./pipeline-definition.js";

export type PipelineGeneration = "2.3" | "legacy";
export type PipelineAvailability = "framing_calculated" | "existing_only" | "explicit_rework";

export interface PipelineCatalogEntry {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly name: string;
  readonly description: string;
  readonly definitionPath: string;
  readonly generation: PipelineGeneration;
  readonly availability: PipelineAvailability;
}

export interface PipelineCatalogV2 {
  readonly schemaVersion: 1 | 2;
  readonly defaultPipelineId: string;
  readonly pipelines: readonly PipelineCatalogEntry[];
}

export interface PipelineCatalogV3 {
  readonly schemaVersion: 3;
  readonly newFeatureEntry: "framing_required";
  readonly compatibilityFallbackPipelineId: string;
  readonly pipelines: readonly PipelineCatalogEntry[];
}

export type PipelineCatalog = PipelineCatalogV2 | PipelineCatalogV3;

export interface PipelineWorkflow extends PipelineCatalogEntry {
  readonly steps: readonly { readonly id: string; readonly required: boolean; readonly multiple: boolean }[];
}

const PIPELINE_ID = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const SAFE_DEFINITION = /^(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+\.json$/;

export function createPipelineCatalog(input: PipelineCatalog): PipelineCatalog {
  if (input.schemaVersion !== 1 && input.schemaVersion !== 2 && input.schemaVersion !== 3) {
    throw new Error("Unsupported pipeline catalog schemaVersion.");
  }
  if (input.pipelines.length === 0) throw new Error("Pipeline catalog must not be empty.");
  const tokens = new Set<string>();
  for (const entry of input.pipelines) {
    if (!PIPELINE_ID.test(entry.id)) throw new Error(`Invalid catalog pipeline id: ${entry.id}.`);
    if (entry.name.trim().length === 0 || entry.description.trim().length === 0) throw new Error(`Pipeline ${entry.id} needs a name and description.`);
    if (!SAFE_DEFINITION.test(entry.definitionPath) || entry.definitionPath.split("/").includes("..")) {
      throw new Error(`Unsafe pipeline definition path for ${entry.id}: ${entry.definitionPath}.`);
    }
    for (const token of [entry.id, ...entry.aliases]) {
      if (!PIPELINE_ID.test(token) || tokens.has(token)) throw new Error(`Duplicate or invalid pipeline catalog token: ${token}.`);
      tokens.add(token);
    }
  }
  if (input.schemaVersion === 3) {
    if (input.newFeatureEntry !== "framing_required") throw new Error("catalog.newFeatureEntry must be 'framing_required'.");
    if (!input.pipelines.some((entry) => entry.id === input.compatibilityFallbackPipelineId)) {
      throw new Error(`Unknown compatibility fallback pipeline id: ${input.compatibilityFallbackPipelineId}.`);
    }
  } else if (!input.pipelines.some((entry) => entry.id === input.defaultPipelineId)) {
    throw new Error(`Unknown default pipeline id: ${input.defaultPipelineId}.`);
  }
  return { ...input, pipelines: input.pipelines.map((entry) => ({ ...entry, aliases: [...entry.aliases] })) };
}

export function isPipelineCatalogV3(catalog: PipelineCatalog): catalog is PipelineCatalogV3 {
  return catalog.schemaVersion === 3;
}

export function resolvePipelineEntry(catalog: PipelineCatalog, requestedId?: string): PipelineCatalogEntry {
  const token = requestedId ?? (isPipelineCatalogV3(catalog) ? catalog.compatibilityFallbackPipelineId : catalog.defaultPipelineId);
  const entry = catalog.pipelines.find((candidate) => candidate.id === token || candidate.aliases.includes(token));
  if (entry === undefined) throw new Error(`Unknown pipeline id: ${token}. Use "arka-norn workflow list".`);
  return entry;
}

export function workflowFrom(entry: PipelineCatalogEntry, definition: PipelineDefinition): PipelineWorkflow {
  if (definition.pipelineId !== entry.id) {
    throw new Error(`Pipeline catalog mismatch: ${entry.id} resolves to ${definition.pipelineId}.`);
  }
  return {
    ...entry,
    steps: definition.steps.map((step) => ({ id: step.id, required: step.required, multiple: step.multiple })),
  };
}
