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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("workflow and FastDev expose deterministic human and JSON flows", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-fastdev-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const workflows = run<readonly { readonly id: string }[]>(["workflow", "list", "--json"], home, projectRoot);
  assert.equal(workflows.status, 0, workflows.stderr);
  assert.deepEqual(workflows.json.data.map((workflow) => workflow.id), ["arka-norn-complete", "arka-norn-essential", "arka-norn-fastdev"]);
  const shown = run<{ readonly id: string; readonly steps: readonly { readonly id: string }[] }>(["workflow", "show", "fastdev", "--json"], home, projectRoot);
  assert.equal(shown.json.data.id, "arka-norn-fastdev");
  assert.deepEqual(shown.json.data.steps.map((step) => step.id), ["rework_brief", "development_report", "delivery_audit", "delivery_validation"]);
  assert.equal(run(["workflow", "show", "../../evil", "--json"], home, projectRoot).status, 3);

  assert.equal(run(["project", "add", projectRoot, "--id", "project", "--name", "Project", "--orchestration-mode", "manual", "--json"], home, projectRoot).status, 0);
  const started = run<{ readonly id: string; readonly pipelineId: string; readonly root: string }>([
    "fastdev", "start", "Repair navigation", "--project", "project", "--json",
  ], home, projectRoot);
  assert.equal(started.status, 0, started.stderr);
  assert.equal(started.json.data.pipelineId, "arka-norn-fastdev");
  assert.equal(existsSync(resolve(started.json.data.root, ".arka-norn", "feature.json")), true);

  const agent = run<{ readonly id: string }>([
    "agent", "register", "--project", "project", "--provider", "Codex", "--role", "product", "--features", started.json.data.id, "--session", "main", "--json",
  ], home, projectRoot);
  assert.equal(agent.status, 0, agent.stderr);

  const next = run<{
    readonly phase: string;
    readonly iteration: number;
    readonly prerequisites: readonly string[];
    readonly reason: string;
    readonly expectedArtifact: string;
    readonly suggestedCommand: string;
  }>(["fastdev", "next", started.json.data.id, "--session", "product-rework", "--json"], home, projectRoot);
  assert.equal(next.status, 2);
  assert.equal(next.json.data.phase, "Brief");
  assert.equal(next.json.data.iteration, 1);
  assert.deepEqual(next.json.data.prerequisites, []);
  assert.match(next.json.data.reason, /required/i);
  assert.equal(next.json.data.expectedArtifact, "rework_brief.json");
  assert.match(next.json.data.suggestedCommand, /pipeline scaffold rework_brief/);
  assert.match(next.json.data.suggestedCommand, /--session product-rework$/);

  const scaffolded = run<{ readonly outputPath: string }>([
    "pipeline", "scaffold", "rework_brief", "--feature", started.json.data.id, "--json",
  ], home, projectRoot);
  assert.equal(scaffolded.status, 0, scaffolded.stderr);
  const document = JSON.parse(readFileSync(scaffolded.json.data.outputPath, "utf8")) as { readonly type: string; readonly schema_version: number; readonly author_agent_id: string };
  assert.deepEqual([document.type, document.schema_version, document.author_agent_id], ["rework_brief", 5, agent.json.data.id]);
});

test("set-workflow est autorisé uniquement avant le premier document reconnu", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-set-workflow-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(projectRoot, "feature");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  assert.equal(run(["project", "add", projectRoot, "--id", "project", "--orchestration-mode", "manual", "--json"], home, projectRoot).status, 0);
  assert.equal(run(["feature", "create", "Feature", "--project", "project", "--id", "feature", "--path", featureRoot, "--json"], home, projectRoot).status, 0);
  const changed = run<{ readonly pipelineId: string }>(["feature", "set-workflow", "feature", "--workflow", "fastdev", "--json"], home, projectRoot);
  assert.equal(changed.status, 0, changed.stderr);
  assert.equal(changed.json.data.pipelineId, "arka-norn-fastdev");

  const agent = run<{ readonly id: string }>(["agent", "register", "--project", "project", "--provider", "Codex", "--role", "product", "--session", "main", "--json"], home, projectRoot);
  assert.equal(agent.status, 0);
  assert.equal(run(["pipeline", "scaffold", "rework_brief", "--feature", "feature", "--json"], home, projectRoot).status, 0);
  const refused = run(["feature", "set-workflow", "feature", "--workflow", "complete", "--json"], home, projectRoot);
  assert.equal(refused.status, 3);
  assert.equal(refused.json.ok, false);
  assert.match(refused.json.display.errors[0] ?? "", /immutable/);
});

interface RunResult<T> {
  readonly status: number | null;
  readonly stderr: string;
  readonly json: { readonly ok: boolean; readonly data: T; readonly errors: readonly string[]; readonly display: { readonly errors: readonly string[] } };
}

function run<T = unknown>(args: readonly string[], home: string, cwd: string): RunResult<T> {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, ARKA_NORN_HOME: home } });
  assert.notEqual(result.stdout.trim(), "", `${args.join(" ")} produced no JSON: ${result.stderr}`);
  return { status: result.status, stderr: result.stderr, json: JSON.parse(result.stdout) as RunResult<T>["json"] };
}
