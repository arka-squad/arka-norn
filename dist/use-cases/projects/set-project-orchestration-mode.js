import { loadProjectById } from "./_shared/verified-project.js";
export function setProjectOrchestrationModeUseCaseFactory(deps) {
    return async (input) => {
        const project = await loadProjectById(deps, input.id);
        if (project.orchestrationMode === input.orchestrationMode)
            return project;
        const updated = project.withOrchestrationMode(input.orchestrationMode, deps.clock.now());
        await deps.projectStore.save(updated);
        await deps.indexStore.upsert({
            id: updated.id.value,
            root: updated.root,
            name: updated.name,
            updatedAt: updated.updatedAt,
        });
        return updated;
    };
}
//# sourceMappingURL=set-project-orchestration-mode.js.map