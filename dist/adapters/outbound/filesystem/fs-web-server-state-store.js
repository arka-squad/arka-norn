/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsWebServerStateStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load() {
        const value = await readJson(this.path());
        if (value === undefined)
            return undefined;
        if (!isWebServerState(value))
            throw new Error("Invalid Norn Web server state.");
        return value;
    }
    async save(state) {
        if (!isWebServerState(state))
            throw new Error("Invalid Norn Web server state.");
        await writeJsonAtomic(this.path(), state, { mode: 0o600 });
    }
    async remove(pid) {
        const current = await this.load();
        if (current === undefined || (pid !== undefined && current.pid !== pid))
            return;
        await unlink(this.path()).catch((error) => {
            if (!isNodeError(error, "ENOENT"))
                throw error;
        });
    }
    exclusive(operation) {
        return withFileLock(this.path(), operation);
    }
    path() {
        return resolve(this.homeDir, ".arka-norn", "web", "server.json");
    }
    logPath() {
        return resolve(this.homeDir, ".arka-norn", "web", "server.log");
    }
}
function isWebServerState(value) {
    if (!isRecord(value) || value["schemaVersion"] !== 1)
        return false;
    if (!positiveInteger(value["pid"]) || !port(value["port"]))
        return false;
    if (typeof value["startedAt"] !== "string" || !Number.isFinite(Date.parse(value["startedAt"])))
        return false;
    if (typeof value["cwd"] !== "string" || value["cwd"].length === 0 || typeof value["url"] !== "string")
        return false;
    try {
        const url = new URL(value["url"]);
        const token = url.hash.startsWith("#token=") ? url.hash.slice("#token=".length) : "";
        return url.protocol === "http:"
            && url.hostname === "127.0.0.1"
            && Number(url.port) === value["port"]
            && /^[A-Za-z0-9_-]{43}$/u.test(token);
    }
    catch {
        return false;
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
}
function port(value) {
    return positiveInteger(value) && value <= 65_535;
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-web-server-state-store.js.map