/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { resolve } from "node:path";
import { constants } from "node:fs";
import { chmod, copyFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { parseLocalePreference } from "../../../application/localization/locale.js";
import { createHumanProfile, isHumanProfile } from "../../../domain/governance/human-profile.js";
import { parseWebOnboardingState } from "../../../domain/onboarding/web-onboarding-state.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export const PREFERRED_SURFACES = ["web", "tui", "cli"];
export class FsLocalePreferenceStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load() {
        return (await this.loadPreferences()).locale;
    }
    async save(locale) {
        const current = await this.loadPreferences();
        const payload = { ...current, locale };
        await this.persist(payload);
    }
    async loadPreferences() {
        const value = await readJson(this.path());
        if (value === undefined)
            return { schemaVersion: 4, locale: "auto", preferredSurface: "web" };
        if (!isRecord(value) || ![1, 2, 3, 4].includes(Number(value["schemaVersion"])) || typeof value["locale"] !== "string") {
            throw new Error("Invalid user preference file.");
        }
        const locale = parseLocalePreference(value["locale"]);
        if (value["schemaVersion"] === 1)
            return { schemaVersion: 4, locale, preferredSurface: "web" };
        if (value["humanProfile"] !== undefined && !isHumanProfile(value["humanProfile"])) {
            throw new Error("Invalid human profile in preference file.");
        }
        const preferredSurface = value["schemaVersion"] === 3 || value["schemaVersion"] === 4
            ? parsePreferredSurface(value["preferredSurface"])
            : "web";
        const onboarding = value["schemaVersion"] === 4 && value["onboarding"] !== undefined
            ? parseWebOnboardingState(value["onboarding"])
            : undefined;
        return {
            schemaVersion: 4,
            locale,
            preferredSurface,
            ...(value["humanProfile"] === undefined ? {} : { humanProfile: createHumanProfile(value["humanProfile"]) }),
            ...(onboarding === undefined ? {} : { onboarding }),
        };
    }
    async savePreferredSurface(preferredSurface) {
        const current = await this.loadPreferences();
        await this.persist({ ...current, preferredSurface: parsePreferredSurface(preferredSurface) });
    }
    async saveHumanProfile(input) {
        const current = await this.loadPreferences();
        const profile = createHumanProfile({
            id: current.humanProfile?.id ?? `human_${randomBytes(12).toString("hex")}`,
            name: input.name,
            ...(input.email === undefined || input.email.trim() === "" ? {} : { email: input.email }),
        });
        await this.persist({ ...current, humanProfile: profile });
        return profile;
    }
    async saveOnboardingState(onboarding) {
        const current = await this.loadPreferences();
        if (current.humanProfile?.id !== onboarding.ownerHumanProfileId)
            throw new Error("Web onboarding state belongs to another human profile.");
        await this.persist({ ...current, onboarding: parseWebOnboardingState(onboarding) });
    }
    path() {
        return resolve(this.homeDir, ".arka-norn", "preferences.json");
    }
    async persist(value) {
        const path = this.path();
        await withFileLock(path, async () => {
            const previous = await readJson(path);
            if (isRecord(previous) && [1, 2, 3].includes(Number(previous["schemaVersion"]))) {
                const backup = `${path}.v${String(previous["schemaVersion"])}.backup`;
                try {
                    await copyFile(path, backup, constants.COPYFILE_EXCL);
                    await chmod(backup, 0o600);
                }
                catch (error) {
                    if (!isNodeError(error) || error.code !== "EEXIST")
                        throw error;
                }
            }
            await writeJsonAtomic(path, value, { mode: 0o600 });
        });
    }
}
function parsePreferredSurface(value) {
    if (typeof value !== "string" || !PREFERRED_SURFACES.includes(value)) {
        throw new Error("Invalid preferred interaction surface.");
    }
    return value;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error) { return error instanceof Error && "code" in error; }
//# sourceMappingURL=fs-locale-preference-store.js.map