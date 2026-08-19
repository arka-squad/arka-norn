import type { Project } from "../../domain/project/project.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export type ListProjectsUseCase = () => Promise<readonly Project[]>;

export function listProjectsUseCaseFactory(deps: ProjectsDeps): ListProjectsUseCase {
  return async () => {
    const projects: Project[] = [];
    for (const entry of await deps.indexStore.load()) {
      try {
        const project = await deps.projectStore.load(entry.root);
        projects.push(project.updatedAt.getTime() === entry.updatedAt.getTime() ? project : project.touched(entry.updatedAt));
      } catch (error) {
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
