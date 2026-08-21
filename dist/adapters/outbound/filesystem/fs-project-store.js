import * as fs from "node:fs/promises";
import { join } from "node:path";
import { PathSecurityError, ProjectAlreadyExistsError, ProjectMarkerNotFoundError } from "../../../domain/errors.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { Project } from "../../../domain/project/project.js";
import { planProjectMarkerMigration, } from "../../../domain/shared/marker-formats.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsProjectStore {
    paths;
    constructor(paths = new FsPathPolicy()) {
        this.paths = paths;
    }
    async exists(root) {
        return (await existsFile(projectMarkerPath(root))) || (await this.hasLegacyMarker(root));
    }
    async hasLegacyMarker(root) {
        return existsFile(legacyMarkerPath(root));
    }
    async init(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
        if (await this.exists(project.root))
            throw new ProjectAlreadyExistsError(project.root);
        await writeJsonAtomic(projectMarkerPath(project.root), serialize(project), { mode: 0o644, exclusive: true });
    }
    async load(root) {
        await rejectMarkerDirectorySymlink(root);
        const current = await readJson(projectMarkerPath(root));
        let marker;
        if (current !== undefined) {
            marker = planProjectMarkerMigration(current).output;
        }
        else {
            const legacy = await readJson(legacyMarkerPath(root));
            if (legacy === undefined)
                throw new ProjectMarkerNotFoundError(root);
            marker = planProjectMarkerMigration(legacy).output;
        }
        const canonicalRoot = await this.paths.assertMarkerRoot(root, root);
        return Project.create({
            id: ProjectId.of(marker.id),
            name: marker.name,
            root: canonicalRoot,
            schemaVersion: marker.schemaVersion,
            orchestrationMode: marker.orchestrationMode,
            createdAt: new Date(marker.createdAt),
            updatedAt: new Date(marker.updatedAt),
        });
    }
    async save(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
        await writeJsonAtomic(projectMarkerPath(project.root), serialize(project), { mode: 0o644 });
    }
}
function serialize(project) {
    return {
        schemaVersion: 4,
        id: project.id.value,
        name: project.name,
        orchestrationMode: project.orchestrationMode,
        createdAt: project.createdAt.toISOString(),
        updatedAt: project.updatedAt.toISOString(),
    };
}
function projectMarkerPath(root) {
    return join(root, ".arka-norn", "project.json");
}
function legacyMarkerPath(root) {
    return join(root, ".arka-norn", "depot.json");
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
//# sourceMappingURL=fs-project-store.js.map