export function listProjectsUseCaseFactory(deps) {
    return async () => {
        const projects = [];
        for (const entry of await deps.indexStore.load()) {
            try {
                const project = await deps.projectStore.load(entry.root);
                projects.push(project.updatedAt.getTime() === entry.updatedAt.getTime() ? project : project.touched(entry.updatedAt));
            }
            catch (error) {
                deps.logger.warn("listProjects: unreadable marker skipped", {
                    id: entry.id,
                    root: entry.root,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        return projects;
    };
}
//# sourceMappingURL=list-projects.js.map