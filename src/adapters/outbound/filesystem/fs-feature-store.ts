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
import { join } from "node:path";

import { FeatureAlreadyExistsError, FeatureMarkerNotFoundError, PathSecurityError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { Feature } from "../../../domain/feature/feature.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import {
  type FeatureMarkerV3,
  type FeatureMarkerV4,
  isFeatureMarkerV3,
  isFeatureMarkerV4,
  planFeatureMarkerMigration,
} from "../../../domain/shared/marker-formats.js";
import type { FeatureStore } from "../../../ports/outbound/feature-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { FsPathPolicy } from "./fs-path-policy.js";

export class FsFeatureStore implements FeatureStore {
  private readonly paths: PathPolicy;

  public constructor(paths: PathPolicy = new FsPathPolicy()) {
    this.paths = paths;
  }

  public async exists(root: string): Promise<boolean> {
    return existsFile(markerPath(root));
  }

  public async hasLegacyMarker(root: string): Promise<boolean> {
    await rejectMarkerDirectorySymlink(root);
    const value = await readJson<unknown>(markerPath(root));
    return typeof value === "object" && value !== null && "version" in value && value.version === 1;
  }

  public async init(feature: Feature): Promise<void> {
    await this.paths.assertMarkerRoot(feature.root, feature.root);
    await rejectMarkerDirectorySymlink(feature.root);
    if (await this.exists(feature.root)) throw new FeatureAlreadyExistsError(feature.root);
    await writeJsonAtomic(markerPath(feature.root), serialize(feature), { mode: 0o644, exclusive: true });
  }

  public async load(root: string): Promise<Feature> {
    await rejectMarkerDirectorySymlink(root);
    const value = await readJson<unknown>(markerPath(root));
    if (value === undefined) throw new FeatureMarkerNotFoundError(root);
    const marker = isFeatureMarkerV4(value) || isFeatureMarkerV3(value) ? value : planFeatureMarkerMigration(value).output;
    const canonicalRoot = await this.paths.assertMarkerRoot(root, root);
    return Feature.create({
      id: FeatureId.of(marker.id),
      projectId: ProjectId.of(marker.projectId),
      name: marker.name,
      root: canonicalRoot,
      pipelineId: marker.pipelineId,
      schemaVersion: marker.schemaVersion,
      documentContractVersion: marker.schemaVersion === 4 ? marker.documentContractVersion : 3,
      createdAt: new Date(marker.createdAt),
      updatedAt: new Date(marker.updatedAt),
    });
  }

  public async save(feature: Feature): Promise<void> {
    await this.paths.assertMarkerRoot(feature.root, feature.root);
    await rejectMarkerDirectorySymlink(feature.root);
    await writeJsonAtomic(markerPath(feature.root), serialize(feature), { mode: 0o644 });
  }
}

function serialize(feature: Feature): FeatureMarkerV3 | FeatureMarkerV4 {
  const common = {
    id: feature.id.value,
    projectId: feature.projectId.value,
    name: feature.name,
    pipelineId: feature.pipelineId,
    createdAt: feature.createdAt.toISOString(),
    updatedAt: feature.updatedAt.toISOString(),
  };
  return feature.schemaVersion === 4
    ? { schemaVersion: 4, ...common, documentContractVersion: 5 }
    : { schemaVersion: 3, ...common };
}

function markerPath(root: string): string {
  return join(root, ".arka-norn", "feature.json");
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
