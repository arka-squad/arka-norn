/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { GitWorktreeWorkspaceAdapter } from "../../src/adapters/outbound/execution/git-workspace-adapter.ts";
import type { TaskPlan } from "../../src/domain/orchestration/orchestration-plan.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

const at = new Date("2026-08-25T20:00:00.000Z");
const agentId = "Codex_development_20260825";

test("le snapshot privé inclut seulement les changements et fichiers non suivis autorisés", async (context) => {
  const fixture = repositoryFixture(context);
  writeFileSync(join(fixture.root, "docs", "guide.md"), "local docs\n", "utf8");
  writeFileSync(join(fixture.root, "src", "main.ts"), "local source\n", "utf8");
  writeFileSync(join(fixture.root, "docs", "new.md"), "declared\n", "utf8");
  writeFileSync(join(fixture.root, ".env"), "SECRET=value\n", "utf8");

  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-snapshot", includeScopes: ["docs"], declaredUntracked: ["docs/new.md"] });
  assert.equal(snapshot.clean, false);
  assert.equal(git(fixture.root, ["show", `${snapshot.commit}:docs/guide.md`]), "local docs\n");
  assert.equal(git(fixture.root, ["show", `${snapshot.commit}:docs/new.md`]), "declared\n");
  assert.equal(git(fixture.root, ["show", `${snapshot.commit}:src/main.ts`]), "initial source\n");
  assert.equal(git(fixture.root, ["diff", "--cached"]), "");
  assert.throws(() => git(fixture.root, ["show", `${snapshot.commit}:.env`]));
});

test("Norn committe deux tâches isolées, les intègre puis applique seulement en fast-forward", async (context) => {
  const fixture = repositoryFixture(context);
  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-parallel", includeScopes: ["docs", "tests"], declaredUntracked: [] });
  const docsTask = task("docs-task", "dev", "docs");
  const testsTask = task("tests-task", "qa", "tests");
  const docsWorkspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-parallel", docsTask);
  const testsWorkspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-parallel", testsTask);
  writeFileSync(join(docsWorkspace.path, "docs", "parallel.md"), "docs task\n", "utf8");
  writeFileSync(join(testsWorkspace.path, "tests", "parallel.test.ts"), "export {};\n", "utf8");

  const docsCommit = await fixture.adapter.commitTask(fixture.project, docsWorkspace, docsTask, { campaignId: "campaign-parallel", agentId, profileId: "codex-dev", executionId: "execution-docs", proofReferences: ["proof/docs"] });
  const testsCommit = await fixture.adapter.commitTask(fixture.project, testsWorkspace, testsTask, { campaignId: "campaign-parallel", agentId, profileId: "claude-qa", executionId: "execution-tests", proofReferences: ["proof/tests"] });
  assert.match(git(docsWorkspace.path, ["show", "-s", "--format=%B", docsCommit.commit]), /Norn-Evidence: [a-f0-9]{64}/u);
  assert.match(git(docsWorkspace.path, ["show", "-s", "--format=%B", docsCommit.commit]), /Norn-Agent: Codex_development_20260825/u);

  const integration = await fixture.adapter.integrate(fixture.project, snapshot, "campaign-parallel", [docsCommit, testsCommit]);
  assert.equal(integration.status, "integrated");
  const applied = await fixture.adapter.applyFastForward(fixture.project, snapshot, integration);
  assert.equal(applied, integration.commit);
  assert.equal(readFileSync(join(fixture.root, "docs", "parallel.md"), "utf8"), "docs task\n");
  assert.equal(readFileSync(join(fixture.root, "tests", "parallel.test.ts"), "utf8"), "export {};\n");
});

