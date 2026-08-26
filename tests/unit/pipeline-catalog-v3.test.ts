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
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsPipelineDocumentSource } from "../../src/adapters/outbound/pipeline/fs-pipeline-document-source.ts";
import { createPipelineCatalog } from "../../src/domain/pipeline/pipeline-catalog.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

const V2_CATALOG = JSON.stringify({
  schemaVersion: 2,
  defaultPipelineId: "arka-norn-essential",
  pipelines: [
    { id: "arka-norn-essential", aliases: ["essential"], name: "Essential", description: "Legacy essential", definition: "pipelines/arka-norn-essential.json" },
    { id: "arka-norn-fastdev", aliases: ["fastdev"], name: "FastDev", description: "Legacy fastdev", definition: "pipelines/arka-norn-fastdev.json" },
  ],
});

const V3_CATALOG = JSON.stringify({
  schemaVersion: 3,
  newFeatureEntry: "framing_required",
  compatibilityFallbackPipelineId: "arka-norn-essential",
  pipelines: [
    { id: "arka-norn-essential-2.3", generation: "2.3", availability: "framing_calculated", aliases: ["essential-2.3"], name: "Essential 2.3", description: "2.3 essential", definition: "pipelines/arka-norn-essential-2.3.json" },
    { id: "arka-norn-essential", generation: "legacy", availability: "existing_only", aliases: ["essential"], name: "Essential", description: "Legacy essential", definition: "pipelines/arka-norn-essential.json" },
    { id: "arka-norn-fastdev", generation: "legacy", availability: "explicit_rework", aliases: ["fastdev"], name: "FastDev", description: "Legacy fastdev", definition: "pipelines/arka-norn-fastdev.json" },
  ],
});

test("v3 catalog requires newFeatureEntry, compatibilityFallbackPipelineId and qualified pipelines", async () => {
  const dir = mkdtempSync(join(tmpdir(), "norn-catalog-"));
  const pipelinesDir = join(dir, "pipelines");
  mkdirSync(pipelinesDir);
  writeFileSync(join(pipelinesDir, "catalog.json"), V3_CATALOG);
  const source = new FsPipelineDocumentSource(dir);
  const catalog = await source.loadCatalog();
  assert.equal(catalog.schemaVersion, 3);
  assert.equal(catalog.newFeatureEntry, "framing_required");
  assert.equal(catalog.compatibilityFallbackPipelineId, "arka-norn-essential");
  const essential23 = catalog.pipelines.find((p) => p.id === "arka-norn-essential-2.3");
  assert.ok(essential23);
  assert.equal(essential23.generation, "2.3");
  assert.equal(essential23.availability, "framing_calculated");
  const legacy = catalog.pipelines.find((p) => p.id === "arka-norn-essential");
  assert.ok(legacy);
  assert.equal(legacy.generation, "legacy");
  assert.equal(legacy.availability, "existing_only");
});

test("v2 catalog is projected with legacy generation and availability", async () => {
  const dir = mkdtempSync(join(tmpdir(), "norn-catalog-"));
  const pipelinesDir = join(dir, "pipelines");
  mkdirSync(pipelinesDir);
  writeFileSync(join(pipelinesDir, "catalog.json"), V2_CATALOG);
  const source = new FsPipelineDocumentSource(dir);
  const catalog = await source.loadCatalog();
  assert.equal(catalog.schemaVersion, 2);
  assert.equal(catalog.defaultPipelineId, "arka-norn-essential");
  for (const pipeline of catalog.pipelines) {
    assert.equal(pipeline.generation, "legacy");
  }
  assert.equal(catalog.pipelines.find((p) => p.id === "arka-norn-fastdev")?.availability, "explicit_rework");
  assert.equal(catalog.pipelines.find((p) => p.id === "arka-norn-essential")?.availability, "existing_only");
});

test("v3 catalog rejects missing generation or availability", () => {
  assert.throws(() => createPipelineCatalog({
    schemaVersion: 3,
    newFeatureEntry: "framing_required",
    compatibilityFallbackPipelineId: "arka-norn-essential",
    pipelines: [{ id: "arka-norn-essential-2.3", aliases: [], name: "Essential 2.3", description: "x", definitionPath: "p.json", generation: "2.3", availability: "framing_calculated" }],
  }));
  assert.throws(() => createPipelineCatalog({
    schemaVersion: 3,
    newFeatureEntry: "framing_required",
    compatibilityFallbackPipelineId: "missing",
    pipelines: [{ id: "arka-norn-essential-2.3", aliases: [], name: "Essential 2.3", description: "x", definitionPath: "p.json", generation: "2.3", availability: "framing_calculated" }],
  }), /Unknown compatibility fallback/);
});

test("shipped catalog is v3 and qualifies every pipeline", async () => {
  const source = new FsPipelineDocumentSource(ROOT);
  const catalog = await source.loadCatalog();
  assert.equal(catalog.schemaVersion, 3);
  for (const pipeline of catalog.pipelines) {
    assert.ok(["2.3", "legacy"].includes(pipeline.generation), `${pipeline.id} generation`);
    assert.ok(["framing_calculated", "existing_only", "explicit_rework"].includes(pipeline.availability), `${pipeline.id} availability`);
  }
  const framingCalculated = catalog.pipelines.filter((p) => p.availability === "framing_calculated");
  assert.ok(framingCalculated.every((p) => p.generation === "2.3"));
});
