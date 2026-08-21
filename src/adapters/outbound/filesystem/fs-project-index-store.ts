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

import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

import { ProjectAlreadyExistsError, ProjectNotFoundError } from "../../../domain/errors.js";
import type { ProjectId } from "../../../domain/project/project-id.js";
import type { Logger } from "../../../ports/outbound/logger.js";
import type { ProjectIndexEntry, ProjectIndexStore } from "../../../ports/outbound/project-index-store.js";

import { readJson, readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { isProjectIndexFile, type ProjectIndexEntryRaw, type ProjectIndexFileV2 } from "./_shared/index-codec.js";

export class FsProjectIndexStore implements ProjectIndexStore {
  private readonly home: string;
  private readonly logger: Logger | undefined;

  public constructor(options: { readonly homeDir?: string; readonly logger?: Logger } = {}) {
    this.home = options.homeDir ?? homedir();
    this.logger = options.logger;
  }

  public async load(): Promise<readonly ProjectIndexEntry[]> {
    const raw = await this.readIndexSafe();
    if (raw === undefined) return [];
    return raw.entries.map(deserialize).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id.localeCompare(b.id));
  }

  public async save(entries: readonly ProjectIndexEntry[]): Promise<void> {
    await withFileLock(this.indexPath(), () => this.saveUnlocked(entries));
  }

  public async add(entry: ProjectIndexEntry): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      if (entries.some((item) => item.id === entry.id)) throw new ProjectAlreadyExistsError(entry.root);
      await this.saveUnlocked([...entries, entry]);
    });
  }

  public async upsert(entry: ProjectIndexEntry): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      await this.saveUnlocked([...entries.filter((item) => item.id !== entry.id), entry]);
    });
  }

  public async remove(id: ProjectId): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      await this.saveUnlocked(entries.filter((entry) => entry.id !== id.value));
    });
  }

  public async touch(id: ProjectId, at: Date): Promise<void> {
    await withFileLock(this.indexPath(), async () => {
      const entries = await this.loadUnlocked();
      if (!entries.some((entry) => entry.id === id.value)) throw new ProjectNotFoundError(id.value);
      await this.saveUnlocked(entries.map((entry) => entry.id === id.value ? { ...entry, updatedAt: at } : entry));
    });
  }

  public async find(id: ProjectId): Promise<ProjectIndexEntry | undefined> {
    return (await this.load()).find((entry) => entry.id === id.value);
  }

  private indexPath(): string {
    return join(this.home, ".arka-norn", "index", "projects.json");
  }

  private async loadUnlocked(): Promise<readonly ProjectIndexEntry[]> {
    const raw = await this.readIndexSafe();
    return raw === undefined ? [] : raw.entries.map(deserialize);
  }

  private async saveUnlocked(entries: readonly ProjectIndexEntry[]): Promise<void> {
    await writeJsonAtomic(this.indexPath(), { schemaVersion: 2, entries: entries.map(serialize) } satisfies ProjectIndexFileV2, { mode: 0o600 });
  }

  private async readIndexSafe(): Promise<ProjectIndexFileV2 | undefined> {
    let value: unknown;
    try {
      value = await readJson<unknown>(this.indexPath());
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      await this.backupCorruption(error.message);
      return undefined;
    }
    if (value === undefined) return undefined;
    if (!isProjectIndexFile(value)) {
      await this.backupCorruption("schema validation failed");
      return undefined;
    }
    return value;
  }

  private async backupCorruption(reason: string): Promise<void> {
    const raw = await readRaw(this.indexPath());
    if (raw === undefined) return;
    const backupPath = join(this.home, ".arka-norn", "backups", `project-index-${Date.now()}-${randomUUID()}-corruption.json`);
    this.logger?.warn("project-index corruption; using empty cache", { reason, backupPath });
    await writeJsonAtomic(backupPath, { schemaVersion: 1, savedAt: new Date().toISOString(), reason, raw });
  }
}

function serialize(entry: ProjectIndexEntry): ProjectIndexEntryRaw {
  return { id: entry.id, root: entry.root, name: entry.name, updatedAt: entry.updatedAt.toISOString() };
}

function deserialize(entry: ProjectIndexEntryRaw): ProjectIndexEntry {
  return { ...entry, updatedAt: new Date(entry.updatedAt) };
}
