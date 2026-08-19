import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("un JSON supérieur à 2 Mio est rejeté sans chargement métier", async (context) => {
  const featureRoot = mkdtempSync(join(tmpdir(), "arka-norn-large-json-"));
  context.after(() => rmSync(featureRoot, { recursive: true, force: true }));
  writeFileSync(resolve(featureRoot, "oversized.json"), `{"payload":"${"x".repeat(2 * 1024 * 1024)}"}`);
  const report = await createPipelineRuntime(ROOT).inspect({ featureRoot });
  assert.equal(report.overallStatus, "invalid");
  assert.match(report.errors[0] ?? "", /exceeds the 2097152 byte limit/);
});

test("le scaffold Feature ne peut pas sortir de sa racine autorisée", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-scaffold-confined-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const featureRoot = resolve(sandbox, "feature");
  const outside = resolve(sandbox, "outside");
  mkdirSync(featureRoot);
  mkdirSync(outside);

  await assert.rejects(
    createPipelineRuntime(ROOT).scaffold({ stepId: "concept", outputPath: resolve(outside, "concept.json"), allowedRoot: featureRoot }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PATH_SECURITY",
  );
});
