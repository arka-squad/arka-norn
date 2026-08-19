import { ProjectNotFoundError } from "../../domain/errors.js";
import type { Project } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export type SwitchToProjectUseCase = (id: ProjectId) => Promise<Project>;

export function switchToProjectUseCaseFactory(deps: ProjectsDeps): SwitchToProjectUseCase {
  return async (id) => {
    const entry = await deps.indexStore.find(id);
    if (entry === undefined) throw new ProjectNotFoundError(id.value);
    const now = deps.clock.now();
    const project = (await deps.projectStore.load(entry.root)).touched(now);
    await deps.indexStore.touch(id, now);
    await deps.projectStore.save(project);
    return project;
  };
}
