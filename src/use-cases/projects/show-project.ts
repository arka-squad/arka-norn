import { ProjectNotFoundError } from "../../domain/errors.js";
import type { Project } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export function showProjectUseCaseFactory(deps: ProjectsDeps) {
  return async (id: ProjectId): Promise<Project> => {
    const entry = await deps.indexStore.find(id);
    if (entry === undefined) throw new ProjectNotFoundError(id.value);
    return deps.projectStore.load(entry.root);
  };
}
