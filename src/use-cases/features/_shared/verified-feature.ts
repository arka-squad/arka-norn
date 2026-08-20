import { PathSecurityError, ProjectNotFoundError } from "../../../domain/errors.js";
import type { Feature } from "../../../domain/feature/feature.js";
import type { Project } from "../../../domain/project/project.js";
import type { ProjectId } from "../../../domain/project/project-id.js";
import type { FeatureIndexEntry } from "../../../ports/outbound/feature-index-store.js";
import type { FeaturesDeps } from "./features-deps.js";

/**
 * Revalide la relation de possession au moment de lire un marker Feature.
 * L'index et le marker sont tous deux non fiables : aucun appelant ne doit
 * réutiliser une racine Feature avant cette vérification.
 */
export async function loadFeatureWithinProject(deps: FeaturesDeps, root: string): Promise<Feature> {
  const feature = await deps.featureStore.load(root);
  const project = await loadProjectForFeature(deps, feature.projectId);
  await deps.pathPolicy.assertContained(project.root, feature.root);
  return feature;
}

export async function loadProjectForFeature(deps: FeaturesDeps, id: ProjectId): Promise<Project> {
  const entry = await deps.projectIndexStore.find(id);
  if (entry === undefined) throw new ProjectNotFoundError(id.value);
  const project = await deps.projectStore.load(entry.root);
  if (!project.id.equals(id)) {
    throw new PathSecurityError(entry.root, `project marker identity does not match index entry ${entry.id}`);
  }
  return project;
}

export async function loadIndexedFeatureWithinProject(deps: FeaturesDeps, entry: FeatureIndexEntry): Promise<Feature> {
  const feature = await loadFeatureWithinProject(deps, entry.root);
  if (feature.id.value !== entry.id || feature.projectId.value !== entry.projectId) {
    throw new PathSecurityError(entry.root, `feature marker identity does not match index entry ${entry.id}`);
  }
  return feature;
}
