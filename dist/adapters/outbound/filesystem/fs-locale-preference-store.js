/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { resolve } from "node:path";
import { parseLocalePreference } from "../../../application/localization/locale.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
export class FsLocalePreferenceStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load() {
        const value = await readJson(this.path());
        if (value === undefined)
            return "auto";
        if (!isRecord(value) || value["schemaVersion"] !== 1 || typeof value["locale"] !== "string") {
            throw new Error("Invalid locale preference file.");
        }
        return parseLocalePreference(value["locale"]);
    }
    async save(locale) {
        const payload = { schemaVersion: 1, locale };
        await writeJsonAtomic(this.path(), payload, { mode: 0o600 });
    }
    path() {
        return resolve(this.homeDir, ".arka-norn", "preferences.json");
    }
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=fs-locale-preference-store.js.map