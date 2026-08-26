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

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import type { AgentExecutionFrameworkContext, AgentExecutionPermissionPolicy, AgentExecutionProvider } from "../../../ports/outbound/agent-execution-port.js";

const MAX_WORKER_STDOUT_BYTES = 1024 * 1024;
const FORCE_KILL_DELAY_MS = 2_000;

export interface MastraWorkerPayload {
  readonly type: "run";
  readonly executionId: string;
  readonly provider: AgentExecutionProvider;
  readonly mission: string;
  readonly workspace: string;
  readonly permissionPolicy: AgentExecutionPermissionPolicy;
  readonly frameworkContext?: AgentExecutionFrameworkContext;
  readonly command?: string;
  readonly args?: readonly string[];
  readonly authMethodId?: string;
  readonly model?: string;
}

export interface MastraWorkerFailure {
  readonly code: string;
  readonly message?: string;
  readonly exitCode?: number;
  readonly stderrExcerpt?: string;
}

export interface MastraWorkerResult {
  readonly status: "completed" | "awaiting_approval" | "failed" | "cancelled" | "interrupted";
  readonly output?: string;
  readonly receipts?: readonly string[];
  readonly sessionId?: string;
  readonly failure?: MastraWorkerFailure;
}

export interface MastraWorkerLaunch {
  readonly payload: MastraWorkerPayload;
  readonly environment: NodeJS.ProcessEnv;
  readonly timeoutMs: number;
}

export interface MastraWorkerHandle {
  readonly result: Promise<MastraWorkerResult>;
  cancel(): Promise<void>;
}

export interface MastraWorkerRunner {
  launch(input: MastraWorkerLaunch): MastraWorkerHandle;
}

export type MastraWorkerScripts = Readonly<Record<AgentExecutionProvider, string>>;

export class NodeMastraWorkerRunner implements MastraWorkerRunner {
  private readonly scripts: MastraWorkerScripts;

  public constructor(scripts: MastraWorkerScripts) {
    this.scripts = scripts;
  }

  public launch(input: MastraWorkerLaunch): MastraWorkerHandle {
    const child = spawn(process.execPath, [this.scripts[input.payload.provider]], {
      cwd: input.payload.workspace,
      env: input.environment,
      stdio: ["pipe", "pipe", "pipe"],
      // On POSIX this gives the worker its own process group, allowing cancel
      // to terminate a provider descendant as well as the direct Node worker.
      // Windows keeps the direct-child fallback because Node has no equivalent
      // process-group signal primitive there.
      detached: process.platform !== "win32",
      windowsHide: true,
    });
    return createWorkerHandle(child, input);
  }
}

function createWorkerHandle(child: ChildProcessWithoutNullStreams, input: MastraWorkerLaunch): MastraWorkerHandle {
  let cancellationRequested = false;
  let timeoutReached = false;
  let stdout = "";
  let stdoutExceeded = false;
  let settled = false;
  let forceKillTimer: NodeJS.Timeout | undefined;
  const timeoutTimer = setTimeout((): void => {
    timeoutReached = true;
    if (forceKillTimer === undefined) forceKillTimer = terminateChild(child);
  }, input.timeoutMs);
  timeoutTimer.unref();

  const result = new Promise<MastraWorkerResult>((resolve): void => {
    const settle = (value: MastraWorkerResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      if (forceKillTimer !== undefined) clearTimeout(forceKillTimer);
      resolve(value);
    };
    child.stdout.on("data", (chunk: Buffer): void => {
      if (stdoutExceeded) return;
      stdout += chunk.toString("utf8");
      if (Buffer.byteLength(stdout, "utf8") > MAX_WORKER_STDOUT_BYTES) {
        stdoutExceeded = true;
        if (forceKillTimer === undefined) forceKillTimer = terminateChild(child);
      }
    });
    // Drain stderr to prevent a noisy harness from blocking; never surface it.
    child.stderr.on("data", (): void => undefined);
    child.on("error", (): void => {
      settle({
        status: cancellationRequested ? "cancelled" : "interrupted",
        failure: { code: cancellationRequested ? "CANCELLED" : "WORKER_START_FAILED" },
      });
    });
    child.on("close", (): void => {
      if (stdoutExceeded) {
        settle({ status: "failed", failure: { code: "WORKER_OUTPUT_LIMIT" } });
        return;
      }
      const wireResult = parseWorkerResult(stdout);
      if (wireResult !== undefined) {
        settle(wireResult);
        return;
      }
      if (cancellationRequested) {
        settle({ status: "cancelled", failure: { code: "CANCELLED" } });
        return;
      }
      if (timeoutReached) {
        settle({ status: "interrupted", failure: { code: "TIMEOUT" } });
        return;
      }
      settle({ status: "interrupted", failure: { code: "WORKER_EXITED" } });
    });
  });

  try {
    child.stdin.end(JSON.stringify(input.payload) + "\n");
  } catch {
    if (forceKillTimer === undefined) forceKillTimer = terminateChild(child);
  }

  return {
    result,
    cancel(): Promise<void> {
      cancellationRequested = true;
      if (!settled) {
        if (forceKillTimer === undefined) forceKillTimer = terminateChild(child);
      }
      return Promise.resolve();
    },
  };
}

