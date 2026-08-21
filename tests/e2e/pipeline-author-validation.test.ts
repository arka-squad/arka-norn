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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("pipeline status refuse un auteur v3 absent ou hors périmètre", (context) => {
  const fixture = createManagedFeature(context);
  writeSignedConcept(fixture.featureRoot, "Absent_dev_20260820");

  const absent = run(["pipeline", "status", fixture.featureRoot, "--json"], fixture.home, fixture.workspace);
  assert.equal(absent.status, 3, absent.stderr);
  assert.match(absent.stdout, /Absent_dev_20260820.*absent from the Project registry/);

  const outside = runJson<{ readonly id: string }>([
    "agent", "register", "--project", "product", "--provider", "Outside", "--role", "dev",
    "--features", "other-feature", "--session", "outside-feature", "--json",
  ], fixture.home, fixture.workspace);
  assert.equal(outside.status, 0, outside.stderr);
  writeSignedConcept(fixture.featureRoot, outside.json.data.id);

  const unauthorized = run(["pipeline", "status", fixture.featureRoot, "--json"], fixture.home, fixture.workspace);
  assert.equal(unauthorized.status, 3, unauthorized.stderr);
  assert.match(unauthorized.stdout, /outside the Feature scope/);
});

test("une Feature marquée dont le Project ou registre ne peut être vérifié échoue avec le code 3", (context) => {
  const fixture = createManagedFeature(context);
  writeFileSync(resolve(fixture.projectRoot, ".arka-norn", "agents.json"), "{", "utf8");

  const corrupted = run(["status", fixture.featureRoot, "--json"], fixture.home, fixture.workspace);
  assert.equal(corrupted.status, 3, corrupted.stderr);
  assert.match(corrupted.stdout, /Invalid agent registry/);
  assert.doesNotMatch(corrupted.stdout, /overallStatus/);

  const missingRegistry = createManagedFeature(context);
  rmSync(resolve(missingRegistry.projectRoot, ".arka-norn", "agents.json"));
  const unavailable = run(["pipeline", "status", missingRegistry.featureRoot, "--json"], missingRegistry.home, missingRegistry.workspace);
  assert.equal(unavailable.status, 3, unavailable.stderr);
  assert.match(unavailable.stdout, /missing; cannot verify document authors/);
  assert.doesNotMatch(unavailable.stdout, /overallStatus/);
  const nestedDirectory = resolve(missingRegistry.featureRoot, "nested");
  mkdirSync(nestedDirectory);
  const nested = run(["pipeline", "status", nestedDirectory, "--json"], missingRegistry.home, missingRegistry.workspace);
  assert.equal(nested.status, 3, nested.stderr);
  assert.match(nested.stdout, /missing; cannot verify document authors/);
  assert.doesNotMatch(nested.stdout, /overallStatus/);

  const missingProject = createManagedFeature(context);
  rmSync(resolve(missingProject.home, ".arka-norn", "index", "projects.json"));
  const unresolvable = run(["pipeline", "status", missingProject.featureRoot, "--json"], missingProject.home, missingProject.workspace);
  assert.equal(unresolvable.status, 3, unresolvable.stderr);
  assert.match(unresolvable.stdout, /not found in the index/);
  assert.doesNotMatch(unresolvable.stdout, /overallStatus/);
});

