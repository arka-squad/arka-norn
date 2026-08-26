/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("framing entre dans un dossier vide et reprend depuis le plan sans Feature ni session", (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-framing-cli-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const entered = run(["framing", "enter", projectRoot, "--json"], home, projectRoot);
  assert.equal(entered.status, 0, entered.stderr);
  const entry = envelope(entered.stdout);
  assert.equal(entry.data.resumed, false);
  const framing = record(entry.data.framing);
  assert.equal(record(framing.repository).nature, "empty");
  assert.equal(record(framing.nextAction).attention, "agent");
  assert.equal(record(entry.data.project).orchestrationMode, "manual");
  assert.equal(record(entry.data.project).lifecycle, "draft");
  assert.equal(existsSync(resolve(projectRoot, "features")), false);
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn")), false);
  const projectId = String(record(entry.data.project).id);
  assert.equal(existsSync(resolve(home, ".arka-norn", "framing-projects", projectId, "draft.json")), true);

  const resumed = run(["framing", "resume", "project", "--project", projectId, "--json"], home, projectRoot);
  assert.equal(resumed.status, 0, resumed.stderr);
  const packet = envelope(resumed.stdout).data;
  assert.equal(packet.revision, 1);
  assert.equal(packet.expiresOnRevisionChange, true);
  assert.match(String(packet.summary), /Suite\s*:/u);

  const human = run(["framing", "show", "project", "--project", projectId, "--view", "plan"], home, projectRoot);
  assert.equal(human.status, 0, human.stderr);
  assert.match(human.stdout, /révision 1/u);
  assert.doesNotMatch(human.stdout, /\{"schemaVersion"/u);

  const feature = run(["framing", "enter", projectRoot, "--new-feature", "Retrouver le travail", "--json"], home, projectRoot);
  assert.equal(feature.status, 0, feature.stderr);
  assert.equal(record(record(envelope(feature.stdout).data.framing).target).kind, "feature");
  assert.equal(existsSync(resolve(projectRoot, "features")), false);
});

function run(args: readonly string[], home: string, cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HOME: home, ARKA_NORN_HOME: home, ARKA_NORN_LOCALE: "fr" },
  });
}

function envelope(raw: string): { readonly data: Record<string, unknown> } {
  return JSON.parse(raw) as { readonly data: Record<string, unknown> };
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, "object");
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}
