import * as fs from "node:fs/promises";
import { join } from "node:path";

import { PathSecurityError, ProjectAlreadyExistsError, ProjectNotFoundError } from "../../../domain/errors.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { Project } from "../../../domain/project/project.js";
import {
  type ProjectMarkerV2,
  isProjectMarkerV2,
  planProjectMarkerMigration,
} from "../../../domain/shared/marker-formats.js";
import type { ProjectStore } from "../../../ports/outbound/project-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { FsPathPolicy } from "./fs-path-policy.js";

export class FsProjectStore implements ProjectStore {
  private readonly paths: PathPolicy;

  public constructor(paths: PathPolicy = new FsPathPolicy()) {
    this.paths = paths;
  }

  public async exists(root: string): Promise<boolean> {
    return (await existsFile(projectMarkerPath(root))) || (await this.hasLegacyMarker(root));
  }

  public async hasLegacyMarker(root: string): Promise<boolean> {
    return existsFile(legacyMarkerPath(root));
  }

  public async init(project: Project): Promise<void> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    await rejectMarkerDirectorySymlink(project.root);
    if (await this.exists(project.root)) throw new ProjectAlreadyExistsError(project.root);
    await writeJsonAtomic(projectMarkerPath(project.root), serialize(project), { mode: 0o644, exclusive: true });
  }

  public async load(root: string): Promise<Project> {
    const current = await readJson<unknown>(projectMarkerPath(root));
    let marker: ProjectMarkerV2;
    if (current !== undefined) {
      if (!isProjectMarkerV2(current)) throw new ProjectNotFoundError(root);
      marker = current;
    } else {
      const legacy = await readJson<unknown>(legacyMarkerPath(root));
      if (legacy === undefined) throw new ProjectNotFoundError(root);
      marker = planProjectMarkerMigration(legacy).output;
    }
    const canonicalRoot = await this.paths.assertMarkerRoot(marker.root, root);
    return Project.create({
      id: ProjectId.of(marker.id),
      name: marker.name,
      root: canonicalRoot,
      schemaVersion: marker.schemaVersion,
      createdAt: new Date(marker.createdAt),
      updatedAt: new Date(marker.updatedAt),
    });
  }

  public async save(project: Project): Promise<void> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    await rejectMarkerDirectorySymlink(project.root);
    await writeJsonAtomic(projectMarkerPath(project.root), serialize(project), { mode: 0o644 });
  }
}

function serialize(project: Project): ProjectMarkerV2 {
  return {
    schemaVersion: 2,
    id: project.id.value,
    name: project.name,
    root: project.root,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

function projectMarkerPath(root: string): string {
  return join(root, ".arka-norn", "project.json");
}

function legacyMarkerPath(root: string): string {
  return join(root, ".arka-norn", "depot.json");
}

async function existsFile(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

async function rejectMarkerDirectorySymlink(root: string): Promise<void> {
  try {
    const stat = await fs.lstat(join(root, ".arka-norn"));
    if (stat.isSymbolicLink()) throw new PathSecurityError(join(root, ".arka-norn"), "symbolic-link marker directories are forbidden");
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
}
