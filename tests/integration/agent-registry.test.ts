import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsAgentRegistryStore } from "../../src/adapters/outbound/filesystem/fs-agent-registry-store.ts";
import { FsAgentSessionStore } from "../../src/adapters/outbound/filesystem/fs-agent-session-store.ts";
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
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 2, createdAt: at, updatedAt: at });
  const service = manageAgentsUseCaseFactory({ registry: new FsAgentRegistryStore(), session: new FsAgentSessionStore(home), clock: new SystemClock() });

  const created = await Promise.all(Array.from({ length: 8 }, () => service.register({ project, provider: "Codex", role: "dev" })));
  assert.equal(new Set(created.map((agent) => agent.id.value)).size, 8);
  assert.equal((await service.list(project)).length, 8);

  const registryPath = resolve(projectRoot, ".arka-norn", "agents.json");
  const sessionPath = resolve(home, ".arka-norn", "context", "agents.json");
  const registry = JSON.parse(readFileSync(registryPath, "utf8")) as { readonly schemaVersion: number; readonly agents: readonly unknown[] };
  assert.equal(registry.schemaVersion, 1);
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
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, schemaVersion: 2, createdAt: at, updatedAt: at });
  const path = resolve(projectRoot, ".arka-norn", "agents.json");
  writeFileSync(path, '{"schemaVersion":1,"projectId":"other","updatedAt":"bad","agents":[]}\n');
  const store = new FsAgentRegistryStore();
  await assert.rejects(store.load(project), (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_AGENT_REGISTRY");
  assert.match(readFileSync(path, "utf8"), /"projectId":"other"/);
});
