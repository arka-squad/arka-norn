import assert from "node:assert/strict";
import { test } from "node:test";
import { resolve } from "node:path";

import { FsPipelineDocumentSource } from "../../src/adapters/outbound/pipeline/fs-pipeline-document-source.ts";
import { createPipelineCatalog, resolvePipelineEntry } from "../../src/domain/pipeline/pipeline-catalog.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("le catalogue résout uniquement standard et fastdev vers leurs définitions", async () => {
  const source = new FsPipelineDocumentSource(ROOT);
  const catalog = await source.loadCatalog();
  assert.equal(catalog.pipelines.length, 2);
  assert.equal((await source.loadDefinition("standard")).pipelineId, "arka-norn-default");
  assert.equal((await source.loadDefinition("fastdev")).pipelineId, "arka-norn-fastdev");
  await assert.rejects(source.loadDefinition("../../tmp/evil"), /Unknown pipeline id/);
});

test("un chemin de définition arbitraire ou un alias dupliqué est refusé", () => {
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
