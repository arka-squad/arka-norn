import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { readRaw, writeFileAtomic } from "../../src/adapters/outbound/filesystem/_shared/atomic-json.ts";
import { FsAgentRegistryStore } from "../../src/adapters/outbound/filesystem/fs-agent-registry-store.ts";
import { FsFeatureStore } from "../../src/adapters/outbound/filesystem/fs-feature-store.ts";
import { FsProjectStore } from "../../src/adapters/outbound/filesystem/fs-project-store.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

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
    createPipelineRuntime(ROOT, { homeDir: resolve(featureRoot, "audit-home") }).scaffold({
      stepId: "concept", outputPath: resolve(outside, "concept.json"), allowedRoot: featureRoot,
      authorAgentId: "Codex_security_20260819",
    }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "PATH_SECURITY",
  );
});

test("le scaffold géré ne peut jamais écrire dans .arka-norn", async (context) => {
  const featureRoot = mkdtempSync(join(tmpdir(), "arka-norn-scaffold-reserved-directory-"));
  context.after(() => rmSync(featureRoot, { recursive: true, force: true }));
  const reservedDirectory = resolve(featureRoot, ".arka-norn");
  const reservedOutput = resolve(reservedDirectory, "feature.json");
  mkdirSync(reservedDirectory);
  writeFileSync(reservedOutput, "{\"preserve\":true}\n");

  await assert.rejects(
    createPipelineRuntime(ROOT, { homeDir: resolve(featureRoot, "audit-home") }).scaffold({
      stepId: "concept", outputPath: reservedOutput, allowedRoot: featureRoot,
      authorAgentId: "Codex_security_20260819", force: true,
    }),
    isPathSecurityError,
  );
  assert.equal(readFileSync(reservedOutput, "utf8"), "{\"preserve\":true}\n");
});

test("les lectures et écritures atomiques refusent les cibles symboliques", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-atomic-symlink-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const real = resolve(sandbox, "real");
  const linkedDirectory = resolve(sandbox, "linked");
  mkdirSync(real);
  writeFileSync(resolve(real, "source.json"), "{}\n");
  symlinkSync(real, linkedDirectory, "dir");
  symlinkSync(resolve(real, "source.json"), resolve(sandbox, "linked-file.json"));

  await assert.rejects(writeFileAtomic(resolve(linkedDirectory, "output.json"), "{}\n"), isPathSecurityError);
  await assert.rejects(readRaw(resolve(sandbox, "linked-file.json")), isPathSecurityError);
});

test("les stores refusent les répertoires .arka-norn symboliques avant lecture", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-marker-directory-symlink-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const source = resolve(sandbox, "source-marker");
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(sandbox, "feature");
  mkdirSync(source, { recursive: true });
  mkdirSync(projectRoot);
  mkdirSync(featureRoot);
  writeFileSync(resolve(source, "project.json"), "{}\n");
  writeFileSync(resolve(source, "feature.json"), "{}\n");
  writeFileSync(resolve(source, "agents.json"), "{}\n");
  symlinkSync(source, resolve(projectRoot, ".arka-norn"), "dir");
  symlinkSync(source, resolve(featureRoot, ".arka-norn"), "dir");

  const at = new Date("2026-08-20T12:00:00.000Z");
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 3, createdAt: at, updatedAt: at });
  await assert.rejects(new FsProjectStore().load(projectRoot), isPathSecurityError);
  await assert.rejects(new FsFeatureStore().load(featureRoot), isPathSecurityError);
  await assert.rejects(new FsAgentRegistryStore().load(project), isPathSecurityError);
});

function isPathSecurityError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "PATH_SECURITY";
}