test("les changements hors scope et les symlinks sont refusés avant commit", async (context) => {
  const fixture = repositoryFixture(context);
  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-scope", includeScopes: ["docs"], declaredUntracked: [] });
  const docsTask = task("docs-task", "dev", "docs");
  const workspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-scope", docsTask);
  writeFileSync(join(workspace.path, "src", "escape.ts"), "escape\n", "utf8");
  await assert.rejects(fixture.adapter.commitTask(fixture.project, workspace, docsTask, { campaignId: "campaign-scope", agentId, profileId: "codex-dev", executionId: "execution-scope", proofReferences: ["proof/scope"] }), /exceeds its write scope/u);

  const symlink = join(fixture.root, "docs", "link.md");
  symlinkSync("guide.md", symlink);
  await assert.rejects(fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-link", includeScopes: ["docs"], declaredUntracked: ["docs/link.md"] }), /Unsafe declared file/u);
});

test("un secret est refusé avant le commit Norn", async (context) => {
  const fixture = repositoryFixture(context);
  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-secret", includeScopes: ["docs"], declaredUntracked: [] });
  const docsTask = task("docs-task", "dev", "docs");
  const workspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-secret", docsTask);
  writeFileSync(join(workspace.path, "docs", "leak.md"), "api_key=abcdefghijklmnop\n", "utf8");
  await assert.rejects(fixture.adapter.commitTask(fixture.project, workspace, docsTask, { campaignId: "campaign-secret", agentId, profileId: "codex", executionId: "execution-secret", proofReferences: ["proof/secret"] }), /credential-like content/u);
});

test("un cache GitNexus ignoré et un worktree tiers existant restent intacts", async (context) => {
  const fixture = repositoryFixture(context);
  const cache = join(fixture.root, ".gitnexus", "lbug");
  const foreign = join(fixture.home, ".arka-norn", "worktrees", "claude-existing", "marker.txt");
  mkdirSync(join(cache, ".."), { recursive: true });
  mkdirSync(join(foreign, ".."), { recursive: true });
  writeFileSync(cache, "", "utf8");
  truncateSync(cache, 70 * 1024 * 1024);
  writeFileSync(foreign, "preserve\n", "utf8");
  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-cache", includeScopes: ["."], declaredUntracked: [] });
  assert.equal(existsSync(foreign), true);
  assert.throws(() => git(fixture.root, ["show", `${snapshot.commit}:.gitnexus/lbug`]));
});

test("les hooks utilisateur sont neutralisés et les submodules sont refusés", async (context) => {
  const fixture = repositoryFixture(context);
  const hook = join(fixture.root, ".git", "hooks", "pre-commit");
  writeFileSync(hook, "#!/bin/sh\nexit 99\n", "utf8");
  chmodSync(hook, 0o755);
  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-hook", includeScopes: ["docs"], declaredUntracked: [] });
  const docsTask = task("docs-task", "dev", "docs");
  const workspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-hook", docsTask);
  writeFileSync(join(workspace.path, "docs", "hook.md"), "safe\n", "utf8");
  await fixture.adapter.commitTask(fixture.project, workspace, docsTask, { campaignId: "campaign-hook", agentId, profileId: "codex", executionId: "execution-hook", proofReferences: ["proof/hook"] });

  writeFileSync(join(fixture.root, ".gitmodules"), "[submodule \"evil\"]\npath = evil\nurl = https://example.test/evil.git\n", "utf8");
  git(fixture.root, ["add", ".gitmodules"]);
  git(fixture.root, ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "submodule metadata"]);
  await assert.rejects(fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-submodule", includeScopes: ["."], declaredUntracked: [] }), /submodules are forbidden/u);
});

test("un filtre Git externe bloque la préparation avant toute création de worktree", async (context) => {
  const fixture = repositoryFixture(context);
  git(fixture.root, ["config", "filter.evil.smudge", "/bin/false"]);
  await assert.rejects(fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-filter", includeScopes: ["docs"], declaredUntracked: [] }), /External Git filters/u);
});

test("un conflit passe par un worktree intégrateur ou produit un fallback prioritaire à gate humain", async (context) => {
  const fixture = repositoryFixture(context);
  const snapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-conflict", includeScopes: ["docs"], declaredUntracked: [] });
  const firstTask = task("first-task", "dev", "docs");
  const secondTask = task("second-task", "dev", "docs");
  const firstWorkspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-conflict", firstTask);
  const secondWorkspace = await fixture.adapter.createTaskWorkspace(fixture.project, snapshot, "campaign-conflict", secondTask);
  writeFileSync(join(firstWorkspace.path, "docs", "guide.md"), "priority\n", "utf8");
  writeFileSync(join(secondWorkspace.path, "docs", "guide.md"), "secondary\n", "utf8");
  const first = await fixture.adapter.commitTask(fixture.project, firstWorkspace, firstTask, { campaignId: "campaign-conflict", agentId, profileId: "codex", executionId: "execution-first", proofReferences: ["proof/first"] });
  const second = await fixture.adapter.commitTask(fixture.project, secondWorkspace, secondTask, { campaignId: "campaign-conflict", agentId, profileId: "claude", executionId: "execution-second", proofReferences: ["proof/second"] });
  const conflict = await fixture.adapter.integrate(fixture.project, snapshot, "campaign-conflict", [first, second]);
  assert.equal(conflict.status, "conflicted");
  writeFileSync(join(conflict.path, "docs", "guide.md"), "priority and secondary\n", "utf8");
  const resolved = await fixture.adapter.resolveIntegrationConflict(fixture.project, conflict, { agentId, profileId: "integrator", executionId: "execution-integration", proofReferences: ["proof/integration"] });
  assert.equal(resolved.status, "integrated");
  assert.match(git(resolved.path, ["show", "-s", "--format=%B", resolved.commit!]), /Norn-Role: integrator/u);

  const fallbackSnapshot = await fixture.adapter.createSnapshot(fixture.project, { campaignId: "campaign-fallback", includeScopes: ["docs"], declaredUntracked: [] });
  const highWorkspace = await fixture.adapter.createTaskWorkspace(fixture.project, fallbackSnapshot, "campaign-fallback", firstTask);
  const lowWorkspace = await fixture.adapter.createTaskWorkspace(fixture.project, fallbackSnapshot, "campaign-fallback", secondTask);
  writeFileSync(join(highWorkspace.path, "docs", "guide.md"), "high\n", "utf8");
  writeFileSync(join(lowWorkspace.path, "docs", "guide.md"), "low\n", "utf8");
  const high = await fixture.adapter.commitTask(fixture.project, highWorkspace, firstTask, { campaignId: "campaign-fallback", agentId, profileId: "codex", executionId: "execution-high", proofReferences: ["proof/high"] });
  const low = await fixture.adapter.commitTask(fixture.project, lowWorkspace, secondTask, { campaignId: "campaign-fallback", agentId, profileId: "claude", executionId: "execution-low", proofReferences: ["proof/low"] });
  const secondConflict = await fixture.adapter.integrate(fixture.project, fallbackSnapshot, "campaign-fallback", [high, low]);
  const fallback = await fixture.adapter.buildPriorityFallback(fixture.project, secondConflict);
  assert.equal(fallback.status, "integrated");
  assert.equal(fallback.requiresHumanApproval, true);
  assert.ok((fallback.discardedHunks?.length ?? 0) > 0);
  assert.equal(readFileSync(join(fallback.path, "docs", "guide.md"), "utf8"), "high\n");
});

function repositoryFixture(context: { after(callback: () => void): void }): { readonly root: string; readonly home: string; readonly project: Project; readonly adapter: GitWorktreeWorkspaceAdapter } {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-git-"));
  const root = join(sandbox, "project");
  const home = join(sandbox, "home");
  mkdirSync(join(root, "docs"), { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "docs", "guide.md"), "initial docs\n", "utf8");
  writeFileSync(join(root, "src", "main.ts"), "initial source\n", "utf8");
  writeFileSync(join(root, "tests", "base.test.ts"), "export {};\n", "utf8");
  writeFileSync(join(root, ".gitignore"), ".gitnexus/\n", "utf8");
  git(root, ["init"]);
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "initial"]);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const project = Project.create({ id: ProjectId.of("project"), name: "Project", root, schemaVersion: 4, orchestrationMode: "automatic", createdAt: at, updatedAt: at });
  return { root, home, project, adapter: new GitWorktreeWorkspaceAdapter(home) };
}

function task(id: string, role: string, scope: string): TaskPlan {
  return { id, agentId, role, requiredProfile: { transports: ["codex-cli"], capabilities: ["inspect_workspace"] }, priority: 10, dependencies: [], readScopes: [scope], writeScopes: [scope], deliverables: [id], validations: ["tests"] };
}

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { PATH: process.env["PATH"] ?? "/usr/bin:/bin", HOME: root, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", GIT_TERMINAL_PROMPT: "0" } });
}
