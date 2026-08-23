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

import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";

import { FsPipelineDocumentSource } from "../../src/adapters/outbound/pipeline/fs-pipeline-document-source.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { createPipelineCatalog, resolvePipelineEntry } from "../../src/domain/pipeline/pipeline-catalog.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("the catalog resolves canonical and deprecated pipeline aliases", async () => {
  const source = new FsPipelineDocumentSource(ROOT);
  const catalog = await source.loadCatalog();
  assert.equal(catalog.pipelines.length, 3);
  assert.equal(catalog.defaultPipelineId, "arka-norn-essential");
  assert.equal((await source.loadDefinition("complete")).pipelineId, "arka-norn-complete");
  assert.equal((await source.loadDefinition("standard")).pipelineId, "arka-norn-complete");
  assert.equal((await source.loadDefinition("essential")).pipelineId, "arka-norn-essential");
  assert.equal((await source.loadDefinition("essentiel")).pipelineId, "arka-norn-essential");
  assert.equal((await source.loadDefinition("fastdev")).pipelineId, "arka-norn-fastdev");
  assert.equal((await createPipelineRuntime(ROOT).showWorkflow()).id, "arka-norn-essential");
  await assert.rejects(source.loadDefinition("../../tmp/evil"), /Unknown pipeline id/);
});

test("unsafe definition paths and unknown aliases are rejected", () => {
  assert.throws(() => createPipelineCatalog({
    schemaVersion: 1,
    defaultPipelineId: "safe",
    pipelines: [{ id: "safe", aliases: ["standard"], name: "Safe", description: "Safe pipeline", definitionPath: "../evil.json" }],
  }), /Unsafe pipeline definition path/);
  const catalog = createPipelineCatalog({
    schemaVersion: 1,
    defaultPipelineId: "safe",
    pipelines: [{ id: "safe", aliases: ["standard"], name: "Safe", description: "Safe pipeline", definitionPath: "pipeline.json" }],
  });
  assert.equal(resolvePipelineEntry(catalog, "standard").id, "safe");
  assert.throws(() => resolvePipelineEntry(catalog, "unknown"), /Unknown pipeline id/);
});
