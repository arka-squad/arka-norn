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
import { isFeatureMarkerV3, isFeatureMarkerV4, isFeatureMarkerV5, planFeatureMarkerMigration, } from "../../../domain/shared/marker-formats.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsFeatureStore {
    paths;
    constructor(paths = new FsPathPolicy()) {
        this.paths = paths;
    }
    async exists(root) {
        return existsFile(markerPath(root));
    }
    async hasLegacyMarker(root) {
        await rejectMarkerDirectorySymlink(root);
        const value = await readJson(markerPath(root));
        return typeof value === "object" && value !== null && "version" in value && value.version === 1;
    }
    async init(feature) {
        await this.paths.assertMarkerRoot(feature.root, feature.root);
        await rejectMarkerDirectorySymlink(feature.root);
        if (await this.exists(feature.root))
            throw new FeatureAlreadyExistsError(feature.root);
        await writeJsonAtomic(markerPath(feature.root), serialize(feature), { mode: 0o644, exclusive: true });
    }
    async load(root) {
        await rejectMarkerDirectorySymlink(root);
        const value = await readJson(markerPath(root));
        if (value === undefined)
            throw new FeatureMarkerNotFoundError(root);
        const marker = isFeatureMarkerV5(value) || isFeatureMarkerV4(value) || isFeatureMarkerV3(value) ? value : planFeatureMarkerMigration(value).output;
        const canonicalRoot = await this.paths.assertMarkerRoot(root, root);
        return Feature.create({
            id: FeatureId.of(marker.id),
            projectId: ProjectId.of(marker.projectId),
            name: marker.name,
            root: canonicalRoot,
            pipelineId: marker.pipelineId,
            schemaVersion: marker.schemaVersion,
            documentContractVersion: marker.schemaVersion === 3 ? 3 : marker.documentContractVersion,
            ...(marker.schemaVersion === 5 ? { pipelineDefinitionVersion: marker.pipelineDefinitionVersion, framingPlanRef: marker.framingPlanRef } : {}),
            createdAt: new Date(marker.createdAt),
            updatedAt: new Date(marker.updatedAt),
        });
    }
    async save(feature) {
        await this.paths.assertMarkerRoot(feature.root, feature.root);
        await rejectMarkerDirectorySymlink(feature.root);
        await writeJsonAtomic(markerPath(feature.root), serialize(feature), { mode: 0o644 });
    }
}
function serialize(feature) {
    const common = {
        id: feature.id.value,
        projectId: feature.projectId.value,
        name: feature.name,
        pipelineId: feature.pipelineId,
        createdAt: feature.createdAt.toISOString(),
        updatedAt: feature.updatedAt.toISOString(),
    };
    if (feature.schemaVersion === 5) {
        if (feature.framingPlanRef === null)
            throw new Error("Feature v5 requires its framing plan reference.");
        return { schemaVersion: 5, ...common, documentContractVersion: 5, pipelineDefinitionVersion: "2.3", framingPlanRef: feature.framingPlanRef };
    }
    return feature.schemaVersion === 4
        ? { schemaVersion: 4, ...common, documentContractVersion: 5 }
        : { schemaVersion: 3, ...common };
}
function markerPath(root) {
    return join(root, ".arka-norn", "feature.json");
}
async function existsFile(path) {
    try {
        await fs.access(path);
        return true;
    }
    catch {
        return false;
    }
}
async function rejectMarkerDirectorySymlink(root) {
    try {
        const stat = await fs.lstat(join(root, ".arka-norn"));
        if (stat.isSymbolicLink())
            throw new PathSecurityError(join(root, ".arka-norn"), "symbolic-link marker directories are forbidden");
    }
    catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
            throw error;
    }
}
//# sourceMappingURL=fs-feature-store.js.map