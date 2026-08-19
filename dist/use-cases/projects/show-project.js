import { ProjectNotFoundError } from "../../domain/errors.js";
export function showProjectUseCaseFactory(deps) {
    return async (id) => {
        const entry = await deps.indexStore.find(id);
        if (entry === undefined)
            throw new ProjectNotFoundError(id.value);
        return deps.projectStore.load(entry.root);
    };
}
//# sourceMappingURL=show-project.js.map