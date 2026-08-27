/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { join } from "node:path";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
/** Caches the last known npm version so a reminder never needs a live network call. */
export class FsVersionCacheStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load() {
        const value = await readJson(this.path()).catch(() => undefined);
        if (!isRecord(value) || value["schemaVersion"] !== 1)
            return undefined;
        if (typeof value["latest"] !== "string" || typeof value["checkedAt"] !== "string")
            return undefined;
        return { latest: value["latest"], checkedAt: value["checkedAt"] };
    }
    async save(cache) {
        await writeJsonAtomic(this.path(), { schemaVersion: 1, latest: cache.latest, checkedAt: cache.checkedAt }, { mode: 0o600 });
    }
    path() {
        return join(this.homeDir, ".arka-norn", "version-cache.json");
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=fs-version-cache-store.js.map