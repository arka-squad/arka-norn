import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import * as fs from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { FileTooLargeError, PathSecurityError } from "../../../../domain/errors.js";
const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export async function readJson(filePath, maxBytes = DEFAULT_MAX_BYTES) {
    const raw = await readRaw(filePath, maxBytes);
    return raw === undefined ? undefined : JSON.parse(raw);
}
export async function writeJsonAtomic(filePath, payload, options = {}) {
    const json = `${JSON.stringify(payload, null, 2)}\n`;
    await writeFileAtomic(filePath, json, options);
}
export async function writeFileAtomic(filePath, content, options = {}) {
    const requestedDirectory = dirname(filePath);
    const mode = options.mode ?? 0o600;
    await fs.mkdir(requestedDirectory, { recursive: true, mode: 0o700 });
    const directoryStat = await fs.lstat(requestedDirectory);
    if (directoryStat.isSymbolicLink())
        throw new PathSecurityError(requestedDirectory, "symbolic-link output directories are forbidden");
    const directory = await fs.realpath(requestedDirectory);
    const destinationPath = join(directory, basename(filePath));
    await rejectSymlink(destinationPath);
    const tempPath = `${destinationPath}.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
    let handle;
    try {
        handle = await fs.open(tempPath, "wx", mode);
        await handle.writeFile(content, "utf8");
        await handle.sync();
        await handle.close();
        handle = undefined;
        if (options.exclusive === true) {
            await fs.link(tempPath, destinationPath);
            await fs.unlink(tempPath);
        }
        else {
            await fs.rename(tempPath, destinationPath);
        }
        await fs.chmod(destinationPath, mode);
        await syncDirectory(directory);
    }
    catch (error) {
        await handle?.close().catch(() => undefined);
        await fs.unlink(tempPath).catch(() => undefined);
        throw error;
    }
}
export async function readRaw(filePath, maxBytes = DEFAULT_MAX_BYTES) {
    let handle;
    try {
        const beforeOpen = await fs.lstat(filePath);
        if (beforeOpen.isSymbolicLink())
            throw new PathSecurityError(filePath, "symbolic-link files are forbidden");
        const flags = process.platform === "win32" ? constants.O_RDONLY : constants.O_RDONLY | constants.O_NOFOLLOW;
        handle = await fs.open(filePath, flags);
        const stat = await handle.stat();
        if (!stat.isFile())
            throw new PathSecurityError(filePath, "expected a regular file");
        if (stat.size > maxBytes)
            throw new FileTooLargeError(filePath, maxBytes);
        return await handle.readFile("utf8");
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return undefined;
        if (isNodeError(error, "ELOOP"))
            throw new PathSecurityError(filePath, "symbolic-link files are forbidden");
        throw error;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
async function rejectSymlink(filePath) {
    try {
        if ((await fs.lstat(filePath)).isSymbolicLink()) {
            throw new PathSecurityError(filePath, "symbolic-link outputs are forbidden");
        }
    }
    catch (error) {
        if (!isNodeError(error, "ENOENT"))
            throw error;
    }
}
async function syncDirectory(directory) {
    let handle;
    try {
        handle = await fs.open(directory, "r");
        await handle.sync();
    }
    catch (error) {
        if (!isNodeError(error, "EINVAL") && !isNodeError(error, "ENOTSUP"))
            throw error;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=atomic-json.js.map