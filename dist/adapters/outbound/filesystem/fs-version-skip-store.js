/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
/** Persists the user's decision to defer or dismiss an available update. */
export class FsVersionSkipStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load() {
        const value = await readJson(this.path()).catch(() => undefined);
        if (!isRecord(value) || value["schemaVersion"] !== 1)
            return undefined;
        if ((value["kind"] !== "reboot" && value["kind"] !== "version") || typeof value["version"] !== "string")
            return undefined;
        const bootId = typeof value["bootId"] === "string" ? value["bootId"] : undefined;
        return { kind: value["kind"], version: value["version"], ...(bootId === undefined ? {} : { bootId }) };
    }
    async save(skip) {
        const payload = {
            schemaVersion: 1,
            kind: skip.kind,
            version: skip.version,
            ...(skip.bootId === undefined ? {} : { bootId: skip.bootId }),
        };
        await writeJsonAtomic(this.path(), payload, { mode: 0o600 });
    }
    async clear() {
        await rm(this.path(), { force: true });
    }
    path() {
        return join(this.homeDir, ".arka-norn", "version-skip.json");
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=fs-version-skip-store.js.map