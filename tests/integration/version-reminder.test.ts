/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { versionReminderLine } from "../../src/adapters/inbound/cli/version-reminder.ts";
import { FsVersionCacheStore } from "../../src/adapters/outbound/filesystem/fs-version-cache-store.ts";
import { FsVersionSkipStore } from "../../src/adapters/outbound/filesystem/fs-version-skip-store.ts";
import { PRODUCT_VERSION } from "../../src/application/product-metadata.ts";

function bump(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major}.${minor}.${(patch ?? 0) + 1}`;
}

test("le rappel n'affiche rien sans cache et planifie un rafraîchissement", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-reminder-empty-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const line = await versionReminderLine({ homeDir: home, latestVersion: async () => bump(PRODUCT_VERSION), nowMs: 1_000_000_000_000, uptimeSeconds: 3_600, background: false });
  assert.equal(line, undefined);
});

test("le rappel utilise le cache pour signaler une mise à jour sans appel réseau", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-reminder-cache-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const newer = bump(PRODUCT_VERSION);
  await new FsVersionCacheStore(home).save({ latest: newer, checkedAt: new Date(1_000_000_000_000).toISOString() });
  let called = false;
  const line = await versionReminderLine({ homeDir: home, latestVersion: async () => { called = true; return newer; }, nowMs: 1_000_000_000_000, uptimeSeconds: 3_600, background: false });
  assert.ok(line !== undefined && line.includes(newer));
  assert.equal(called, false, "a fresh cache needs no network refresh");
});

test("le rappel respecte un skip actif", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-reminder-skip-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const newer = bump(PRODUCT_VERSION);
  await new FsVersionCacheStore(home).save({ latest: newer, checkedAt: new Date(1_000_000_000_000).toISOString() });
  await new FsVersionSkipStore(home).save({ kind: "version", version: newer });
  const line = await versionReminderLine({ homeDir: home, latestVersion: async () => newer, nowMs: 1_000_000_000_000, uptimeSeconds: 3_600, background: false });
  assert.equal(line, undefined);
});

test("le rappel ignore un cache à jour", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-reminder-current-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  await new FsVersionCacheStore(home).save({ latest: PRODUCT_VERSION, checkedAt: new Date(1_000_000_000_000).toISOString() });
  const line = await versionReminderLine({ homeDir: home, latestVersion: async () => PRODUCT_VERSION, nowMs: 1_000_000_000_000, uptimeSeconds: 3_600, background: false });
  assert.equal(line, undefined);
});

