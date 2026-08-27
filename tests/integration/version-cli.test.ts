/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { runVersionCommand } from "../../src/adapters/inbound/cli/version-cli.ts";
import { FsVersionSkipStore } from "../../src/adapters/outbound/filesystem/fs-version-skip-store.ts";

function ctx(home: string, latest: string | undefined) {
  return { homeDir: home, latestVersion: async () => latest, nowMs: 1_000_000_000_000, uptimeSeconds: 3_600 };
}

function data(stdout: string) {
  return (JSON.parse(stdout) as { readonly data: { readonly status: string; readonly latest?: string } }).data;
}

test("version --json signale une mise à jour, la reporte au reboot, puis l'ignore par version", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-version-cli-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));

  const available = await runVersionCommand(["--json"], ctx(home, "2.4.0"));
  assert.equal(available.code, 0);
  assert.equal(data(available.stdout).status, "update_available");

  const skipReboot = await runVersionCommand(["--json", "--skip-reboot"], ctx(home, "2.4.0"));
  assert.equal(skipReboot.code, 0);
  const storedReboot = await new FsVersionSkipStore(home).load();
  assert.equal(storedReboot?.kind, "reboot");
  assert.equal(storedReboot?.version, "2.4.0");

  const afterReboot = await runVersionCommand(["--json"], ctx(home, "2.4.0"));
  assert.equal(data(afterReboot.stdout).status, "skipped_reboot");

  const rebooted = await runVersionCommand(["--json"], { homeDir: home, latestVersion: async () => "2.4.0", nowMs: 1_000_000_000_000, uptimeSeconds: 10 });
  assert.equal(data(rebooted.stdout).status, "update_available", "a new boot resurfaces the update");

  const skipVersion = await runVersionCommand(["--json", "--skip-version"], ctx(home, "2.4.0"));
  assert.equal(skipVersion.code, 0);
  const storedVersion = await new FsVersionSkipStore(home).load();
  assert.equal(storedVersion?.kind, "version");

  const afterSkipVersion = await runVersionCommand(["--json"], ctx(home, "2.4.0"));
  assert.equal(data(afterSkipVersion.stdout).status, "skipped_version");

  const newerRelease = await runVersionCommand(["--json"], ctx(home, "2.5.0"));
  assert.equal(data(newerRelease.stdout).status, "update_available", "a newer release overrides a version skip");

  const cleared = await runVersionCommand(["--json", "--clear-skip"], ctx(home, "2.5.0"));
  assert.equal(cleared.code, 0);
  assert.equal(await new FsVersionSkipStore(home).load(), undefined);
});

test("version reste silencieux et non bloquant quand le registre est injoignable", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-version-offline-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const result = await runVersionCommand(["--json"], ctx(home, undefined));
  assert.equal(result.code, 0);
  assert.equal(data(result.stdout).status, "unknown");
});

test("version rejette des options mutuellement exclusives", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "norn-version-args-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const result = await runVersionCommand(["--skip-reboot", "--skip-version"], ctx(home, "2.4.0"));
  assert.equal(result.code, 64);
});

