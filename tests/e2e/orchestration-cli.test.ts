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
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { runOrchestrationCommand } from "../../src/adapters/inbound/cli/orchestration-cli.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("la CLI d'orchestration expose l'état Project sans créer de politique lors d'une simple lecture", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-orchestration-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });

  const result = await runOrchestrationCommand(["status", "--project", "project", "--json"], { homeDir: home, cwd: projectRoot, frameworkRoot: ROOT, environment: {} });
  assert.equal(result.code, 0);
  const envelope = JSON.parse(result.stdout) as { readonly data: { readonly orchestrationMode: string; readonly policy: unknown; readonly executions: readonly unknown[] } };
  assert.equal(envelope.data.orchestrationMode, "manual");
  assert.equal(envelope.data.policy, null);
  assert.deepEqual(envelope.data.executions, []);
});

test("la CLI refuse les arguments ambigus des commandes d'orchestration", async () => {
  const result = await runOrchestrationCommand(["start", "--project", "project", "--unexpected"], { homeDir: "/tmp/unused", cwd: "/tmp", frameworkRoot: ROOT, environment: {} });
  assert.equal(result.code, 64);
  assert.match(result.stderr, /unknown option/);
});

test("le point d'entrée worker 2.2 reste gelé après mise à niveau", async () => {
  const result = await runOrchestrationCommand(["_worker", "--project", "project", "--execution", "legacy-execution"], { homeDir: "/tmp/unused", cwd: "/tmp", frameworkRoot: ROOT, environment: {} });
  assert.equal(result.code, 3);
  assert.match(result.stderr, /cannot be started or resumed/u);
});

test("la CLI met le moteur automatique 2.2 en quarantaine et conserve le démarrage manuel", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-orchestration-cli-choice-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });
  const cliContext = { homeDir: home, cwd: projectRoot, frameworkRoot: ROOT, environment: {} };

  const retiredConfiguration = await runOrchestrationCommand([
    "configure", "--project", "project", "--provider", "kimi", "--model", "kimi-coding", "--workspace", "isolated", "--json",
  ], cliContext);
  assert.equal(retiredConfiguration.code, 3, retiredConfiguration.stderr);
  assert.match(retiredConfiguration.stdout, /Legacy automatic configuration was removed/u);

  const incompleteStart = await runOrchestrationCommand([
    "start", "--project", "project", "--feature", "feature", "--provider", "claude", "--model", "claude-test", "--json",
  ], cliContext);
  assert.equal(incompleteStart.code, 64);
  assert.match(incompleteStart.stdout, /--preview is required/);

});
