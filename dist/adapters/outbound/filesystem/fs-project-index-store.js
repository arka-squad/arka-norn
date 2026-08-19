import { homedir } from "node:os";
import { join } from "node:path";
import { ProjectAlreadyExistsError, ProjectNotFoundError } from "../../../domain/errors.js";
import { readJson, readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsProjectIndexStore {
    home;
    logger;
    constructor(options = {}) {
        this.home = options.homeDir ?? homedir();
        this.logger = options.logger;
    }
    async load() {
        const raw = await this.readIndexSafe();
        if (raw === undefined)
            return [];
        return raw.entries.map(deserialize).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
    }
    async save(entries) {
        await withFileLock(this.indexPath(), () => this.saveUnlocked(entries));
    }
    async add(entry) {
        await withFileLock(this.indexPath(), async () => {
            const entries = await this.loadUnlocked();
            if (entries.some((item) => item.id === entry.id))
                throw new ProjectAlreadyExistsError(entry.root);
            await this.saveUnlocked([...entries, entry]);
        });
    }
    async remove(id) {
        await withFileLock(this.indexPath(), async () => {
            const entries = await this.loadUnlocked();
            await this.saveUnlocked(entries.filter((entry) => entry.id !== id.value));
        });
    }
    async touch(id, at) {
        await withFileLock(this.indexPath(), async () => {
            const entries = await this.loadUnlocked();
            if (!entries.some((entry) => entry.id === id.value))
                throw new ProjectNotFoundError(id.value);
            await this.saveUnlocked(entries.map((entry) => entry.id === id.value ? { ...entry, updatedAt: at } : entry));
        });
    }
    async find(id) {
        return (await this.load()).find((entry) => entry.id === id.value);
    }
    indexPath() {
        return join(this.home, ".arka-norn", "index", "projects.json");
    }
    async loadUnlocked() {
        const raw = await this.readIndexSafe();
        return raw === undefined ? [] : raw.entries.map(deserialize);
    }
    async saveUnlocked(entries) {
        await writeJsonAtomic(this.indexPath(), { schemaVersion: 2, entries: entries.map(serialize) }, { mode: 0o600 });
    }
    async readIndexSafe() {
        let value;
        try {
            value = await readJson(this.indexPath());
        }
        catch (error) {
            if (!(error instanceof SyntaxError))
                throw error;
            await this.backupCorruption(error.message);
            return undefined;
        }
        if (value === undefined)
            return undefined;
        if (!isIndex(value)) {
            await this.backupCorruption("schema validation failed");
            return undefined;
        }
        return value;
    }
    async backupCorruption(reason) {
        const raw = await readRaw(this.indexPath());
        if (raw === undefined)
            return;
        const backupPath = join(this.home, ".arka-norn", "backups", "last-project-index-corruption.json");
        this.logger?.warn("project-index corruption; using empty cache", { reason, backupPath });
        await writeJsonAtomic(backupPath, { schemaVersion: 1, savedAt: new Date().toISOString(), reason, raw });
    }
}
function serialize(entry) {
    return { id: entry.id, root: entry.root, name: entry.name, updatedAt: entry.updatedAt.toISOString() };
}
function deserialize(entry) {
    return { ...entry, updatedAt: new Date(entry.updatedAt) };
}
function isIndex(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const index = value;
    return index.schemaVersion === 2 && Array.isArray(index.entries) && index.entries.every(isEntry);
}
function isEntry(value) {
    if (typeof value !== "object" || value === null)
        return false;
    const entry = value;
    return typeof entry.id === "string" && typeof entry.root === "string" && typeof entry.name === "string" &&
        typeof entry.updatedAt === "string" && !Number.isNaN(new Date(entry.updatedAt).getTime());
}
//# sourceMappingURL=fs-project-index-store.js.map