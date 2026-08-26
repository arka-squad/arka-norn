/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { runFramingCommand } from "../../src/adapters/inbound/cli/framing-cli.ts";

const FRAMEWORK_ROOT = resolve(import.meta.dirname, "..", "..");

test("l'adaptateur framing couvre entrée, vues, reprise, liste et mutation privée", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-framing-cli-adapter-"));
  const homeDir = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const cliContext = { homeDir, cwd: projectRoot, frameworkRoot: FRAMEWORK_ROOT };

  const entered = await runFramingCommand(["enter", projectRoot, "--json"], cliContext);
  assert.equal(entered.code, 0, entered.stderr);
  const entry = envelope(entered.stdout);
  const projectId = record(entry.data.project).id as string;
  const framingProjection = record(entry.data.framing);
  const target = record(framingProjection.target);
  const framingId = target.framingId as string;
  const planId = framingProjection.planId as string;

  const listed = await runFramingCommand(["list", "--project", projectId], cliContext);
  assert.equal(listed.code, 0, listed.stderr);
  assert.match(listed.stdout, new RegExp(framingId, "u"));

  for (const view of ["summary", "plan", "evidence", "map"] as const) {
    const shown = await runFramingCommand(["show", framingId, "--project", projectId, "--view", view], cliContext);
    assert.equal(shown.code, 0, shown.stderr);
    assert.match(shown.stdout, /r[ée]vision 1/ui);
  }

  const resumed = await runFramingCommand(["resume", framingId, "--project", projectId], cliContext);
  assert.equal(resumed.code, 0, resumed.stderr);
  assert.match(resumed.stdout, /(?:Suite|Action)\s*:/u);

  const deltaPath = resolve(sandbox, "delta.json");
  writeFileSync(deltaPath, JSON.stringify({
    schemaVersion: 1,
    planId,
    baseRevision: 1,
    reason: "Vérifier le broker CLI.",
    operations: [{
      op: "upsert_knowledge",
      section: "intent.problem",
      value: {
        id: "problem-1",
        statement: "Le cadrage doit rester reprenable sans la session d'origine.",
        provenance: { kind: "human_decision", reference: "test" },
      },
    }],
  }), "utf8");
  const applied = await runFramingCommand([
    "_broker", "apply", framingId, "--project", projectId, "--delta", deltaPath, "--json",
  ], cliContext);
  assert.equal(applied.code, 0, `${applied.stderr}${applied.stdout}`);
  assert.equal(record(envelope(applied.stdout).data).revision, 2);

  const inferredProject = await runFramingCommand(["show", framingId, "--json"], cliContext);
  assert.equal(inferredProject.code, 0, inferredProject.stderr);
  assert.equal(record(envelope(inferredProject.stdout).data).revision, 2);
});

test("l'adaptateur framing transforme les usages invalides en erreurs stables", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-framing-cli-errors-"));
  const homeDir = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const cliContext = { homeDir, cwd: projectRoot, frameworkRoot: FRAMEWORK_ROOT };

  const missing = await runFramingCommand([], cliContext);
  assert.equal(missing.code, 64);
  assert.match(missing.stderr, /missing framing action/u);

  const unknown = await runFramingCommand(["unknown", "--json"], cliContext);
  assert.equal(unknown.code, 64);
  assert.match(unknown.stdout, /invalid_arguments/u);

  const exclusive = await runFramingCommand(["enter", projectRoot, "--feature", "one", "--new-feature", "two"], cliContext);
  assert.equal(exclusive.code, 64);

  const entered = await runFramingCommand(["enter", projectRoot, "--json"], cliContext);
  const entry = envelope(entered.stdout);
  const projectId = record(entry.data.project).id as string;
  const framingId = record(record(entry.data.framing).target).framingId as string;

  const badView = await runFramingCommand(["show", framingId, "--project", projectId, "--view", "raw"], cliContext);
  assert.equal(badView.code, 64);
  assert.match(badView.stderr, /--view/u);

  const missingDelta = await runFramingCommand(["_broker", "apply", framingId, "--project", projectId], cliContext);
  assert.equal(missingDelta.code, 64);
  assert.match(missingDelta.stderr, /--delta is required/u);
});

function envelope(raw: string): { readonly data: Record<string, unknown>; readonly errorCode?: string } {
  return JSON.parse(raw) as { readonly data: Record<string, unknown>; readonly errorCode?: string };
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}
