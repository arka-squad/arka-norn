/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

interface WebStatus {
  readonly status: "running" | "stopped" | "unresponsive";
  readonly pid?: number;
  readonly port?: number;
  readonly url?: string;
  readonly logPath: string;
}

test("web start, status, restart and stop manage one verified background server", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-web-cli-"));
  context.after(() => {
    run(["web", "stop", "--json"], home);
    rmSync(home, { recursive: true, force: true });
  });

  const started = data(run(["web", "start", "--no-open", "--json"], home));
  assert.equal(started.status, "running");
  assert.ok(started.pid !== undefined && started.pid > 0);
  assert.ok(started.port !== undefined && started.port > 0);
  assert.ok(started.url?.startsWith(`http://127.0.0.1:${String(started.port)}/#token=`));
  await assertHealthy(started.url!);

  const inspected = data(run(["web", "status", "--json"], home));
  assert.deepEqual(inspected, started);

  const restarted = data(run(["web", "restart", "--no-open", "--json"], home));
  assert.equal(restarted.status, "running");
  assert.equal(restarted.port, started.port);
  assert.notEqual(restarted.pid, started.pid);
  assert.equal(restarted.url, started.url);
  await assertHealthy(restarted.url!);

  const stopped = data(run(["web", "stop", "--json"], home));
  assert.equal(stopped.status, "stopped");
  assert.equal(data(run(["web", "status", "--json"], home)).status, "stopped");
  const startedAgain = data(run(["web", "start", "--no-open", "--json"], home));
  assert.notEqual(startedAgain.url, restarted.url);
  assert.equal(data(run(["web", "stop", "--json"], home)).status, "stopped");
});

async function assertHealthy(url: string): Promise<void> {
  const session = new URL(url);
  const token = session.hash.slice("#token=".length);
  session.hash = "";
  const response = await fetch(`${session.origin}/api/v1/health`, {
    headers: { Authorization: `Bearer ${token}`, Origin: session.origin },
  });
  assert.equal(response.status, 200);
  const body = await response.json() as { readonly schemaVersion: number; readonly ok: boolean; readonly data: { readonly status: string } };
  assert.deepEqual(body.data, { status: "ready" });
  assert.equal(body.schemaVersion, 2);
  assert.equal(body.ok, true);
}

function run(args: readonly string[], home: string) {
  const result = spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ARKA_NORN_HOME: home, LANG: "en_US.UTF-8" },
  });
  const logPath = join(home, ".arka-norn", "web", "server.log");
  const serverLog = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}\n${serverLog}`);
  return result;
}

function data(result: ReturnType<typeof run>): WebStatus {
  const envelope = JSON.parse(result.stdout) as { readonly schemaVersion: number; readonly ok: boolean; readonly data: WebStatus };
  assert.equal(envelope.schemaVersion, 2);
  assert.equal(envelope.ok, true);
  return envelope.data;
}