test("FastDev et l'orchestration Agent exigent aussi le registre d'auteurs", (context) => {
  const fixture = createManagedFeature(context);
  rmSync(resolve(fixture.projectRoot, ".arka-norn", "agents.json"));

  const advice = run(["agent", "advise", "--project", "product", "--feature", "feature", "--json"], fixture.home, fixture.workspace);
  assert.equal(advice.status, 3, advice.stderr);
  assert.match(advice.stdout, /missing; cannot verify document authors/);
  assert.doesNotMatch(advice.stdout, /overallStatus/);
  const prompt = run([
    "agent", "prompt", "dev", "--project", "product", "--feature", "feature", "--provider", "Codex", "--json",
  ], fixture.home, fixture.workspace);
  assert.equal(prompt.status, 3, prompt.stderr);
  assert.match(prompt.stdout, /missing; cannot verify document authors/);
  const handoff = run(["agent", "handoff-prompt", "--project", "product", "--feature", "feature", "--json"], fixture.home, fixture.workspace);
  assert.equal(handoff.status, 3, handoff.stderr);
  assert.match(handoff.stdout, /missing; cannot verify document authors/);

  const markerPath = resolve(fixture.featureRoot, ".arka-norn", "feature.json");
  const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Record<string, unknown>;
  marker.pipelineId = "arka-norn-fastdev";
  writeFileSync(markerPath, `${JSON.stringify(marker)}\n`, "utf8");
  const fastdev = run(["fastdev", "status", "feature", "--json"], fixture.home, fixture.workspace);
  assert.equal(fastdev.status, 3, fastdev.stderr);
  assert.match(fastdev.stdout, /missing; cannot verify document authors/);
  assert.doesNotMatch(fastdev.stdout, /overallStatus/);
  const next = run(["fastdev", "next", "feature", "--json"], fixture.home, fixture.workspace);
  assert.equal(next.status, 3, next.stderr);
  assert.match(next.stdout, /missing; cannot verify document authors/);
  assert.doesNotMatch(next.stdout, /overallStatus/);
});

test("une Feature marquée hors de son Project ne peut ni être inspectée ni produire un scaffold", (context) => {
  const fixture = createManagedFeature(context);
  const forgedRoot = resolve(fixture.workspace, "outside-project");
  mkdirSync(resolve(forgedRoot, ".arka-norn"), { recursive: true });
  writeFileSync(resolve(forgedRoot, ".arka-norn", "feature.json"), `${JSON.stringify({
    schemaVersion: 3,
    id: "feature",
    projectId: "product",
    name: "Forged outside Project",
    pipelineId: "arka-norn-default",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
  })}\n`, "utf8");

  const inspection = run(["pipeline", "status", forgedRoot, "--json"], fixture.home, fixture.workspace);
  assert.equal(inspection.status, 3, inspection.stderr);
  assert.match(inspection.stdout, /Feature must stay strictly contained in Project/);
  assert.doesNotMatch(inspection.stdout, /overallStatus/);

  const statusAlias = run(["status", forgedRoot, "--json"], fixture.home, fixture.workspace);
  assert.equal(statusAlias.status, 3, statusAlias.stderr);
  assert.match(statusAlias.stdout, /Feature must stay strictly contained in Project/);
  assert.doesNotMatch(statusAlias.stdout, /overallStatus/);

  const scaffold = run(["scaffold", "concept", resolve(forgedRoot, "concept.json"), "--agent", fixture.authorAgentId, "--json"], fixture.home, fixture.workspace);
  assert.equal(scaffold.status, 3, scaffold.stderr);
  assert.match(scaffold.stdout, /Feature must stay strictly contained in Project/);

  const indexPath = resolve(fixture.home, ".arka-norn", "index", "features.json");
  const index = JSON.parse(readFileSync(indexPath, "utf8")) as { entries: Array<{ id: string; root: string }> };
  index.entries.find((entry) => entry.id === "feature")!.root = forgedRoot;
  writeFileSync(indexPath, `${JSON.stringify(index)}\n`, "utf8");
  const featureShow = run(["feature", "show", "feature", "--json"], fixture.home, fixture.workspace);
  assert.equal(featureShow.status, 3, featureShow.stderr);
  assert.match(featureShow.stdout, /path must be strictly contained/);
  const featureList = run(["feature", "list", "--project", "product", "--json"], fixture.home, fixture.workspace);
  assert.equal(featureList.status, 0, featureList.stderr);
  assert.deepEqual(JSON.parse(featureList.stdout).data, []);
  const managedScaffold = run([
    "pipeline", "scaffold", "concept", "--feature", "feature", "--output", resolve(forgedRoot, "managed-concept.json"), "--agent", fixture.authorAgentId, "--json",
  ], fixture.home, fixture.workspace);
  assert.equal(managedScaffold.status, 3, managedScaffold.stderr);
  assert.match(managedScaffold.stdout, /path must be strictly contained/);
});

