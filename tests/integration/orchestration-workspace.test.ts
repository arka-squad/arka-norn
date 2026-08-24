/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { FsOrchestrationWorkspaceManager } from "../../src/adapters/outbound/filesystem/fs-orchestration-workspace.ts";
import { OrchestrationCampaign } from "../../src/domain/orchestration/orchestration-campaign.ts";
import { userExecutionTarget } from "../../src/domain/orchestration/types.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Project } from "../../src/domain/project/project.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { prepareRecipeWorkspace } from "../../scripts/orchestration-recipe-runner.mjs";

const at = new Date("2026-08-24T08:00:00.000Z");
const ROOT = resolve(import.meta.dirname, "..", "..");

test("le miroir exclut secrets, symlinks et état privé puis bloque un conflit globalement", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-workspace-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const home = join(sandbox, "home");
  const root = join(sandbox, "product");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".arka-norn"), { recursive: true });
  writeFileSync(join(root, "src", "app.ts"), "old\n");
  writeFileSync(join(root, "README.md"), "baseline\n");
  writeFileSync(join(root, "notes.txt"), "unrelated baseline\n");
  writeFileSync(join(root, "move.txt"), "rename me\n");
  writeFileSync(join(root, ".env"), "TOKEN=secret\n");
  writeFileSync(join(root, ".arka-norn", "project.json"), "{}\n");
  symlinkSync(join(root, "README.md"), join(root, "src", "linked.md"));
  const project = createProject(root);
  const campaign = createCampaign(project, "campaign-20260824-mirror");
  const manager = new FsOrchestrationWorkspaceManager(home);
  const prepared = await manager.prepare(project, campaign);

  assert.equal(readFileSync(join(prepared.physicalRoot, "src", "app.ts"), "utf8"), "old\n");
  assert.equal(prepared.excludedPaths.includes(".env"), true);
  assert.equal(prepared.excludedPaths.includes(".arka-norn"), true);
  assert.equal(prepared.excludedPaths.includes("src/linked.md"), true);

  writeFileSync(join(prepared.physicalRoot, "src", "app.ts"), "new\n");
  writeFileSync(join(prepared.physicalRoot, "README.md"), "new readme\n");
  renameSync(join(prepared.physicalRoot, "move.txt"), join(prepared.physicalRoot, "moved.txt"));
  const changes = await manager.changes(project, campaign);
  assert.equal(changes.changes.length, 3);
  assert.deepEqual(changes.changes.find((change) => change.kind === "renamed"), { path: "moved.txt", previousPath: "move.txt", kind: "renamed", size: 10, binary: false });
  writeFileSync(join(root, "notes.txt"), "unrelated human edit\n");
  await assert.rejects(manager.apply(project, campaign, changes.fingerprint), /Conflict: notes\.txt/);
  assert.equal(readFileSync(join(root, "src", "app.ts"), "utf8"), "old\n");
});

test("une recette ne voit qu'une copie jetable expurgée du Project", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-recipe-copy-"));
  const root = join(sandbox, "project");
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, ".arka-norn"));
  mkdirSync(join(root, "node_modules"));
  writeFileSync(join(root, "src", "app.js"), "export default true;\n");
  writeFileSync(join(root, ".env"), "TOKEN=secret\n");
  writeFileSync(join(root, ".git", "config"), "private\n");
  writeFileSync(join(root, ".arka-norn", "project.json"), "{}\n");
  writeFileSync(join(root, "node_modules", "cache.js"), "cached\n");
  symlinkSync(join(root, ".env"), join(root, "src", "secret-link"));
  const recipeRoot = await prepareRecipeWorkspace(root);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  context.after(() => rmSync(resolve(recipeRoot, ".."), { recursive: true, force: true }));

  assert.equal(readFileSync(join(recipeRoot, "src", "app.js"), "utf8"), "export default true;\n");
  assert.equal(existsSync(join(recipeRoot, ".env")), false);
  assert.equal(existsSync(join(recipeRoot, ".git")), false);
  assert.equal(existsSync(join(recipeRoot, ".arka-norn")), false);
  assert.equal(existsSync(join(recipeRoot, "node_modules")), false);
  assert.equal(existsSync(join(recipeRoot, "src", "secret-link")), false);
});

