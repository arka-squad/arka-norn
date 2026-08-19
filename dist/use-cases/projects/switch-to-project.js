import { ProjectNotFoundError } from "../../domain/errors.js";
export function switchToProjectUseCaseFactory(deps) {
    return async (id) => {
        const entry = await deps.indexStore.find(id);
        if (entry === undefined)
            throw new ProjectNotFoundError(id.value);
        const now = deps.clock.now();
        const project = (await deps.projectStore.load(entry.root)).touched(now);
        await deps.indexStore.touch(id, now);
        await deps.projectStore.save(project);
        return project;
    };
}
//# sourceMappingURL=switch-to-project.js.map