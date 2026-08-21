import type { Project } from "../../domain/project/project.js";
import type { SetProjectOrchestrationModeInput } from "../../ports/inbound/for-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";
import { loadProjectById } from "./_shared/verified-project.js";

export type SetProjectOrchestrationModeUseCase = (input: SetProjectOrchestrationModeInput) => Promise<Project>;

export function setProjectOrchestrationModeUseCaseFactory(deps: ProjectsDeps): SetProjectOrchestrationModeUseCase {
  return async (input) => {
    const project = await loadProjectById(deps, input.id);
    if (project.orchestrationMode === input.orchestrationMode) return project;

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