test("le broker MCP impose scope, révision et reçu mécanique", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-broker-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const workspace = join(sandbox, "workspace");
  const receipts = join(sandbox, "receipts");
  mkdirSync(join(workspace, "src"), { recursive: true });
  writeFileSync(join(workspace, "src", "app.ts"), "old\n");
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve(ROOT, "scripts", "orchestration-tool-server.mjs"), "--workspace", workspace, "--receipts", receipts, "--execution", "execution-safe", "--scope", JSON.stringify(["src"]), "--write", "1", "--recipes", "1"],
    stderr: "pipe",
  });
  const client = new Client({ name: "arka-norn-test", version: "1.0.0" });
  context.after(() => client.close());
  await client.connect(transport);
  const framework = await client.callTool({ name: "framework_state", arguments: {} });
  assert.match(JSON.stringify(framework.structuredContent), /run_recipe/u);
  const recipe = await client.callTool({ name: "run_recipe", arguments: { kind: "test", timeoutMs: 1_000 } });
  assert.match(JSON.stringify(recipe.structuredContent), /MANIFEST_MISSING/u);
  assert.match(JSON.stringify(recipe.structuredContent), /receipt-recipe-test-blocked-/u);
  const read = await client.callTool({ name: "read_file", arguments: { path: "src/app.ts" } });
  const state = read.structuredContent as { readonly sha256: string };
  const changed = await client.callTool({ name: "propose_change", arguments: { path: "src/app.ts", content: "new\n", expectedSha256: state.sha256 } });
  assert.equal(changed.isError, undefined);
  assert.equal(readFileSync(join(workspace, "src", "app.ts"), "utf8"), "new\n");
  assert.match(JSON.stringify(changed.structuredContent), /receipt-/u);
  const stale = await client.callTool({ name: "propose_change", arguments: { path: "src/app.ts", content: "bad\n", expectedSha256: state.sha256 } });
  assert.equal(stale.isError, true);
  const traversal = await client.callTool({ name: "read_file", arguments: { path: "../outside" } });
  assert.equal(traversal.isError, true);
  const governance = await client.callTool({ name: "propose_change", arguments: { path: ".arka-norn/policy.json", content: "{}", expectedSha256: null } });
  assert.equal(governance.isError, true);
  const decision = await client.callTool({ name: "request_decision", arguments: { question: "Choose the bounded option.", choices: ["A", "B"] } });
  assert.match(JSON.stringify(decision.structuredContent), /receipt-decision-/u);
  const afterDecision = await client.callTool({ name: "read_file", arguments: { path: "src/app.ts" } });
  assert.equal(afterDecision.isError, true);
});

test("l'application restaure un renommage après validation en échec puis l'applique atomiquement", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-apply-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const root = join(sandbox, "product");
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, "before.txt"), "stable\n");
  const project = createProject(root);
  const campaign = createCampaign(project, "campaign-20260824-apply");
  const manager = new FsOrchestrationWorkspaceManager(join(sandbox, "home"));
  const prepared = await manager.prepare(project, campaign);
  renameSync(join(prepared.physicalRoot, "before.txt"), join(prepared.physicalRoot, "after.txt"));
  const changes = await manager.changes(project, campaign);

  await assert.rejects(manager.apply(project, campaign, changes.fingerprint, () => Promise.reject(new Error("validation failed"))), /validation failed/u);
  assert.equal(readFileSync(join(root, "before.txt"), "utf8"), "stable\n");
  assert.equal(existsSync(join(root, "after.txt")), false);

  await manager.apply(project, campaign, changes.fingerprint);
  assert.equal(existsSync(join(root, "before.txt")), false);
  assert.equal(readFileSync(join(root, "after.txt"), "utf8"), "stable\n");
});

function createProject(root: string): Project {
  return Project.create({ id: ProjectId.of("project"), name: "Project", root, schemaVersion: 4, orchestrationMode: "automatic", createdAt: at, updatedAt: at });
}

function createCampaign(project: Project, id: string): OrchestrationCampaign {
  return OrchestrationCampaign.planned({ id, projectId: project.id, featureId: FeatureId.of("feature"), target: userExecutionTarget("claude", "test"), workspaceMode: "isolated", scopePaths: ["."], previewFingerprint: "a".repeat(64), frameworkVersion: "test", maxMissions: 2, retryCount: 0, currentStepId: "concept" }, at);
}