test("un index Project falsifié ne peut pas redéfinir la frontière Pipeline", (context) => {
  const fixture = createManagedFeature(context);
  const foreignRoot = resolve(fixture.workspace, "foreign-project");
  const foreignFeatureRoot = resolve(foreignRoot, "forged-feature");
  mkdirSync(foreignRoot, { recursive: true });
  assert.equal(run([
    "project", "add", foreignRoot, "--id", "foreign", "--name", "Foreign", "--orchestration-mode", "manual", "--json",
  ], fixture.home, fixture.workspace).status, 0);
  mkdirSync(resolve(foreignFeatureRoot, ".arka-norn"), { recursive: true });
  writeFileSync(resolve(foreignFeatureRoot, ".arka-norn", "feature.json"), `${JSON.stringify({
    schemaVersion: 3,
    id: "forged-feature",
    projectId: "product",
    name: "Forged feature",
    pipelineId: "arka-norn-default",
    createdAt: "2026-08-20T12:00:00.000Z",
    updatedAt: "2026-08-20T12:00:00.000Z",
  })}\n`, "utf8");
  const projectIndexPath = resolve(fixture.home, ".arka-norn", "index", "projects.json");
  const projectIndex = JSON.parse(readFileSync(projectIndexPath, "utf8")) as { entries: Array<{ id: string; root: string }> };
  projectIndex.entries.find((entry) => entry.id === "product")!.root = foreignRoot;
  writeFileSync(projectIndexPath, `${JSON.stringify(projectIndex)}\n`, "utf8");

  const projectShow = run(["project", "show", "product", "--json"], fixture.home, fixture.workspace);
  assert.equal(projectShow.status, 3, projectShow.stderr);
  assert.match(projectShow.stdout, /project marker identity does not match index entry product/);
  const directPipeline = run(["pipeline", "status", foreignFeatureRoot, "--json"], fixture.home, fixture.workspace);
  assert.equal(directPipeline.status, 3, directPipeline.stderr);
  assert.match(directPipeline.stdout, /project marker identity does not match index entry product/);
  assert.doesNotMatch(directPipeline.stdout, /overallStatus/);
});

test("un dossier sans marqueur conserve le mode compatibilité", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-unmanaged-pipeline-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const directory = resolve(sandbox, "legacy");
  mkdirSync(directory, { recursive: true });

  const result = run(["pipeline", "status", directory, "--json"], resolve(sandbox, "home"), sandbox);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stdout, /Dossier sans marqueur Feature/);
});

interface ManagedFeatureFixture {
  readonly home: string;
  readonly workspace: string;
  readonly projectRoot: string;
  readonly featureRoot: string;
  readonly authorAgentId: string;
}

function createManagedFeature(context: { after(callback: () => void): void }): ManagedFeatureFixture {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-pipeline-author-"));
  const home = resolve(sandbox, "home");
  const workspace = resolve(sandbox, "workspace");
  const projectRoot = resolve(workspace, "product");
  const featureRoot = resolve(projectRoot, "feature");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  assert.equal(run(["project", "add", projectRoot, "--id", "product", "--name", "Product", "--orchestration-mode", "manual", "--json"], home, workspace).status, 0);
  assert.equal(run([
    "feature", "create", "Feature", "--project", "product", "--id", "feature", "--path", featureRoot, "--json",
  ], home, workspace).status, 0);
  const author = runJson<{ readonly id: string }>([
    "agent", "register", "--project", "product", "--provider", "Codex", "--role", "dev",
    "--features", "feature", "--session", "dev-feature", "--json",
  ], home, workspace);
  assert.equal(author.status, 0, author.stderr);
  return { home, workspace, projectRoot, featureRoot, authorAgentId: author.json.data.id };
}

function writeSignedConcept(featureRoot: string, authorAgentId: string): void {
  writeFileSync(resolve(featureRoot, "concept.json"), `${JSON.stringify({
    schema_version: 3,
    type: "concept",
    id: "concept-1",
    feature_id: "feature",
    author_agent_id: authorAgentId,
  })}\n`, "utf8");
}

interface RunJson<T> {
  readonly status: number | null;
  readonly stderr: string;
  readonly json: { readonly data: T };
}

function runJson<T>(args: readonly string[], home: string, cwd: string): RunJson<T> {
  const result = run(args, home, cwd);
  return { status: result.status, stderr: result.stderr, json: JSON.parse(result.stdout) as RunJson<T>["json"] };
}

function run(args: readonly string[], home: string, cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ARKA_NORN_HOME: home },
  });
}
