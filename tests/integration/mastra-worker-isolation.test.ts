/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { createMastraExecutionPort } from "../../src/adapters/outbound/execution/mastra-agent-execution-adapter.ts";
import type { AgentExecutionOutcome, AgentExecutionPort } from "../../src/ports/outbound/agent-execution-port.ts";

test("le worker Node reçoit un environnement isolé sans secret hérité", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-mastra-integration-"));
  const workspace = join(sandbox, "workspace");
  const worker = join(sandbox, "fake-worker.mjs");
  mkdirSync(workspace);
  writeFileSync(worker, [
    "let raw = '';",
    "for await (const chunk of process.stdin) raw += String(chunk);",
    "const request = JSON.parse(raw);",
    "const output = JSON.stringify({",
    "  secret: process.env.ARKA_NORN_TEST_SECRET ?? null,",
    "  home: process.env.HOME,",
    "  path: process.env.PATH,",
    "  policy: request.permissionPolicy,",
    "});",
    "process.stdout.write(JSON.stringify({ type: 'result', status: 'completed', output }) + '\\n');",
  ].join("\n"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const previousSecret = process.env["ARKA_NORN_TEST_SECRET"];
  process.env["ARKA_NORN_TEST_SECRET"] = "never-forward-this";
  try {
    const port = createMastraExecutionPort({ workerScripts: { "codex-acp": worker } });
    await port.dispatch({
      provider: "codex-acp",
      executionId: "isolated-worker",
      mission: "Return the worker process metadata.",
      workspace,
      command: process.execPath,
      args: ["--version"],
      permissionPolicy: {
        mode: "preauthorized-workspace",
        scopePaths: ["."],
        permissions: ["read_workspace"],
      },
    });
    const outcome = await waitForTerminalOutcome(port, "isolated-worker");
    assert.equal(outcome.status, "completed");
    const payload = JSON.parse(outcome.output ?? "") as {
      readonly secret: string | null;
      readonly home: string;
      readonly path: string;
      readonly policy: unknown;
    };
    assert.equal(payload.secret, null);
    assert.notEqual(payload.home, process.env["HOME"]);
    assert.equal(payload.path, dirname(process.execPath));
    assert.deepEqual(payload.policy, {
      mode: "preauthorized-workspace",
      scopePaths: ["."],
      permissions: ["read_workspace"],
    });
  } finally {
    if (previousSecret === undefined) delete process.env["ARKA_NORN_TEST_SECRET"];
    else process.env["ARKA_NORN_TEST_SECRET"] = previousSecret;
  }
});

test("le cancel force la fermeture du worker isolé", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-mastra-cancel-"));
  const workspace = join(sandbox, "workspace");
  const worker = join(sandbox, "waiting-worker.mjs");
  mkdirSync(workspace);
  writeFileSync(worker, [
    "process.stdin.resume();",
    "process.on('SIGTERM', () => process.exit(0));",
    "setInterval(() => undefined, 1_000);",
  ].join("\n"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const port = createMastraExecutionPort({ workerScripts: { claude: worker } });

  await port.dispatch({
    provider: "claude",
    executionId: "cancel-worker",
    mission: "Wait.",
    workspace,
  });
  const outcome = await port.cancel({ executionId: "cancel-worker" });
  assert.equal(outcome.status, "cancelled");
  assert.equal(outcome.failure?.code, "CANCELLED");
});

test("l’annulation POSIX termine aussi un descendant du worker provider", { skip: process.platform === "win32" }, async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-mastra-tree-cancel-"));
  const workspace = join(sandbox, "workspace");
  const worker = join(sandbox, "forking-worker.mjs");
  const descendantMarker = join(sandbox, "descendant.pid");
  mkdirSync(workspace);
  writeFileSync(worker, [
    "import { spawn } from 'node:child_process';",
    "import { writeFileSync } from 'node:fs';",
    "let raw = '';",
    "for await (const chunk of process.stdin) raw += String(chunk);",
    "const request = JSON.parse(raw);",
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => undefined, 1000);'], { stdio: 'ignore' });",
    "writeFileSync(request.mission, String(child.pid));",
    "setInterval(() => undefined, 1000);",
  ].join("\n"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const port = createMastraExecutionPort({ workerScripts: { claude: worker } });
  await port.dispatch({
    provider: "claude",
    executionId: "cancel-worker-tree",
    mission: descendantMarker,
    workspace,
  });
  const descendantPid = await waitForPid(descendantMarker);
  context.after(() => {
    try {
      process.kill(descendantPid, "SIGKILL");
    } catch {
      // The expected path has already terminated the child tree.
    }
  });

  const outcome = await port.cancel({ executionId: "cancel-worker-tree" });
  assert.equal(outcome.status, "cancelled");
  await waitForProcessExit(descendantPid);
});

async function waitForTerminalOutcome(port: AgentExecutionPort, executionId: string): Promise<AgentExecutionOutcome> {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const outcome = await port.inspect({ executionId });
    if (outcome !== undefined && outcome.status !== "running") return outcome;
    await new Promise<void>((resolveDelay): void => {
      setTimeout(resolveDelay, 10);
    });
  }
  throw new Error("Worker execution did not settle.");
}

async function waitForPid(path: string): Promise<number> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (existsSync(path)) {
      const pid = Number.parseInt(readFileSync(path, "utf8"), 10);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    await pause(10);
  }
  throw new Error("Provider descendant PID was not recorded.");
}

async function waitForProcessExit(pid: number): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (!isProcessAlive(pid)) return;
    await pause(10);
  }
  throw new Error("Provider descendant survived worker cancellation.");
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pause(milliseconds: number): Promise<void> {
  return new Promise<void>((resolveDelay): void => {
    setTimeout(resolveDelay, milliseconds);
  });
}
