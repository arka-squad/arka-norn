import { ProjectAlreadyExistsError } from "../../domain/errors.js";
import { Project } from "../../domain/project/project.js";
export function createProjectUseCaseFactory(deps) {
    return async (input) => {
        const canonicalRoot = await deps.pathPolicy.canonicalDirectory(input.root);
        if (await deps.projectStore.exists(canonicalRoot)) {
            const existing = await deps.projectStore.load(canonicalRoot);
            if (!existing.id.equals(input.id))
                throw new ProjectAlreadyExistsError(existing.root);
            if ((await deps.indexStore.find(existing.id)) === undefined) {
                await deps.indexStore.add(toIndexEntry(existing));
                deps.logger.warn("createProject: re-registered orphan project", { id: existing.id.value, root: existing.root });
            }
            return existing;
        }
        const now = deps.clock.now();
        const project = Project.create({
            id: input.id,
            name: input.name,
            root: canonicalRoot,
            schemaVersion: 3,
            createdAt: now,
            updatedAt: now,
        });
        try {
            await deps.projectStore.init(project);
            await deps.indexStore.add(toIndexEntry(project));
        }
        catch (error) {
            throw error;
        }
        return project;
    };
}
function toIndexEntry(project) {
    return { id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt };
}
//# sourceMappingURL=create-project.js.map