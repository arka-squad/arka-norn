/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { join } from "node:path";
import { rm } from "node:fs/promises";

import type { VersionSkip } from "../../../application/version/version-advisory.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";

interface VersionSkipFile {
  readonly schemaVersion: 1;
  readonly kind: "reboot" | "version";
  readonly version: string;
  readonly bootId?: string;
}

/** Persists the user's decision to defer or dismiss an available update. */
export class FsVersionSkipStore {
  public constructor(private readonly homeDir: string) {}

  public async load(): Promise<VersionSkip | undefined> {
    const value = await readJson<unknown>(this.path()).catch(() => undefined);
    if (!isRecord(value) || value["schemaVersion"] !== 1) return undefined;
    if ((value["kind"] !== "reboot" && value["kind"] !== "version") || typeof value["version"] !== "string") return undefined;
    const bootId = typeof value["bootId"] === "string" ? value["bootId"] : undefined;
    return { kind: value["kind"], version: value["version"], ...(bootId === undefined ? {} : { bootId }) };
  }

  public async save(skip: VersionSkip): Promise<void> {
    const payload: VersionSkipFile = {
      schemaVersion: 1,
      kind: skip.kind,
      version: skip.version,
      ...(skip.bootId === undefined ? {} : { bootId: skip.bootId }),
    };
    await writeJsonAtomic(this.path(), payload, { mode: 0o600 });
  }

  public async clear(): Promise<void> {
    await rm(this.path(), { force: true });
  }

  private path(): string {
    return join(this.homeDir, ".arka-norn", "version-skip.json");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
