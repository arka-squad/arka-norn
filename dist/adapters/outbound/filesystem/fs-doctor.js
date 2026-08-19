import * as fs from "node:fs/promises";
import { join } from "node:path";
import { readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
export class FsDoctor {
    home;
    constructor(homeDir) {
        this.home = homeDir;
    }
    async inspectIndex(kind, repair, apply) {
        const target = join(this.home, ".arka-norn", "index", `${kind}.json`);
        let raw;
        try {
            raw = await readRaw(target);
        }
        catch (error) {
            return this.invalidIndex(kind, target, error instanceof Error ? error.message : String(error), repair, apply);
        }
        if (raw === undefined) {
            return { check: { id: `index.${kind}`, status: "warn", message: "index absent; it will be created on first use", repairable: false } };
        }
        try {
            const value = JSON.parse(raw);
            if (!isIndex(value))
                return this.invalidIndex(kind, target, "schema invalid", repair, apply);
            const mode = (await fs.stat(target)).mode & 0o777;
            if (mode !== 0o600) {
                if (repair && apply)
                    await fs.chmod(target, 0o600);
                return {
                    check: { id: `index.${kind}`, status: repair && apply ? "pass" : "warn", message: repair && apply ? "permissions repaired to 0600" : `permissions are ${mode.toString(8)} instead of 600`, repairable: true },
                    ...(repair ? { repair: { target, action: "chmod_0600", applied: apply } } : {}),
                };
            }
            return { check: { id: `index.${kind}`, status: "pass", message: "index valid and private", repairable: false } };
        }
        catch (error) {
            return this.invalidIndex(kind, target, error instanceof Error ? error.message : String(error), repair, apply);
        }
    }
    async invalidIndex(kind, target, reason, repair, apply) {
        let backupPath;
        if (repair && apply) {
            const backupDir = join(this.home, ".arka-norn", "backups");
            await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
            backupPath = join(backupDir, `${kind}-${Date.now()}-corrupt.json`);
            await fs.copyFile(target, backupPath, fs.constants.COPYFILE_EXCL);
            await fs.chmod(backupPath, 0o600);
            await writeJsonAtomic(target, { schemaVersion: 2, entries: [] }, { mode: 0o600 });
        }
        return {
            check: {
                id: `index.${kind}`,
                status: repair && apply ? "pass" : "fail",
                message: repair && apply ? `corrupt index isolated and reset (${reason})` : `corrupt index (${reason})`,
                repairable: true,
            },
            ...(repair ? { repair: { target, action: "backup_and_reset", applied: apply, ...(backupPath === undefined ? {} : { backupPath }) } } : {}),
        };
    }
}
function isIndex(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const candidate = value;
    return candidate["schemaVersion"] === 2 && Array.isArray(candidate["entries"]);
}
//# sourceMappingURL=fs-doctor.js.map