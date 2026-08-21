/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as fs from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";
import { LockConflictError } from "../../../../domain/errors.js";
export async function inspectFileLock(lockPath, staleMs = 30_000) {
    const stat = await fs.stat(lockPath).catch((error) => {
        if (isNodeError(error, "ENOENT"))
            return undefined;
        throw error;
    });
    if (stat === undefined)
        return { status: "absent", lockPath };
    const ageMs = Date.now() - stat.mtimeMs;
    const owner = await readLockOwner(lockPath);
    if (owner === undefined)
        return { status: "invalid", lockPath, ageMs };
    return {
        status: ageMs > staleMs && !isProcessAlive(owner.pid) ? "abandoned" : "active",
        lockPath,
        ageMs,
        ownerPid: owner.pid,
    };
}
export async function repairAbandonedFileLock(lockPath, staleMs = 30_000) {
    return reapAbandonedLock(lockPath, staleMs);
}
export async function withFileLock(targetPath, operation, options = {}) {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const staleMs = options.staleMs ?? 30_000;
    const pollMs = options.pollMs ?? 10;
    const lockPath = `${targetPath}.lock`;
    const owner = { token: randomUUID(), pid: process.pid, createdAt: new Date().toISOString() };
    await fs.mkdir(dirname(lockPath), { recursive: true, mode: 0o700 });
    const startedAt = Date.now();
    let handle;
    while (handle === undefined) {
        try {
            handle = await fs.open(lockPath, "wx", 0o600);
            await handle.writeFile(`${JSON.stringify(owner)}\n`, "utf8");
            await handle.sync();
        }
        catch (error) {
            if (!await isExistingLockContention(error, lockPath))
                throw error;
            if (await reapAbandonedLock(lockPath, staleMs))
                continue;
            if (Date.now() - startedAt >= timeoutMs)
                throw new LockConflictError(lockPath, timeoutMs);
            await delay(pollMs);
        }
    }
    try {
        return await operation();
    }
    finally {
        await handle.close().catch(() => undefined);
        await releaseOwnedLock(lockPath, owner.token);
    }
}
async function reapAbandonedLock(lockPath, staleMs) {
    const initialStat = await statIfPresent(lockPath);
    if (initialStat === undefined || Date.now() - initialStat.mtimeMs <= staleMs)
        return false;
    const reaperPath = `${lockPath}.reaper`;
    let reaper;
    try {
        reaper = await fs.open(reaperPath, "wx", 0o600);
    }
    catch (error) {
        if (await isExistingLockContention(error, reaperPath))
            return false;
        throw error;
    }
    try {
        const stat = await statIfPresent(lockPath);
        if (stat === undefined || Date.now() - stat.mtimeMs <= staleMs)
            return false;
        const owner = await readLockOwner(lockPath);
        if (owner === undefined || isProcessAlive(owner.pid))
            return false;
        await fs.unlink(lockPath).catch((error) => {
            if (!isNodeError(error, "ENOENT"))
                throw error;
        });
        return true;
    }
    finally {
        await reaper.close().catch(() => undefined);
        await fs.unlink(reaperPath).catch(() => undefined);
    }
}
async function releaseOwnedLock(lockPath, token) {
    const owner = await readLockOwner(lockPath);
    if (owner?.token !== token)
        return;
    await fs.unlink(lockPath).catch((error) => {
        if (!isNodeError(error, "ENOENT"))
            throw error;
    });
}
async function readLockOwner(lockPath) {
    try {
        const value = JSON.parse(await fs.readFile(lockPath, "utf8"));
        if (typeof value !== "object" || value === null || Array.isArray(value))
            return undefined;
        const record = value;
        if (typeof record["token"] !== "string" || typeof record["pid"] !== "number" || !Number.isInteger(record["pid"]) || typeof record["createdAt"] !== "string")
            return undefined;
        return { token: record["token"], pid: record["pid"], createdAt: record["createdAt"] };
    }
    catch (error) {
        if (isNodeError(error, "ENOENT") || error instanceof SyntaxError)
            return undefined;
        throw error;
    }
}
function isProcessAlive(pid) {
    if (pid <= 0)
        return false;
    try {
        process.kill(pid, 0);
        return true;
    }
    catch (error) {
        return isNodeError(error, "EPERM");
    }
}
function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
async function isExistingLockContention(error, lockPath) {
    if (isNodeError(error, "EEXIST"))
        return true;
    if (process.platform !== "win32" || !isNodeError(error, "EPERM"))
        return false;
    try {
        await fs.lstat(lockPath);
        return true;
    }
    catch (statError) {
        if (isNodeError(statError, "EPERM"))
            return true;
        if (!isNodeError(statError, "ENOENT"))
            throw statError;
    }
    try {
        await fs.access(dirname(lockPath), constants.W_OK);
        return true;
    }
    catch (accessError) {
        if (isNodeError(accessError, "EACCES") || isNodeError(accessError, "EPERM"))
            return false;
        throw accessError;
    }
}
async function statIfPresent(lockPath) {
    return fs.stat(lockPath).catch((error) => {
        if (isNodeError(error, "ENOENT"))
            return undefined;
        throw error;
    });
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=file-lock.js.map