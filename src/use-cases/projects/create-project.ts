import { ProjectAlreadyExistsError } from "../../domain/errors.js";
import { Project } from "../../domain/project/project.js";
import type { CreateProjectInput } from "../../ports/inbound/for-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";

export type CreateProjectUseCase = (input: CreateProjectInput) => Promise<Project>;

export function createProjectUseCaseFactory(deps: ProjectsDeps): CreateProjectUseCase {
  return async (input) => {
    const canonicalRoot = await deps.pathPolicy.canonicalDirectory(input.root);
    if (await deps.projectStore.exists(canonicalRoot)) {
      const existing = await deps.projectStore.load(canonicalRoot);
      if (!existing.id.equals(input.id)) throw new ProjectAlreadyExistsError(existing.root);
      if ((await deps.indexStore.find(existing.id)) === undefined) {
        await deps.indexStore.add(toIndexEntry(existing));
        deps.logger.warn("createProject: re-registered orphan project", { id: existing.id.value, root: existing.root });
      }
      return existing;
    }

    const now = deps.clock.now();
    const project = Project.create({
      id: input.id,
      name: input.name,
      root: canonicalRoot,
      schemaVersion: 2,
      createdAt: now,
      updatedAt: now,
    });
    try {
      await deps.projectStore.init(project);
      await deps.indexStore.add(toIndexEntry(project));
    } catch (error) {
      throw error;
    }
    return project;
  };
}

function toIndexEntry(project: Project) {
  return { id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt };
}
