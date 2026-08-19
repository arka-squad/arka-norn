import type { ProjectId } from "../../domain/project/project-id.js";

export interface ProjectIndexEntry {
  readonly id: string;
  readonly root: string;
  readonly name: string;
  readonly updatedAt: Date;
}

export interface ProjectIndexStore {
  load(): Promise<readonly ProjectIndexEntry[]>;
  save(entries: readonly ProjectIndexEntry[]): Promise<void>;
  add(entry: ProjectIndexEntry): Promise<void>;
  remove(id: ProjectId): Promise<void>;
  touch(id: ProjectId, at: Date): Promise<void>;
  find(id: ProjectId): Promise<ProjectIndexEntry | undefined>;
}
