/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { resolve } from "node:path";

import type { LocalePreference } from "../../../application/localization/locale.js";
import { parseLocalePreference } from "../../../application/localization/locale.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";

interface LocalePreferenceFile {
  readonly schemaVersion: 1;
  readonly locale: LocalePreference;
}

export class FsLocalePreferenceStore {
  public constructor(private readonly homeDir: string) {}

  public async load(): Promise<LocalePreference> {
    const value = await readJson<unknown>(this.path());
    if (value === undefined) return "auto";
    if (!isRecord(value) || value["schemaVersion"] !== 1 || typeof value["locale"] !== "string") {
      throw new Error("Invalid locale preference file.");
    }
    return parseLocalePreference(value["locale"]);
  }

  public async save(locale: LocalePreference): Promise<void> {
    const payload: LocalePreferenceFile = { schemaVersion: 1, locale };
    await writeJsonAtomic(this.path(), payload, { mode: 0o600 });
  }

  private path(): string {
    return resolve(this.homeDir, ".arka-norn", "preferences.json");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
