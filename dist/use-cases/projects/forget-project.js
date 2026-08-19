import { ProjectNotFoundError } from "../../domain/errors.js";
export function forgetProjectUseCaseFactory(deps) {
    return async (id) => {
        const entry = await deps.indexStore.find(id);
        if (entry === undefined)
            throw new ProjectNotFoundError(id.value);
        await deps.indexStore.remove(id);
        deps.logger.info("forgetProject: project removed from index; filesystem untouched", { id: id.value, root: entry.root });
    };
}
//# sourceMappingURL=forget-project.js.map