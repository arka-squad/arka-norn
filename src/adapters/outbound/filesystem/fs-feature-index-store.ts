import { homedir } from "node:os";
import { join } from "node:path";

import { FeatureAlreadyExistsError, FeatureNotFoundError } from "../../../domain/errors.js";
import type { FeatureId } from "../../../domain/feature/feature-id.js";
import type { FeatureIndexEntry, FeatureIndexStore } from "../../../ports/outbound/feature-index-store.js";
import type { Logger } from "../../../ports/outbound/logger.js";

import { readJson, readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

interface IndexFileV2 {
  readonly schemaVersion: 2;
  readonly entries: readonly IndexEntryRaw[];
}

interface IndexEntryRaw {
  readonly id: string;
  readonly projectId: string;
  readonly root: string;
  readonly name: string;
  readonly updatedAt: string;
}

export class FsFeatureIndexStore implements FeatureIndexStore {
  private readonly home: string;
  private readonly logger: Logger | undefined;

  public constructor(options: { readonly homeDir?: string; readonly logger?: Logger } = {}) {
    this.home = options.homeDir ?? homedir();
    this.logger = options.logger;
  }

  public async load(): Promise<readonly FeatureIndexEntry[]> {
    const raw = await this.readIndexSafe();
    if (raw === undefined) return [];
    return raw.entries.map(deserialize).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
  }

  public async save(entries: readonly FeatureIndexEntry[]): Promise<void> {
    await withFileLock(this.indexPath(), () => this.saveUnlocked(entries));
  }

  public async add(entry: FeatureIndexEntry): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      if (entries.some((item) => item.id === entry.id)) throw new FeatureAlreadyExistsError(entry.root);
      await this.saveUnlocked([...entries, entry]);
    });
  }

  public async remove(id: FeatureId): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      await this.saveUnlocked(entries.filter((entry) => entry.id !== id.value));
    });
  }

  public async touch(id: FeatureId, at: Date): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      if (!entries.some((entry) => entry.id === id.value)) throw new FeatureNotFoundError(id.value);
      await this.saveUnlocked(entries.map((entry) => entry.id === id.value ? { ...entry, updatedAt: at } : entry));
    });
  }

  public async find(id: FeatureId): Promise<FeatureIndexEntry | undefined> {
    return (await this.load()).find((entry) => entry.id === id.value);
  }

  private indexPath(): string {
    return join(this.home, ".arka-norn", "index", "features.json");
  }

  private async loadUnlocked(): Promise<readonly FeatureIndexEntry[]> {
    const raw = await this.readIndexSafe();
    return raw === undefined ? [] : raw.entries.map(deserialize);
  }

  private async saveUnlocked(entries: readonly FeatureIndexEntry[]): Promise<void> {
    await writeJsonAtomic(this.indexPath(), { schemaVersion: 2, entries: entries.map(serialize) } satisfies IndexFileV2, { mode: 0o600 });
  }

  private async readIndexSafe(): Promise<IndexFileV2 | undefined> {
    let value: unknown;
    try {
      value = await readJson<unknown>(this.indexPath());
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      await this.backupCorruption(error.message);
      return undefined;
    }
    if (value === undefined) return undefined;
    if (!isIndex(value)) {
      await this.backupCorruption("schema validation failed");
      return undefined;
    }
    return value;
  }

  private async backupCorruption(reason: string): Promise<void> {
    const raw = await readRaw(this.indexPath());
    if (raw === undefined) return;
    const backupPath = join(this.home, ".arka-norn", "backups", "last-feature-index-corruption.json");
    this.logger?.warn("feature-index corruption; using empty cache", { reason, backupPath });
    await writeJsonAtomic(backupPath, { schemaVersion: 1, savedAt: new Date().toISOString(), reason, raw });
  }
}

function serialize(entry: FeatureIndexEntry): IndexEntryRaw {
  return { id: entry.id, projectId: entry.projectId, root: entry.root, name: entry.name, updatedAt: entry.updatedAt.toISOString() };
}

function deserialize(entry: IndexEntryRaw): FeatureIndexEntry {
  return { ...entry, updatedAt: new Date(entry.updatedAt) };
}

function isIndex(value: unknown): value is IndexFileV2 {
  if (typeof value !== "object" || value === null) return false;
  const index = value as { readonly schemaVersion?: unknown; readonly entries?: unknown };
  return index.schemaVersion === 2 && Array.isArray(index.entries) && index.entries.every(isEntry);
}

function isEntry(value: unknown): value is IndexEntryRaw {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.id === "string" && typeof entry.projectId === "string" && typeof entry.root === "string" &&
    typeof entry.name === "string" && typeof entry.updatedAt === "string" && !Number.isNaN(new Date(entry.updatedAt).getTime());
}
