/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { resolve } from "node:path";
import { constants } from "node:fs";
import { chmod, copyFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

import type { LocalePreference } from "../../../application/localization/locale.js";
import { parseLocalePreference } from "../../../application/localization/locale.js";
import type { HumanProfile } from "../../../domain/governance/human-profile.js";
import { createHumanProfile, isHumanProfile } from "../../../domain/governance/human-profile.js";
import type { WebOnboardingState } from "../../../domain/onboarding/web-onboarding-state.js";
import { parseWebOnboardingState } from "../../../domain/onboarding/web-onboarding-state.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

export interface UserPreferences {
  readonly schemaVersion: 4;
  readonly locale: LocalePreference;
  readonly preferredSurface: PreferredSurface;
  readonly humanProfile?: HumanProfile;
  readonly onboarding?: WebOnboardingState;
}

export const PREFERRED_SURFACES = ["web", "tui", "cli"] as const;
export type PreferredSurface = typeof PREFERRED_SURFACES[number];

export class FsLocalePreferenceStore {
  public constructor(private readonly homeDir: string) {}

  public async load(): Promise<LocalePreference> {
    return (await this.loadPreferences()).locale;
  }

  public async save(locale: LocalePreference): Promise<void> {
    const current = await this.loadPreferences();
    const payload: UserPreferences = { ...current, locale };
    await this.persist(payload);
  }

  public async loadPreferences(): Promise<UserPreferences> {
    const value = await readJson<unknown>(this.path());
    if (value === undefined) return { schemaVersion: 4, locale: "auto", preferredSurface: "web" };
    if (!isRecord(value) || ![1, 2, 3, 4].includes(Number(value["schemaVersion"])) || typeof value["locale"] !== "string") {
      throw new Error("Invalid user preference file.");
    }
    const locale = parseLocalePreference(value["locale"]);
    if (value["schemaVersion"] === 1) return { schemaVersion: 4, locale, preferredSurface: "web" };
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

  public async savePreferredSurface(preferredSurface: PreferredSurface): Promise<void> {
    const current = await this.loadPreferences();
    await this.persist({ ...current, preferredSurface: parsePreferredSurface(preferredSurface) });
  }

  public async saveHumanProfile(input: { readonly name: string; readonly email?: string }): Promise<HumanProfile> {
    const current = await this.loadPreferences();
    const profile = createHumanProfile({
      id: current.humanProfile?.id ?? `human_${randomBytes(12).toString("hex")}`,
      name: input.name,
      ...(input.email === undefined || input.email.trim() === "" ? {} : { email: input.email }),
    });
    await this.persist({ ...current, humanProfile: profile });
    return profile;
  }

  public async saveOnboardingState(onboarding: WebOnboardingState): Promise<void> {
    const current = await this.loadPreferences();
    if (current.humanProfile?.id !== onboarding.ownerHumanProfileId) throw new Error("Web onboarding state belongs to another human profile.");
    await this.persist({ ...current, onboarding: parseWebOnboardingState(onboarding) });
  }

  private path(): string {
    return resolve(this.homeDir, ".arka-norn", "preferences.json");
  }

  private async persist(value: UserPreferences): Promise<void> {
    const path = this.path();
    await withFileLock(path, async () => {
      const previous = await readJson<unknown>(path);
      if (isRecord(previous) && [1, 2, 3].includes(Number(previous["schemaVersion"]))) {
        const backup = `${path}.v${String(previous["schemaVersion"])}.backup`;
        try { await copyFile(path, backup, constants.COPYFILE_EXCL); await chmod(backup, 0o600); }
        catch (error) { if (!isNodeError(error) || error.code !== "EEXIST") throw error; }
      }
      await writeJsonAtomic(path, value, { mode: 0o600 });
    });
  }
}

function parsePreferredSurface(value: unknown): PreferredSurface {
  if (typeof value !== "string" || !(PREFERRED_SURFACES as readonly string[]).includes(value)) {
    throw new Error("Invalid preferred interaction surface.");
  }
  return value as PreferredSurface;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException { return error instanceof Error && "code" in error; }
