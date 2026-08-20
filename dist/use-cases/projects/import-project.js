import { ProjectLocationConflictError, ProjectMarkerNotFoundError } from "../../domain/errors.js";
import { loadIndexedProject } from "./_shared/verified-project.js";
export function importProjectUseCaseFactory(deps) {
    return async (input) => {
        const root = await deps.pathPolicy.canonicalDirectory(input.root);
        if (!(await deps.projectStore.exists(root)))
            throw new ProjectMarkerNotFoundError(root);
        const project = await deps.projectStore.load(root);
        const indexed = await deps.indexStore.find(project.id);
        if (indexed === undefined) {
            await deps.indexStore.add({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
        }
        else if (indexed.root !== project.root) {
            let duplicateIsActive = false;
            try {
                duplicateIsActive = (await loadIndexedProject(deps, indexed)).id.equals(project.id);
            }
            catch {
                duplicateIsActive = false;
            }
            if (duplicateIsActive)
                throw new ProjectLocationConflictError(project.id.value, indexed.root, project.root);
            await deps.indexStore.upsert({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
        }
        return project;
    };
}
//# sourceMappingURL=import-project.js.map