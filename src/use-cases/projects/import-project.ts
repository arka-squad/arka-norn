import { ProjectLocationConflictError, ProjectMarkerNotFoundError } from "../../domain/errors.js";
import type { Project } from "../../domain/project/project.js";
import type { ImportProjectInput } from "../../ports/inbound/for-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export function importProjectUseCaseFactory(deps: ProjectsDeps) {
  return async (input: ImportProjectInput): Promise<Project> => {
    const root = await deps.pathPolicy.canonicalDirectory(input.root);
    if (!(await deps.projectStore.exists(root))) throw new ProjectMarkerNotFoundError(root);
    const project = await deps.projectStore.load(root);
    const indexed = await deps.indexStore.find(project.id);
    if (indexed === undefined) {
      await deps.indexStore.add({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
    } else if (indexed.root !== project.root) {
      let duplicateIsActive = false;
      try {
        duplicateIsActive = (await deps.projectStore.load(indexed.root)).id.equals(project.id);
      } catch {
        duplicateIsActive = false;
      }
      if (duplicateIsActive) throw new ProjectLocationConflictError(project.id.value, indexed.root, project.root);
      await deps.indexStore.upsert({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
    }
    return project;
  };
}
