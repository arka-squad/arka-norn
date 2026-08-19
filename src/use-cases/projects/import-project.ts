import { ProjectNotFoundError } from "../../domain/errors.js";
import type { Project } from "../../domain/project/project.js";
import type { ImportProjectInput } from "../../ports/inbound/for-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export function importProjectUseCaseFactory(deps: ProjectsDeps) {
  return async (input: ImportProjectInput): Promise<Project> => {
    const root = await deps.pathPolicy.canonicalDirectory(input.root);
    if (!(await deps.projectStore.exists(root))) throw new ProjectNotFoundError(root);
    const project = await deps.projectStore.load(root);
    if ((await deps.indexStore.find(project.id)) === undefined) {
      await deps.indexStore.add({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
    }
    return project;
  };
}
