import { ProjectNotFoundError } from "../../domain/errors.js";
export function importProjectUseCaseFactory(deps) {
    return async (input) => {
        const root = await deps.pathPolicy.canonicalDirectory(input.root);
        if (!(await deps.projectStore.exists(root)))
            throw new ProjectNotFoundError(root);
        const project = await deps.projectStore.load(root);
        if ((await deps.indexStore.find(project.id)) === undefined) {
            await deps.indexStore.add({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
        }
        return project;
    };
}
//# sourceMappingURL=import-project.js.map