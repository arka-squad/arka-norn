import type { Project } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";
import { loadProjectById } from "./_shared/verified-project.js";

export type SwitchToProjectUseCase = (id: ProjectId) => Promise<Project>;

export function switchToProjectUseCaseFactory(deps: ProjectsDeps): SwitchToProjectUseCase {
  return async (id) => {
    const now = deps.clock.now();
    const project = (await loadProjectById(deps, id)).touched(now);
    await deps.indexStore.touch(id, now);
    await deps.projectStore.save(project);
    return project;
  };
}
