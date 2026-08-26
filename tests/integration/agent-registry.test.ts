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
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsAgentRegistryStore } from "../../src/adapters/outbound/filesystem/fs-agent-registry-store.ts";
import { FsAgentSessionStore } from "../../src/adapters/outbound/filesystem/fs-agent-session-store.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { SystemClock } from "../../src/adapters/outbound/system/system-clock.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";
import { manageAgentsUseCaseFactory } from "../../src/use-cases/agents/manage-agents.ts";

test("le registre sérialise les inscriptions concurrentes sans collision et garde les permissions", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-agent-registry-"));
  const projectRoot = resolve(sandbox, "project");
  const home = resolve(sandbox, "home");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const at = new Date("2026-08-19T10:00:00.000Z");
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 3, createdAt: at, updatedAt: at });
  const service = manageAgentsUseCaseFactory({ registry: new FsAgentRegistryStore(), session: new FsAgentSessionStore(home), sessionId: AgentSessionId.of("dev-project"), clock: new SystemClock() });

  const created = await Promise.all(Array.from({ length: 8 }, () => service.register({ project, provider: "Codex", role: "dev" })));
  assert.equal(new Set(created.map((agent) => agent.id.value)).size, 8);
  assert.equal((await service.list(project)).length, 8);

  const registryPath = resolve(projectRoot, ".arka-norn", "agents.json");
  const sessionPath = resolve(home, ".arka-norn", "context", "agents.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as { readonly schemaVersion: number; readonly revision: number; readonly agents: readonly unknown[] };
  assert.equal(registry.schemaVersion, 2);
  assert.equal(registry.revision, 8);
  assert.equal(registry.agents.length, 8);
  if (process.platform !== "win32") {
    assert.equal(lstatSync(registryPath).mode & 0o777, 0o644);
    assert.equal(lstatSync(sessionPath).mode & 0o777, 0o600);
  }
});

test("un registre corrompu est refusé sans réécriture silencieuse", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-agent-corrupt-"));
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(resolve(projectRoot, ".arka-norn"), { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const at = new Date("2026-08-19T10:00:00.000Z");
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 3, createdAt: at, updatedAt: at });
  const path = resolve(projectRoot, ".arka-norn", "agents.json");
  writeFileSync(path, '{"schemaVersion":1,"projectId":"other","updatedAt":"bad","agents":[]}\n');
  const store = new FsAgentRegistryStore();
  await assert.rejects(store.load(project), (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_AGENT_REGISTRY");
  assert.match(readFileSync(path, "utf8"), /"projectId":"other"/);
});

test("agent current ne répare pas silencieusement une sélection inactive", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-agent-current-read-"));
  const projectRoot = resolve(sandbox, "project");
  const home = resolve(sandbox, "home");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const at = new Date("2026-08-19T10:00:00.000Z");
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 3, createdAt: at, updatedAt: at });
  const session = new FsAgentSessionStore(home);
  const service = manageAgentsUseCaseFactory({ registry: new FsAgentRegistryStore(), session, sessionId: AgentSessionId.of("dev-project"), clock: new SystemClock() });
  const agent = await service.register({ project, provider: "Codex", role: "dev" });
  await service.deactivate(project, agent.id);
  await session.select(AgentSessionId.of("dev-project"), project.id, agent.id);
  const sessionPath = resolve(home, ".arka-norn", "context", "agents.json");
  const before = readFileSync(sessionPath, "utf8");

  assert.equal(await service.current(project), undefined);
  assert.equal(readFileSync(sessionPath, "utf8"), before);
});

test("la session main refuse un nouvel Agent spécialisé", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-agent-main-role-"));
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const at = new Date("2026-08-20T10:00:00.000Z");
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 3, createdAt: at, updatedAt: at });
  const service = manageAgentsUseCaseFactory({ registry: new FsAgentRegistryStore(), session: new FsAgentSessionStore(resolve(sandbox, "home")), clock: new SystemClock() });

  await assert.rejects(service.register({ project, provider: "Codex", role: "dev" }), /main session is reserved for the main Product Agent/);
  assert.match((await service.register({ project, provider: "Codex", role: "product" })).id.value, /_product_/);
});

test("deux sessions provider gardent des Agents courants indépendants", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-agent-sessions-"));
  const projectRoot = resolve(sandbox, "project");
  const home = resolve(sandbox, "home");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const at = new Date("2026-08-20T10:00:00.000Z");
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 3, createdAt: at, updatedAt: at });
  const store = new FsAgentSessionStore(home);
  const registry = new FsAgentRegistryStore();
  const product = manageAgentsUseCaseFactory({ registry, session: store, sessionId: AgentSessionId.MAIN, clock: new SystemClock() });
  const audit = manageAgentsUseCaseFactory({ registry, session: store, sessionId: AgentSessionId.of("audit-feature"), clock: new SystemClock() });

  const productAgent = await product.register({ project, provider: "Codex", role: "product" });
  const auditAgent = await audit.register({ project, provider: "Claude", role: "audit" });

  assert.equal((await product.current(project))?.id.value, productAgent.id.value);
  assert.equal((await audit.current(project))?.id.value, auditAgent.id.value);
  assert.deepEqual((await product.sessions(project)).map((binding) => [binding.sessionId.value, binding.agent.id.value]), [
    ["audit-feature", auditAgent.id.value],
    ["main", productAgent.id.value],
  ]);
  const sessionFile = JSON.parse(readFileSync(resolve(home, ".arka-norn", "context", "agents.json"), "utf8")) as { readonly schemaVersion: number };
  assert.equal(sessionFile.schemaVersion, 2);
});

test("une sélection v1 est lue dans main puis migrée atomiquement en v2", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-agent-session-v1-"));
  const home = resolve(sandbox, "home");
  const sessionPath = resolve(home, ".arka-norn", "context", "agents.json");
  mkdirSync(resolve(home, ".arka-norn", "context"), { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  writeFileSync(sessionPath, '{"schemaVersion":1,"selectedByProject":{"project":"Codex_product_20260820"}}\n', { mode: 0o600 });
  const store = new FsAgentSessionStore(home);

  assert.equal((await store.current(AgentSessionId.MAIN, ProjectId.of("project")))?.value, "Codex_product_20260820");
  await store.select(AgentSessionId.of("audit-feature"), ProjectId.of("project"), undefined);

  const migrated = JSON.parse(readFileSync(sessionPath, "utf8")) as { readonly schemaVersion: number; readonly selectedBySession: Record<string, Record<string, string>> };
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.selectedBySession["main"]?.["project"], "Codex_product_20260820");
});
