import { loadProjectById } from "./_shared/verified-project.js";
export function switchToProjectUseCaseFactory(deps) {
    return async (id) => {
        const now = deps.clock.now();
        const project = (await loadProjectById(deps, id)).touched(now);
        await deps.indexStore.touch(id, now);
        await deps.projectStore.save(project);
        return project;
    };
}
//# sourceMappingURL=switch-to-project.js.map