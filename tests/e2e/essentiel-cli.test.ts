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
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");
const EXAMPLE = resolve(ROOT, "examples", "feature-essentiel");

test("Essentiel guide un cycle complet avec audit bloquant et CR correctif", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-essentiel-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  assert.equal(run(["project", "add", projectRoot, "--id", "project", "--orchestration-mode", "manual", "--json"], home, projectRoot).status, 0);
  const started = run<{ readonly id: string; readonly root: string; readonly pipelineId: string }>([
    "essentiel", "start", "Filtre Features", "--project", "project", "--json",
  ], home, projectRoot);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(started.json.data.pipelineId, "arka-norn-essentiel");

  for (const role of ["dev", "audit", "qa"]) {
    const registered = run([
      "agent", "register", "--project", "project", "--provider", "Codex", "--role", role,
      "--features", started.json.data.id, "--session", `${role}-filtre`, "--json",
    ], home, projectRoot);
    assert.equal(registered.status, 0, registered.stderr);
  }

  assertNext(home, projectRoot, started.json.data.id, "cadrage_essentiel", 1);
  installDocument("01-cadrage-essentiel.json", started.json.data.root, started.json.data.id);
  assertNext(home, projectRoot, started.json.data.id, "cr_dev", 1);
  installDocument("02-cr-dev.json", started.json.data.root, started.json.data.id);
  assertNext(home, projectRoot, started.json.data.id, "audit_livraison", 1);
  installDocument("03-audit-livraison.json", started.json.data.root, started.json.data.id);
  assertNext(home, projectRoot, started.json.data.id, "cr_dev", 2);
  installDocument("04-cr-dev-correctif.json", started.json.data.root, started.json.data.id);
  assertNext(home, projectRoot, started.json.data.id, "validation_livraison", 2);
  installDocument("05-validation-livraison.json", started.json.data.root, started.json.data.id);

  const completed = run<{
    readonly action: null;
    readonly phase: string;
    readonly iteration: number;
  }>(["essentiel", "next", started.json.data.id, "--session", "qa-filtre", "--json"], home, projectRoot);
  assert.equal(completed.status, 0, completed.stderr);
  assert.deepEqual([completed.json.data.action, completed.json.data.phase, completed.json.data.iteration], [null, "Terminé", 2]);
  const status = run<{ readonly selectedDocuments: Readonly<Record<string, string>> }>([
    "essentiel", "status", started.json.data.id, "--json",
  ], home, projectRoot);
  assert.equal(status.status, 0, status.stderr);
  assert.equal(status.json.data.selectedDocuments.validation_livraison, "validation-filtre-etats-1");
});

function assertNext(home: string, cwd: string, featureId: string, stepId: string, iteration: number): void {
  const next = run<{ readonly expectedArtifact: string; readonly iteration: number }>([
    "essentiel", "next", featureId, "--session", "dev-filtre", "--json",
  ], home, cwd);
  assert.equal(next.status, 2, next.stderr);
  assert.deepEqual([next.json.data.expectedArtifact, next.json.data.iteration], [`${stepId}.json`, iteration]);
}

function installDocument(file: string, featureRoot: string, featureId: string): void {
  const document = JSON.parse(readFileSync(resolve(EXAMPLE, file), "utf8")) as Record<string, unknown>;
  document.feature_id = featureId;
  writeFileSync(resolve(featureRoot, file), `${JSON.stringify(document, null, 2)}\n`, "utf8");
}

interface RunResult<T> {
  readonly status: number | null;
  readonly stderr: string;
  readonly json: { readonly data: T; readonly errors: readonly string[] };
}

function run<T = unknown>(args: readonly string[], home: string, cwd: string): RunResult<T> {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, ARKA_NORN_HOME: home } });
  assert.notEqual(result.stdout.trim(), "", `${args.join(" ")} produced no JSON: ${result.stderr}`);
  return { status: result.status, stderr: result.stderr, json: JSON.parse(result.stdout) as RunResult<T>["json"] };
}
