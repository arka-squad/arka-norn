import { PathSecurityError, ProjectNotFoundError } from "../../../domain/errors.js";
import type { Project } from "../../../domain/project/project.js";
import type { ProjectId } from "../../../domain/project/project-id.js";
import type { ProjectIndexEntry } from "../../../ports/outbound/project-index-store.js";
import type { ProjectsDeps } from "./projects-deps.js";

/**
 * Revalide un Project indexé contre son marker portable avant toute lecture
 * ou écriture. L'index local est un cache non fiable et ne peut jamais
 * redéfinir l'identité ou la racine réelle d'un Project.
 */
export async function loadIndexedProject(deps: ProjectsDeps, entry: ProjectIndexEntry): Promise<Project> {
  const project = await deps.projectStore.load(entry.root);
  if (project.id.value !== entry.id) {
    throw new PathSecurityError(entry.root, `project marker identity does not match index entry ${entry.id}`);
  }
  return project;
}

export async function loadProjectById(deps: ProjectsDeps, id: ProjectId): Promise<Project> {
  const entry = await deps.indexStore.find(id);
  if (entry === undefined) throw new ProjectNotFoundError(id.value);
  return loadIndexedProject(deps, entry);
}
