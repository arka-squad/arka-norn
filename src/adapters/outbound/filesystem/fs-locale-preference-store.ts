/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { resolve } from "node:path";
import { randomBytes } from "node:crypto";

import type { LocalePreference } from "../../../application/localization/locale.js";
import { parseLocalePreference } from "../../../application/localization/locale.js";
import type { HumanProfile } from "../../../domain/governance/human-profile.js";
import { createHumanProfile, isHumanProfile } from "../../../domain/governance/human-profile.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";

export interface UserPreferences {
  readonly schemaVersion: 2;
  readonly locale: LocalePreference;
  readonly humanProfile?: HumanProfile;
}

export class FsLocalePreferenceStore {
  public constructor(private readonly homeDir: string) {}

  public async load(): Promise<LocalePreference> {
    return (await this.loadPreferences()).locale;
  }

  public async save(locale: LocalePreference): Promise<void> {
    const current = await this.loadPreferences();
    const payload: UserPreferences = { ...current, locale };
    await writeJsonAtomic(this.path(), payload, { mode: 0o600 });
  }

  public async loadPreferences(): Promise<UserPreferences> {
    const value = await readJson<unknown>(this.path());
    if (value === undefined) return { schemaVersion: 2, locale: "auto" };
    if (!isRecord(value) || (value["schemaVersion"] !== 1 && value["schemaVersion"] !== 2) || typeof value["locale"] !== "string") {
      throw new Error("Invalid user preference file.");
    }
    const locale = parseLocalePreference(value["locale"]);
    if (value["schemaVersion"] === 1) return { schemaVersion: 2, locale };
    if (value["humanProfile"] !== undefined && !isHumanProfile(value["humanProfile"])) {
      throw new Error("Invalid human profile in preference file.");
    }
    return { schemaVersion: 2, locale, ...(value["humanProfile"] === undefined ? {} : { humanProfile: createHumanProfile(value["humanProfile"]) }) };
  }

  public async saveHumanProfile(input: { readonly name: string; readonly email?: string }): Promise<HumanProfile> {
    const current = await this.loadPreferences();
    const profile = createHumanProfile({
      id: current.humanProfile?.id ?? `human_${randomBytes(12).toString("hex")}`,
      name: input.name,
      ...(input.email === undefined || input.email.trim() === "" ? {} : { email: input.email }),
    });
    await writeJsonAtomic(this.path(), { ...current, humanProfile: profile }, { mode: 0o600 });
    return profile;
  }

  private path(): string {
    return resolve(this.homeDir, ".arka-norn", "preferences.json");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
