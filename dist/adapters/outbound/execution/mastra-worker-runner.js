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
import { spawn } from "node:child_process";
const MAX_WORKER_STDOUT_BYTES = 1024 * 1024;
const FORCE_KILL_DELAY_MS = 2_000;
export class NodeMastraWorkerRunner {
    scripts;
    constructor(scripts) {
        this.scripts = scripts;
    }
    launch(input) {
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
function createWorkerHandle(child, input) {
    let cancellationRequested = false;
    let timeoutReached = false;
    let stdout = "";
    let stdoutExceeded = false;
    let settled = false;
    let forceKillTimer;
    const timeoutTimer = setTimeout(() => {
        timeoutReached = true;
        if (forceKillTimer === undefined)
            forceKillTimer = terminateChild(child);
    }, input.timeoutMs);
    timeoutTimer.unref();
    const result = new Promise((resolve) => {
        const settle = (value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timeoutTimer);
            if (forceKillTimer !== undefined)
                clearTimeout(forceKillTimer);
            resolve(value);
        };
        child.stdout.on("data", (chunk) => {
            if (stdoutExceeded)
                return;
            stdout += chunk.toString("utf8");
            if (Buffer.byteLength(stdout, "utf8") > MAX_WORKER_STDOUT_BYTES) {
                stdoutExceeded = true;
                if (forceKillTimer === undefined)
                    forceKillTimer = terminateChild(child);
            }
        });
        // Drain stderr to prevent a noisy harness from blocking; never surface it.
        child.stderr.on("data", () => undefined);
        child.on("error", () => {
            settle({
                status: cancellationRequested ? "cancelled" : "interrupted",
                failure: { code: cancellationRequested ? "CANCELLED" : "WORKER_START_FAILED" },
            });
        });
        child.on("close", () => {
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
    }
    catch {
        if (forceKillTimer === undefined)
            forceKillTimer = terminateChild(child);
    }
    return {
        result,
        cancel() {
            cancellationRequested = true;
            if (!settled) {
                if (forceKillTimer === undefined)
                    forceKillTimer = terminateChild(child);
            }
            return Promise.resolve();
        },
    };
}
function terminateChild(child) {
    if (child.exitCode === null) {
        signalWorkerTree(child, "SIGTERM");
    }
    const forceTimer = setTimeout(() => {
        if (child.exitCode === null) {
            signalWorkerTree(child, "SIGKILL");
        }
    }, FORCE_KILL_DELAY_MS);
    forceTimer.unref();
    return forceTimer;
}
function signalWorkerTree(child, signal) {
    if (process.platform !== "win32" && child.pid !== undefined) {
        try {
            process.kill(-child.pid, signal);
            return;
        }
        catch {
            // A process can close between the status check and its group signal. The
            // direct-child fallback below makes that race safe without trusting a
            // persisted PID.
        }
    }
    try {
        child.kill(signal);
    }
    catch {
        // The close/error handlers turn an already-gone child into a safe outcome.
    }
}
function parseWorkerResult(stdout) {
    const lines = stdout.trim().split(/\r?\n/u).filter((line) => line.length > 0);
    if (lines.length !== 1)
        return undefined;
    const line = lines[0];
    if (line === undefined)
        return undefined;
    try {
        const value = JSON.parse(line);
        if (!isRecord(value) || value["type"] !== "result")
            return undefined;
        const status = value["status"];
        if (status !== "completed" && status !== "awaiting_approval" && status !== "failed" && status !== "cancelled")
            return undefined;
        const output = value["output"];
        const receipts = value["receipts"];
        const sessionId = value["sessionId"];
        const failure = value["failure"];
        if (output !== undefined && typeof output !== "string")
            return undefined;
        if (receipts !== undefined && (!Array.isArray(receipts) || receipts.length > 100 || receipts.some((receipt) => typeof receipt !== "string" || !/^receipt-[A-Za-z0-9-]{1,160}$/u.test(receipt))))
            return undefined;
        if (sessionId !== undefined && typeof sessionId !== "string")
            return undefined;
        if (failure !== undefined && (!isRecord(failure) || typeof failure["code"] !== "string"))
            return undefined;
        return {
            status,
            ...(output === undefined ? {} : { output }),
            ...(receipts === undefined ? {} : { receipts: receipts }),
            ...(sessionId === undefined ? {} : { sessionId }),
            ...(failure === undefined ? {} : { failure: { code: failure["code"] } }),
        };
    }
    catch {
        return undefined;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null;
}
//# sourceMappingURL=mastra-worker-runner.js.map