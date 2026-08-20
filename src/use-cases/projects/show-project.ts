import type { Project } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";
import { loadProjectById } from "./_shared/verified-project.js";

export function showProjectUseCaseFactory(deps: ProjectsDeps) {
  return async (id: ProjectId): Promise<Project> => {
    return loadProjectById(deps, id);
  };
}
