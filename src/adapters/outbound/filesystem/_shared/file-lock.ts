import * as fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import { LockConflictError } from "../../../../domain/errors.js";

export interface FileLockOptions {
  readonly timeoutMs?: number;
  readonly staleMs?: number;
  readonly pollMs?: number;
}

interface LockOwner {
  readonly token: string;
  readonly pid: number;
  readonly createdAt: string;
}

export interface FileLockInspection {
  readonly status: "active" | "abandoned" | "invalid" | "absent";
  readonly lockPath: string;
  readonly ageMs?: number;
  readonly ownerPid?: number;
}

export async function inspectFileLock(lockPath: string, staleMs = 30_000): Promise<FileLockInspection> {
  const stat = await fs.stat(lockPath).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  });
  if (stat === undefined) return { status: "absent", lockPath };
  const ageMs = Date.now() - stat.mtimeMs;
  const owner = await readLockOwner(lockPath);
  if (owner === undefined) return { status: "invalid", lockPath, ageMs };
  return {
    status: ageMs > staleMs && !isProcessAlive(owner.pid) ? "abandoned" : "active",
    lockPath,
    ageMs,
    ownerPid: owner.pid,
  };
}

export async function repairAbandonedFileLock(lockPath: string, staleMs = 30_000): Promise<boolean> {
  return reapAbandonedLock(lockPath, staleMs);
}

export async function withFileLock<T>(targetPath: string, operation: () => Promise<T>, options: FileLockOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const staleMs = options.staleMs ?? 30_000;
  const pollMs = options.pollMs ?? 10;
  const lockPath = `${targetPath}.lock`;
  const owner: LockOwner = { token: randomUUID(), pid: process.pid, createdAt: new Date().toISOString() };
  await fs.mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();
  let handle: fs.FileHandle | undefined;
  while (handle === undefined) {
    try {
      handle = await fs.open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
      await handle.sync();
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      if (await reapAbandonedLock(lockPath, staleMs)) continue;
      if (Date.now() - startedAt >= timeoutMs) throw new LockConflictError(lockPath, timeoutMs);
      await delay(pollMs);
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await releaseOwnedLock(lockPath, owner.token);
  }
}

async function reapAbandonedLock(lockPath: string, staleMs: number): Promise<boolean> {
  const reaperPath = `${lockPath}.reaper`;
  let reaper: fs.FileHandle | undefined;
  try {
    reaper = await fs.open(reaperPath, "wx", 0o600);
  } catch (error) {
    if (isNodeError(error, "EEXIST")) return false;
    throw error;
  }
  try {
    const stat = await fs.stat(lockPath).catch((error: unknown) => {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    });
    if (stat === undefined || Date.now() - stat.mtimeMs <= staleMs) return false;
    const owner = await readLockOwner(lockPath);
    if (owner === undefined || isProcessAlive(owner.pid)) return false;
    await fs.unlink(lockPath).catch((error: unknown) => {
      if (!isNodeError(error, "ENOENT")) throw error;
    });
    return true;
  } finally {
    await reaper.close().catch(() => undefined);
    await fs.unlink(reaperPath).catch(() => undefined);
  }
}

async function releaseOwnedLock(lockPath: string, token: string): Promise<void> {
  const owner = await readLockOwner(lockPath);
  if (owner?.token !== token) return;
  await fs.unlink(lockPath).catch((error: unknown) => {
    if (!isNodeError(error, "ENOENT")) throw error;
  });
}

async function readLockOwner(lockPath: string): Promise<LockOwner | undefined> {
  try {
    const value = JSON.parse(await fs.readFile(lockPath, "utf8")) as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    const record = value as Readonly<Record<string, unknown>>;
    if (typeof record["token"] !== "string" || typeof record["pid"] !== "number" || !Number.isInteger(record["pid"]) || typeof record["createdAt"] !== "string") return undefined;
    return { token: record["token"], pid: record["pid"], createdAt: record["createdAt"] };
  } catch (error) {
    if (isNodeError(error, "ENOENT") || error instanceof SyntaxError) return undefined;
    throw error;
  }
}

function isProcessAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isNodeError(error, "EPERM");
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
