/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { join } from "node:path";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";

export interface VersionCache {
  readonly latest: string;
  readonly checkedAt: string;
}

/** Caches the last known npm version so a reminder never needs a live network call. */
export class FsVersionCacheStore {
  public constructor(private readonly homeDir: string) {}

  public async load(): Promise<VersionCache | undefined> {
    const value = await readJson<unknown>(this.path()).catch(() => undefined);
    if (!isRecord(value) || value["schemaVersion"] !== 1) return undefined;
    if (typeof value["latest"] !== "string" || typeof value["checkedAt"] !== "string") return undefined;
    return { latest: value["latest"], checkedAt: value["checkedAt"] };
  }

  public async save(cache: VersionCache): Promise<void> {
    await writeJsonAtomic(this.path(), { schemaVersion: 1, latest: cache.latest, checkedAt: cache.checkedAt }, { mode: 0o600 });
  }

  private path(): string {
    return join(this.homeDir, ".arka-norn", "version-cache.json");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

