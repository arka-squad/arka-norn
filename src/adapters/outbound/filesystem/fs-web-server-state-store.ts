/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { unlink } from "node:fs/promises";
import { resolve } from "node:path";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

export interface WebServerState {
  readonly schemaVersion: 1;
  readonly pid: number;
  readonly port: number;
  readonly url: string;
  readonly startedAt: string;
  readonly cwd: string;
}

export class FsWebServerStateStore {
  public constructor(private readonly homeDir: string) {}

  public async load(): Promise<WebServerState | undefined> {
    const value = await readJson<unknown>(this.path());
    if (value === undefined) return undefined;
    if (!isWebServerState(value)) throw new Error("Invalid Norn Web server state.");
    return value;
  }

  public async save(state: WebServerState): Promise<void> {
    if (!isWebServerState(state)) throw new Error("Invalid Norn Web server state.");
    await writeJsonAtomic(this.path(), state, { mode: 0o600 });
  }

  public async remove(pid?: number): Promise<void> {
    const current = await this.load();
    if (current === undefined || (pid !== undefined && current.pid !== pid)) return;
    await unlink(this.path()).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
  }

  public exclusive<T>(operation: () => Promise<T>): Promise<T> {
    return withFileLock(this.path(), operation);
  }

  public path(): string {
    return resolve(this.homeDir, ".arka-norn", "web", "server.json");
  }

  public logPath(): string {
    return resolve(this.homeDir, ".arka-norn", "web", "server.log");
  }
}

function isWebServerState(value: unknown): value is WebServerState {
  if (!isRecord(value) || value["schemaVersion"] !== 1) return false;
  if (!positiveInteger(value["pid"]) || !port(value["port"])) return false;
  if (typeof value["startedAt"] !== "string" || !Number.isFinite(Date.parse(value["startedAt"]))) return false;
  if (typeof value["cwd"] !== "string" || value["cwd"].length === 0 || typeof value["url"] !== "string") return false;
  try {
    const url = new URL(value["url"]);
    const token = url.hash.startsWith("#token=") ? url.hash.slice("#token=".length) : "";
    return url.protocol === "http:"
      && url.hostname === "127.0.0.1"
      && Number(url.port) === value["port"]
      && /^[A-Za-z0-9_-]{43}$/u.test(token);
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function port(value: unknown): value is number {
  return positiveInteger(value) && value <= 65_535;
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
