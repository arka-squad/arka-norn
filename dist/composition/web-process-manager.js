/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { spawn } from "node:child_process";
import { chmodSync, closeSync, openSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { FsWebServerStateStore } from "../adapters/outbound/filesystem/fs-web-server-state-store.js";
import { createWebRuntime } from "./web-runtime.js";
const START_TIMEOUT_MS = 10_000;
const STOP_TIMEOUT_MS = 10_000;
export class WebProcessManager {
    context;
    store;
    constructor(context) {
        this.context = context;
        this.store = new FsWebServerStateStore(context.homeDir);
    }
    start(port) {
        return this.store.exclusive(async () => this.startUnlocked(port));
    }
    stop() {
        return this.store.exclusive(async () => this.stopUnlocked());
    }
    restart(port) {
        return this.store.exclusive(async () => {
            const current = await this.inspectUnlocked();
            const selectedPort = port ?? current.port;
            const token = sessionToken(current.url);
            if (current.status === "unresponsive")
                throw new Error(`Norn Web is unresponsive. Inspect ${current.logPath} before restarting.`);
            if (current.status === "running")
                await this.stopRunning(current);
            return this.startUnlocked(selectedPort, token);
        });
    }
    status() {
        return this.store.exclusive(async () => this.inspectUnlocked());
    }
    foreground(port) {
        return this.store.exclusive(async () => {
            const current = await this.inspectUnlocked();
            if (current.status !== "stopped")
                throw new Error(this.alreadyRunningMessage(current));
            return this.serve(port);
        });
    }
    async serve(port) {
        const token = sessionToken(this.context.environment["ARKA_NORN_WEB_TOKEN"]);
        const server = await createWebRuntime({
            frameworkRoot: this.context.frameworkRoot,
            homeDir: this.context.homeDir,
            cwd: this.context.cwd,
            sessionId: this.context.sessionId,
            environment: this.context.environment,
            ...(port === undefined ? {} : { port }),
            ...(token === undefined ? {} : { token }),
        });
        const state = {
            schemaVersion: 1,
            pid: process.pid,
            port: server.port,
            url: server.url,
            startedAt: new Date().toISOString(),
            cwd: this.context.cwd,
        };
        try {
            await this.store.save(state);
        }
        catch (error) {
            await server.close();
            throw error;
        }
        let closing;
        const shutdown = () => {
            closing ??= server.close().finally(async () => this.store.remove(process.pid));
            void closing.catch((error) => {
                process.stderr.write(`Norn Web shutdown failed: ${error instanceof Error ? error.message : String(error)}\n`);
                process.exitCode = 1;
            });
        };
        process.once("SIGINT", shutdown);
        process.once("SIGTERM", shutdown);
        return running(state, this.store.logPath());
    }
    async startUnlocked(port, token) {
        const current = await this.inspectUnlocked();
        if (current.status !== "stopped") {
            if (current.status === "unresponsive")
                throw new Error(`Norn Web is unresponsive. Inspect ${current.logPath}.`);
            if (current.status === "running" && port !== undefined && port !== current.port) {
                throw new Error(`Norn Web is already running on port ${String(current.port)}. Use web restart --port ${String(port)}.`);
            }
            return current;
        }
        await mkdir(dirname(this.store.logPath()), { recursive: true, mode: 0o700 });
        const log = openSync(this.store.logPath(), "a", 0o600);
        chmodSync(this.store.logPath(), 0o600);
        let spawnError;
        const args = [resolve(this.context.frameworkRoot, "bin", "arka-norn.mjs"), "web", "__serve"];
        if (port !== undefined)
            args.push("--port", String(port));
        const child = spawn(process.execPath, args, {
            cwd: this.context.cwd,
            detached: true,
            windowsHide: true,
            stdio: ["ignore", log, log],
            env: {
                ...this.context.environment,
                ARKA_NORN_HOME: this.context.homeDir,
                ARKA_NORN_SESSION: this.context.sessionId.value,
                ARKA_NORN_WEB_DAEMON: "1",
                ...(token === undefined ? {} : { ARKA_NORN_WEB_TOKEN: token }),
            },
        });
        closeSync(log);
        child.once("error", (error) => { spawnError = error; });
        child.unref();
        if (child.pid === undefined)
            throw new Error("Norn Web did not create a server process.");
        for (let elapsed = 0; elapsed < START_TIMEOUT_MS; elapsed += 100) {
            if (spawnError !== undefined)
                throw spawnError;
            const state = await this.store.load();
            if (state?.pid === child.pid && await probe(state))
                return running(state, this.store.logPath());
            if (!isProcessAlive(child.pid))
                throw new Error(`Norn Web exited during startup. Inspect ${this.store.logPath()}.`);
            await delay(100);
        }
        process.kill(child.pid, "SIGTERM");
        throw new Error(`Norn Web startup timed out. Inspect ${this.store.logPath()}.`);
    }
    async stopUnlocked() {
        const current = await this.inspectUnlocked();
        if (current.status === "stopped")
            return current;
        if (current.status === "unresponsive")
            throw new Error(`Norn Web is unresponsive. Refusing to signal an unverified PID; inspect ${current.logPath}.`);
        await this.stopRunning(current);
        return stopped(this.store.logPath());
    }
    async stopRunning(current) {
        const pid = current.pid;
        if (pid === undefined)
            throw new Error("Norn Web state has no PID.");
        process.kill(pid, "SIGTERM");
        for (let elapsed = 0; elapsed < STOP_TIMEOUT_MS; elapsed += 100) {
            if (!isProcessAlive(pid)) {
                await this.store.remove(pid);
                return;
            }
            await delay(100);
        }
        throw new Error(`Norn Web did not stop within ${String(STOP_TIMEOUT_MS / 1_000)} seconds.`);
    }
    async inspectUnlocked() {
        const state = await this.store.load();
        if (state === undefined)
            return stopped(this.store.logPath());
        if (await probe(state))
            return running(state, this.store.logPath());
        if (!isProcessAlive(state.pid)) {
            await this.store.remove(state.pid);
            return stopped(this.store.logPath());
        }
        return { ...running(state, this.store.logPath()), status: "unresponsive" };
    }
    alreadyRunningMessage(status) {
        return status.status === "running"
            ? `Norn Web is already running on port ${String(status.port)}.`
            : `Norn Web is unresponsive. Inspect ${status.logPath}.`;
    }
}
async function probe(state) {
    try {
        const session = new URL(state.url);
        const token = session.hash.slice("#token=".length);
        session.hash = "";
        const response = await fetch(`${session.origin}/api/v1/health`, {
            headers: { Authorization: `Bearer ${token}`, Origin: session.origin },
            signal: AbortSignal.timeout(1_000),
        });
        if (!response.ok)
            return false;
        const body = await response.json();
        return isRecord(body) && body["schemaVersion"] === 2 && body["ok"] === true;
    }
    catch {
        return false;
    }
}
function running(state, logPath) {
    return { status: "running", pid: state.pid, port: state.port, url: state.url, startedAt: state.startedAt, cwd: state.cwd, logPath };
}
function stopped(logPath) {
    return { status: "stopped", logPath };
}
function isProcessAlive(pid) {
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return isNodeError(error, "EPERM");
    }
}
function delay(milliseconds) {
    return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
function sessionToken(value) {
    if (value === undefined)
        return undefined;
    try {
        const candidate = value.includes("#token=") ? new URL(value).hash.slice("#token=".length) : value;
        return /^[A-Za-z0-9_-]{43}$/u.test(candidate) ? candidate : undefined;
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=web-process-manager.js.map