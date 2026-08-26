/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FsOrchestrationConfigurationStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-configuration-store.ts";
import { FsAgentRegistryStore } from "../../src/adapters/outbound/filesystem/fs-agent-registry-store.ts";
import { FsOrchestrationRecovery } from "../../src/adapters/outbound/filesystem/fs-orchestration-recovery.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

const at = new Date("2026-08-25T20:00:00.000Z");

test("la récupération inventorie, met en quarantaine et restaure sans supprimer l'état legacy", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-recovery-"));
  const home = join(sandbox, "home");
  const project = createProject(join(sandbox, "project"));
  context.after(() => { makeWritable(sandbox); rmSync(sandbox, { recursive: true, force: true }); });
  seedLegacyState(project.root, home);
  const recovery = new FsOrchestrationRecovery(home);

  const manifest = await recovery.inspect(project);
  assert.match(manifest.fingerprint, /^[a-f0-9]{64}$/u);
  assert.ok(manifest.entries.some((entry) => entry.logicalPath === ".arka-norn/orchestration.json"));
  assert.ok(manifest.entries.some((entry) => entry.logicalPath === "orchestration/workspaces/campaign-legacy/root/guide.md"));
  assert.ok(manifest.entries.some((entry) => entry.logicalPath === "campaign-holding/gitnexus-lbug-fixture"));
  assert.equal(manifest.exactDuplicateAgentGroups.length, 1);
  await assert.rejects(recovery.quarantine(project, "0".repeat(64)), /changed before quarantine/u);

  const receipt = await recovery.quarantine(project, manifest.fingerprint);
  assert.equal(existsSync(join(project.root, ".arka-norn", "orchestration.json")), false);
  assert.equal(existsSync(join(project.root, ".arka-norn", "agents.json")), true);
  assert.equal(existsSync(join(home, ".arka-norn", "orchestration", "workspaces", "campaign-legacy")), false);
  assert.equal(existsSync(join(receipt.path, "project", ".arka-norn", "orchestration.json")), true);
  assert.equal(existsSync(join(home, ".arka-norn", "campaign-holding", "gitnexus-lbug-fixture")), false);

  await recovery.restore(project, receipt.id, manifest.fingerprint);
  assert.equal(existsSync(join(project.root, ".arka-norn", "orchestration.json")), true);
  assert.equal(existsSync(join(home, ".arka-norn", "orchestration", "workspaces", "campaign-legacy", "root", "guide.md")), true);
  assert.equal(readFileSync(join(project.root, ".gitnexus", "lbug"), "utf8"), "held-index\n");
});

test("l'import legacy produit des profils 2.3 désactivés et refuse l'écrasement implicite", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-import-"));
  const home = join(sandbox, "home");
  const project = createProject(join(sandbox, "project"));
  context.after(() => { makeWritable(sandbox); rmSync(sandbox, { recursive: true, force: true }); });
  seedLegacyState(project.root, home);
  const recovery = new FsOrchestrationRecovery(home);
  const store = new FsOrchestrationConfigurationStore();
  await assert.rejects(store.load(project), /read-only/u);

  const manifest = await recovery.inspect(project);
  const receipt = await recovery.quarantine(project, manifest.fingerprint);
  const imported = await recovery.importLegacy(project, receipt.id, manifest.fingerprint, at);
  assert.equal(imported.automaticEnabled, false);
  assert.equal(imported.profiles.length, 1);
  assert.equal(imported.profiles[0]?.transport, "codex-cli");
  assert.equal(imported.profiles[0]?.provider, "codex");
  assert.equal(imported.profiles[0]?.model, "zai/glm-5.2");
  assert.equal(imported.profiles[0]?.enabled, false);

  await store.save(project, imported);
  const raw = JSON.parse(readFileSync(join(project.root, ".arka-norn", "orchestration.json"), "utf8")) as Record<string, unknown>;
  assert.equal(raw["schemaVersion"], 4);
  assert.equal((await store.load(project))?.profiles.length, 1);
  const agents = await new FsAgentRegistryStore().load(project);
  assert.equal(agents.filter((agent) => agent.active).length, 1);
  assert.equal(agents.filter((agent) => !agent.active).length, 1);
});

