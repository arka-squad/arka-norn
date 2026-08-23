/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { AuditService } from "../../src/application/audit/audit-service.js";
import { LocalAuditCollector } from "../../src/adapters/outbound/audit/local-audit-collector.js";
import { FsAuditStore } from "../../src/adapters/outbound/filesystem/fs-audit-store.js";
import type { AuditToolInvocation, AuditToolRunner } from "../../src/ports/outbound/audit-tool-runner.js";

test("cycle local inspect, prepare, start, finalize, KB et export sans Pipeline", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "arka-norn-audit-service-"));
  const exported = mkdtempSync(join(tmpdir(), "arka-norn-audit-export-"));
  context.after(() => { rmSync(root, { recursive: true, force: true }); rmSync(exported, { recursive: true, force: true }); });
  writeFileSync(join(root, "README.md"), "# Produit\n\nUne interface utile.\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "audit-fixture", scripts: { test: "node --test" }, repository: "https://github.com/example/audit-fixture" }));
  writeFileSync(join(root, "index.ts"), "export const value = 1;\n");
  writeFileSync(join(root, "index.test.ts"), "// test fixture\n");
  writeFileSync(join(root, "index.html"), "<!doctype html><title>Fixture</title>\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Audit Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "audit@example.invalid"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });

  const store = new FsAuditStore(root);
  const service = new AuditService(store, new LocalAuditCollector(), () => new Date("2026-08-23T12:00:00.000Z"));
  const project = { projectId: "audit-fixture", projectName: "Audit Fixture", projectRoot: root, featureId: null };
  const inspection = await service.inspect(project, ["."]);
  assert.equal(inspection.commitExact?.length, 40);
  assert.equal(inspection.signals.find((signal) => signal.id === "source")?.detected, true);
  assert.equal(existsSync(join(root, ".arka-norn", "audits")), false, "inspect must not create the audit store");

  const run = await service.prepare(project, {
    objective: "Découvrir code, architecture et produit",
    mode: "discovery",
    paths: ["."],
    modules: [
      { moduleId: "M02", intent: "discover", depth: "inventory", criteria: [] },
      { moduleId: "M03", intent: "discover", depth: "inventory", criteria: [] },
      { moduleId: "M09", intent: "discover", depth: "inventory", criteria: [] },
    ],
    sources: { paths: [], urls: [] },
    capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
  });
  assert.equal(run.status, "planned");
  assert.deepEqual(run.selectedModules, ["M00", "M02", "M03", "M09"]);
  assert.equal(run.plan.requiresAdditionalConfirmation, false);
  assert.match(readFileSync(join(root, ".arka-norn", "audits", ".gitignore"), "utf8"), /^\*/);

  const collecting = await service.start(project, run.id, run.fingerprint);
  assert.equal(collecting.status, "analyzing");
  const finalized = await service.finalize(run.id);
  assert.equal(finalized.run.status, "completed");
  assert.ok(existsSync(finalized.reportPath));
  assert.match(readFileSync(finalized.reportPath, "utf8"), /Repository and product map/);
  assert.ok((await store.searchKb({ type: "evidence" })).length > 0);

  const files = await store.exportAudit(run.id, exported, false);
  assert.equal(files.length, 2);
  assert.ok(existsSync(join(exported, "report.md")));
  assert.ok(existsSync(join(exported, "audit.json")));
  assert.equal(existsSync(join(exported, "evidence")), false);

  const rerun = await service.prepare(project, {
    objective: "Découvrir code, architecture et produit une seconde fois",
    mode: "discovery",
    paths: ["."],
    modules: [
      { moduleId: "M02", intent: "discover", depth: "inventory", criteria: [] },
      { moduleId: "M03", intent: "discover", depth: "inventory", criteria: [] },
      { moduleId: "M09", intent: "discover", depth: "inventory", criteria: [] },
    ],
    sources: { paths: [], urls: [] },
    capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
  });
  await service.start(project, rerun.id, rerun.fingerprint);
  const reused = await store.loadModuleResult(rerun.id, "M02");
  assert.match(reused?.strengths.join(" ") ?? "", /reused from/);
  await service.finalize(rerun.id);
  const comparison = await service.compare(rerun.id, run.id);
  assert.equal(comparison.coverageChanged, false);
});

test("une reprise refuse un workspace modifié après la confirmation", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "arka-norn-audit-resume-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "README.md"), "# Initial\n");
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Audit Test"], { cwd: root });
  execFileSync("git", ["config", "user.email", "audit@example.invalid"], { cwd: root });
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "fixture"], { cwd: root });
  const service = new AuditService(new FsAuditStore(root), new LocalAuditCollector(), () => new Date("2026-08-23T12:00:00.000Z"));
  const project = { projectId: "resume", projectName: "Resume", projectRoot: root, featureId: null };
  const run = await service.prepare(project, {
    objective: "Découvrir le dépôt",
    mode: "discovery",
    paths: ["."],
    modules: [{ moduleId: "M01", intent: "discover", depth: "inventory", criteria: [] }],
    sources: { paths: [], urls: [] },
    capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
  });
  writeFileSync(join(root, "README.md"), "# Modifié\n");
  await assert.rejects(service.start(project, run.id, run.fingerprint), /workspace changed/);
});

test("un module dynamic utilise le runner sandboxé injecté sans fallback hôte", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "arka-norn-audit-sandbox-"));
  context.after(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "sandbox-fixture", scripts: { test: "node --test" } }));
  writeFileSync(join(root, "index.ts"), "export {};\n");
  writeFileSync(join(root, "index.test.ts"), "// fixture\n");
  const invocations: AuditToolInvocation[] = [];
  const runner: AuditToolRunner = {
    runtime: "docker",
    doctor: async () => [{ id: "node", image: "node@sha256:fake", installed: true, sizeBytes: 42 }],
    run: async (invocation) => {
      invocations.push(invocation);
      return { status: "pass", exitCode: 0, stdout: "sk-this-must-never-be-persisted", stderr: "", truncated: false };
    },
  };
  const collector = new LocalAuditCollector(() => runner);
  const inspection = await collector.inspect({ projectId: "sandbox", projectName: "Sandbox", projectRoot: root, featureId: null, paths: ["."] });
  const result = await collector.collect("M02", {
    auditId: "audit-20260823t120000z-1234abcd",
    projectId: "sandbox",
    projectName: "Sandbox",
    projectRoot: root,
    featureId: null,
    request: {
      objective: "Tester dynamicment",
      mode: "discovery",
      paths: ["."],
      modules: [{ moduleId: "M02", intent: "discover", depth: "dynamic", criteria: [] }],
      sources: { paths: [], urls: [] },
      capabilities: { allowImagePulls: true, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
    },
    inspection: { ...inspection, sandbox: { runtime: "docker", available: true } },
    now: new Date("2026-08-23T12:00:00.000Z"),
  });
  assert.equal(invocations.length, 1);
  assert.equal(invocations[0]?.toolId, "node");
  assert.equal(invocations[0]?.writableWorkspace, true);
  assert.equal(invocations[0]?.allowNetwork, false);
  assert.ok(result.coverage.completed.includes("tool:node"));
  assert.doesNotMatch(JSON.stringify(result), /this-must-never-be-persisted/);
});
