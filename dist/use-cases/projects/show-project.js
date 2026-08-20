import { loadProjectById } from "./_shared/verified-project.js";
export function showProjectUseCaseFactory(deps) {
    return async (id) => {
        return loadProjectById(deps, id);
    };
}
//# sourceMappingURL=show-project.js.map