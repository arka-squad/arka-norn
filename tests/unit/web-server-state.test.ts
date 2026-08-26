/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FsWebServerStateStore, type WebServerState } from "../../src/adapters/outbound/filesystem/fs-web-server-state-store.ts";

test("Web server state is private, validated and removed only by its owner", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-web-state-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new FsWebServerStateStore(home);
  const state: WebServerState = {
    schemaVersion: 1,
    pid: 1234,
    port: 4317,
    url: `http://127.0.0.1:4317/#token=${"a".repeat(43)}`,
    startedAt: "2026-08-24T00:00:00.000Z",
    cwd: home,
  };

  await store.save(state);
  assert.deepEqual(await store.load(), state);
  if (process.platform !== "win32") assert.equal(statSync(store.path()).mode & 0o777, 0o600);
  await store.remove(9999);
  assert.deepEqual(await store.load(), state);
  await store.remove(1234);
  assert.equal(await store.load(), undefined);

  writeFileSync(store.path(), `${JSON.stringify({ ...state, url: "http://example.test" })}\n`, { mode: 0o600 });
  await assert.rejects(store.load(), /Invalid Norn Web server state/);
  assert.match(readFileSync(store.path(), "utf8"), /example\.test/);
});
