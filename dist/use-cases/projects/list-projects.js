import { mapConcurrent } from "../../application/shared/map-concurrent.js";
export function listProjectsUseCaseFactory(deps) {
    return async () => {
        const entries = await deps.indexStore.load();
        const projects = await mapConcurrent(entries, 8, async (entry) => {
            try {
                const project = await deps.projectStore.load(entry.root);
                return project.updatedAt.getTime() === entry.updatedAt.getTime() ? project : project.touched(entry.updatedAt);
            }
            catch (error) {
                deps.logger.warn("listProjects: unreadable marker skipped", {
                    id: entry.id,
                    root: entry.root,
                    error: error instanceof Error ? error.message : String(error),
                });
                return undefined;
            }
        });
        return projects.filter((project) => project !== undefined);
    };
}
//# sourceMappingURL=list-projects.js.map