function terminateChild(child: ChildProcessWithoutNullStreams): NodeJS.Timeout {
  if (child.exitCode === null) {
    signalWorkerTree(child, "SIGTERM");
  }
  const forceTimer = setTimeout((): void => {
    if (child.exitCode === null) {
      signalWorkerTree(child, "SIGKILL");
    }
  }, FORCE_KILL_DELAY_MS);
  forceTimer.unref();
  return forceTimer;
}

function signalWorkerTree(child: ChildProcessWithoutNullStreams, signal: NodeJS.Signals): void {
  if (process.platform !== "win32" && child.pid !== undefined) {
    try {
      process.kill(-child.pid, signal);
      return;
    } catch {
      // A process can close between the status check and its group signal. The
      // direct-child fallback below makes that race safe without trusting a
      // persisted PID.
    }
  }
  try {
    child.kill(signal);
  } catch {
    // The close/error handlers turn an already-gone child into a safe outcome.
  }
}

function parseWorkerResult(stdout: string): MastraWorkerResult | undefined {
  const lines = stdout.trim().split(/\r?\n/u).filter((line): boolean => line.length > 0);
  if (lines.length !== 1) return undefined;
  const line = lines[0];
  if (line === undefined) return undefined;
  try {
    const value: unknown = JSON.parse(line);
    if (!isRecord(value) || value["type"] !== "result") return undefined;
    const status = value["status"];
    if (status !== "completed" && status !== "awaiting_approval" && status !== "failed" && status !== "cancelled") return undefined;
    const output = value["output"];
    const receipts = value["receipts"];
    const sessionId = value["sessionId"];
    const failure = value["failure"];
    if (output !== undefined && typeof output !== "string") return undefined;
    if (!validReceipts(receipts)) return undefined;
    if (sessionId !== undefined && typeof sessionId !== "string") return undefined;
    const parsedFailure = parseFailure(failure);
    if (parsedFailure === null) return undefined;
    return {
      status,
      ...(output === undefined ? {} : { output }),
      ...(receipts === undefined ? {} : { receipts }),
      ...(sessionId === undefined ? {} : { sessionId }),
      ...(parsedFailure === undefined ? {} : { failure: parsedFailure }),
    };
  } catch {
    return undefined;
  }
}

function validReceipts(value: unknown): value is readonly string[] | undefined { return value === undefined || (Array.isArray(value) && value.length <= 100 && value.every((receipt) => typeof receipt === "string" && /^receipt-[A-Za-z0-9-]{1,160}$/u.test(receipt))); }

function parseFailure(value: unknown): MastraWorkerFailure | undefined | null {
  if (value === undefined) return undefined;
  if (!isRecord(value) || typeof value["code"] !== "string") return null;
  if (value["message"] !== undefined && typeof value["message"] !== "string") return null;
  if (value["exitCode"] !== undefined && (typeof value["exitCode"] !== "number" || !Number.isInteger(value["exitCode"]) || value["exitCode"] < 0)) return null;
  if (value["stderrExcerpt"] !== undefined && (typeof value["stderrExcerpt"] !== "string" || value["stderrExcerpt"].length > 1_000)) return null;
  return { code: value["code"], ...(typeof value["message"] === "string" ? { message: value["message"] } : {}), ...(typeof value["exitCode"] === "number" ? { exitCode: value["exitCode"] } : {}), ...(typeof value["stderrExcerpt"] === "string" ? { stderrExcerpt: value["stderrExcerpt"] } : {}) };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
