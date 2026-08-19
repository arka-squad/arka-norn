import * as fs from "node:fs/promises";
import { dirname } from "node:path";

import { LockConflictError } from "../../../../domain/errors.js";

export interface FileLockOptions {
  readonly timeoutMs?: number;
  readonly staleMs?: number;
  readonly pollMs?: number;
}

export async function withFileLock<T>(targetPath: string, operation: () => Promise<T>, options: FileLockOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const staleMs = options.staleMs ?? 30_000;
  const pollMs = options.pollMs ?? 10;
  const lockPath = `${targetPath}.lock`;
  await fs.mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
  const startedAt = Date.now();
  let handle: fs.FileHandle | undefined;
  while (handle === undefined) {
    try {
      handle = await fs.open(lockPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
      await handle.sync();
    } catch (error) {
      if (!isNodeError(error, "EEXIST")) throw error;
      if (await isStale(lockPath, staleMs)) {
        await fs.unlink(lockPath).catch(() => undefined);
        continue;
      }
      if (Date.now() - startedAt >= timeoutMs) throw new LockConflictError(lockPath, timeoutMs);
      await delay(pollMs);
    }
  }
  try {
    return await operation();
  } finally {
    await handle.close().catch(() => undefined);
    await fs.unlink(lockPath).catch(() => undefined);
  }
}

async function isStale(lockPath: string, staleMs: number): Promise<boolean> {
  try {
    return Date.now() - (await fs.stat(lockPath)).mtimeMs > staleMs;
  } catch (error) {
    // Le détenteur peut libérer le lock entre l'échec open("wx") et stat().
    // ENOENT signifie alors « réessayer l'acquisition », pas « supprimer » :
    // un autre concurrent pourrait déjà avoir créé son propre lock dans cet
    // intervalle et serait sinon déverrouillé à tort.
    if (isNodeError(error, "ENOENT")) return false;
    throw error;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
