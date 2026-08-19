import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { withFileLock } from "./_shared/file-lock.js";
export class FsAuditTrail {
    filePath;
    maxBytes;
    maxArchives;
    constructor(homeDir = homedir(), options = {}) {
        this.filePath = join(homeDir, ".arka-norn", "logs", "audit.jsonl");
        this.maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
        this.maxArchives = options.maxArchives ?? 5;
    }
    async append(event) {
        const line = `${JSON.stringify({
            schemaVersion: 2,
            occurredAt: event.occurredAt.toISOString(),
            action: event.action,
            outcome: event.outcome ?? "success",
            entityType: event.entityType,
            ...(event.entityId === undefined ? {} : { entityId: event.entityId }),
            ...(event.root === undefined ? {} : { root: event.root }),
            ...(event.details === undefined ? {} : { details: redactDetails(event.details) }),
        })}\n`;
        await withFileLock(this.filePath, async () => {
            await fs.mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
            await this.rotateIfNeeded(Buffer.byteLength(line));
            const handle = await fs.open(this.filePath, "a", 0o600);
            try {
                await handle.writeFile(line, "utf8");
                await handle.sync();
                await fs.chmod(this.filePath, 0o600);
            }
            finally {
                await handle.close();
            }
        });
    }
    async inspect() {
        try {
            await fs.mkdir(dirname(this.filePath), { recursive: true, mode: 0o700 });
            const handle = await fs.open(this.filePath, "a", 0o600);
            await handle.close();
            await fs.chmod(this.filePath, 0o600);
            const stat = await fs.stat(this.filePath);
            const entries = await fs.readdir(dirname(this.filePath));
            return {
                ok: true,
                filePath: this.filePath,
                sizeBytes: stat.size,
                archiveCount: entries.filter((entry) => /^audit\.\d+\.jsonl$/.test(entry)).length,
                message: `audit trail writable (${stat.size} bytes)`,
            };
        }
        catch (error) {
            return {
                ok: false,
                filePath: this.filePath,
                sizeBytes: 0,
                archiveCount: 0,
                message: error instanceof Error ? error.message : String(error),
            };
        }
    }
    async rotateIfNeeded(incomingBytes) {
        const current = await fs.stat(this.filePath).catch((error) => {
            if (isNodeError(error, "ENOENT"))
                return undefined;
            throw error;
        });
        if (current === undefined || current.size === 0 || current.size + incomingBytes <= this.maxBytes)
            return;
        if (this.maxArchives <= 0) {
            await fs.truncate(this.filePath, 0);
            return;
        }
        await fs.unlink(`${this.filePath.replace(/\.jsonl$/, "")}.${this.maxArchives}.jsonl`).catch((error) => {
            if (!isNodeError(error, "ENOENT"))
                throw error;
        });
        for (let index = this.maxArchives - 1; index >= 1; index -= 1) {
            const source = `${this.filePath.replace(/\.jsonl$/, "")}.${index}.jsonl`;
            const target = `${this.filePath.replace(/\.jsonl$/, "")}.${index + 1}.jsonl`;
            await fs.rename(source, target).catch((error) => {
                if (!isNodeError(error, "ENOENT"))
                    throw error;
            });
        }
        await fs.rename(this.filePath, `${this.filePath.replace(/\.jsonl$/, "")}.1.jsonl`);
    }
}
function redactDetails(details) {
    return Object.fromEntries(Object.entries(details).map(([key, value]) => [key, isSensitiveKey(key) ? "[REDACTED]" : value]));
}
function isSensitiveKey(key) {
    return /(?:authorization|cookie|credential|password|secret|token|api[_-]?key)/i.test(key);
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-audit-trail.js.map