test("l'inspection de reprise conserve les journaux et worktrees 2.3 après un arrêt brutal", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-crash-"));
  const home = join(sandbox, "home");
  const project = createProject(join(sandbox, "project"));
  context.after(() => { makeWritable(sandbox); rmSync(sandbox, { recursive: true, force: true }); });
  const campaign = "campaign-crash";
  const state = join(home, ".arka-norn", "campaigns-v23", project.id.value, campaign);
  const worktree = join(home, ".arka-norn", "worktrees", campaign, "docs");
  mkdirSync(join(state, "events"), { recursive: true });
  mkdirSync(join(worktree, "proofs"), { recursive: true });
  writeJson(join(state, "plan.json"), { schemaVersion: 1, id: campaign });
  writeJson(join(state, "events", "000003.json"), { kind: "task_started", taskId: "docs" });
  writeFileSync(join(worktree, "proofs", "receipt-recipe-test-pass-docs"), "ok\n", "utf8");

  const manifest = await new FsOrchestrationRecovery(home).inspect(project);
  assert.ok(manifest.entries.some((entry) => entry.logicalPath === `campaigns-v23/${project.id.value}/${campaign}/events/000003.json`));
  assert.ok(manifest.entries.some((entry) => entry.logicalPath === `worktrees/${campaign}/docs/proofs/receipt-recipe-test-pass-docs`));
  assert.equal(existsSync(worktree), true);
});

function createProject(root: string): Project {
  mkdirSync(root, { recursive: true });
  return Project.create({ id: ProjectId.of("project"), name: "Project", root, schemaVersion: 4, orchestrationMode: "automatic", createdAt: at, updatedAt: at });
}

function seedLegacyState(root: string, home: string): void {
  const marker = join(root, ".arka-norn");
  mkdirSync(marker, { recursive: true });
  writeJson(join(marker, "orchestration.json"), {
    schemaVersion: 3,
    projectId: "project",
    selectionMode: "assisted",
    workspaceMode: "isolated",
    providers: [{ provider: "codex", adapter: "codex-cli", enabled: true, priority: 100, capabilities: ["inspect_workspace", "modify_workspace"], permissions: ["read_workspace", "write_workspace"], models: [{ id: "zai/glm-5.2", enabled: true, priority: 100 }] }],
    createdAt: at.toISOString(),
    updatedAt: at.toISOString(),
  });
  writeJson(join(marker, "campaigns.json"), { schemaVersion: 1, projectId: "project", campaigns: [{ id: "campaign-legacy" }] });
  writeJson(join(marker, "executions.json"), { schemaVersion: 2, projectId: "project", updatedAt: at.toISOString(), executions: [] });
  const scope = { projectId: "project", featureIds: ["feature"], paths: ["docs"], responsibilities: ["development"] };
  writeJson(join(marker, "agents.json"), { schemaVersion: 1, projectId: "project", updatedAt: at.toISOString(), agents: [
    { id: "Codex_dev_20260825", provider: "codex", role: "dev", active: true, scope, registeredAt: at.toISOString(), updatedAt: at.toISOString() },
    { id: "Codex_dev_20260825_02", provider: "codex", role: "dev", active: true, scope, registeredAt: at.toISOString(), updatedAt: at.toISOString() },
  ] });
  const workspace = join(home, ".arka-norn", "orchestration", "workspaces", "campaign-legacy", "root");
  mkdirSync(workspace, { recursive: true });
  writeFileSync(join(workspace, "guide.md"), "legacy\n", "utf8");
  const holding = join(home, ".arka-norn", "campaign-holding");
  mkdirSync(holding, { recursive: true });
  writeFileSync(join(holding, "gitnexus-lbug-fixture"), "held-index\n", "utf8");
}

function writeJson(path: string, value: unknown): void { writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }

function makeWritable(path: string): void {
  if (!existsSync(path)) return;
  const info = lstatSync(path);
  if (info.isSymbolicLink()) return;
  chmodSync(path, info.isDirectory() ? 0o700 : 0o600);
  if (info.isDirectory()) for (const name of readdirSync(path)) makeWritable(join(path, name));
}
