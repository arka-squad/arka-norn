/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("la CLI audit exécute une découverte hors Pipeline avec enveloppes JSON stables", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-audit-cli-"));
  const home = join(sandbox, "home");
  const projectRoot = join(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(join(projectRoot, "README.md"), "# Produit audité\n");
  writeFileSync(join(projectRoot, "index.html"), "<!doctype html><title>Produit audité</title>\n");
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const added = run(["project", "add", projectRoot, "--id", "product", "--name", "Product", "--orchestration-mode", "manual", "--json"], home, sandbox);
  assert.equal(added.status, 0, `${added.stdout}\n${added.stderr}`);
  const inspection = run(["audit", "inspect", "--project", "product", "--json"], home, sandbox);
  assert.equal(inspection.status, 0, inspection.stderr);
  assert.equal(inspection.json.command, "audit.inspect");
  assert.equal(inspection.json.ok, true);
  assert.equal(Array.isArray((inspection.json.data as { recommendations: unknown[] }).recommendations), true);

  const requestPath = join(sandbox, "request.json");
  writeFileSync(requestPath, JSON.stringify({
    objective: "Découvrir le produit",
    mode: "decouverte",
    paths: ["."],
    modules: [{ moduleId: "M09", intent: "discover", depth: "inventaire", criteria: [] }],
    sources: { paths: [], urls: [] },
    capabilities: { allowImagePulls: false, allowedHosts: [], credentialRefs: [], dynamicTargets: [] },
  }));
  const prepared = run(["audit", "prepare", "--project", "product", "--request", requestPath, "--json"], home, sandbox);
  assert.equal(prepared.status, 0, prepared.stderr);
  const plan = prepared.json.data as { id: string; fingerprint: string; plan: { requiresAdditionalConfirmation: boolean } };
  assert.equal(plan.plan.requiresAdditionalConfirmation, false);

  const started = run(["audit", "start", plan.id, "--project", "product", "--confirm", plan.fingerprint, "--json"], home, sandbox);
  assert.equal(started.status, 0, started.stderr);
  assert.equal((started.json.data as { status: string }).status, "analyzing");
  const finalized = run(["audit", "finalize", plan.id, "--project", "product", "--json"], home, sandbox);
  assert.equal(finalized.status, 0, finalized.stderr);
  assert.equal((finalized.json.data as { run: { status: string } }).run.status, "completed");
  const report = readFileSync(join(projectRoot, ".arka-norn", "audits", plan.id, "report.md"), "utf8");
  assert.match(report, /Demande utilisateur/);

  const invalid = run(["audit", "start", plan.id, "--project", "product", "--confirm", "bad", "--json"], home, sandbox);
  assert.equal(invalid.status, 3);
  assert.equal(invalid.json.ok, false);
});

function run(args: readonly string[], home: string, cwd: string): { readonly status: number | null; readonly stdout: string; readonly stderr: string; readonly json: { readonly command: string; readonly ok: boolean; readonly data: unknown } } {
  const result = spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env: { ...process.env, ARKA_NORN_HOME: home, HOME: home, USERPROFILE: home } });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr, json: result.stdout.trim() === "" ? { command: "", ok: false, data: null } : JSON.parse(result.stdout) as { command: string; ok: boolean; data: unknown } };
}
