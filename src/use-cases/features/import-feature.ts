import { FeatureLocationConflictError, FeatureMarkerNotFoundError, FeatureNotFoundError } from "../../domain/errors.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { ImportFeatureInput } from "../../ports/inbound/for-features.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";
import { loadFeatureWithinProject, loadIndexedFeatureWithinProject, loadProjectForFeature } from "./_shared/verified-feature.js";

export function importFeatureUseCaseFactory(deps: FeaturesDeps) {
  return async (input: ImportFeatureInput): Promise<Feature> => {
    const project = await loadProjectForFeature(deps, input.projectId);
    const confined = await deps.pathPolicy.assertContained(project.root, input.root);
    if (!(await deps.featureStore.exists(confined.child))) throw new FeatureMarkerNotFoundError(confined.child);
    const feature = await loadFeatureWithinProject(deps, confined.child);
    if (!feature.belongsTo(input.projectId)) throw new FeatureNotFoundError(`${feature.id.value}: project mismatch`);
    const indexed = await deps.indexStore.find(feature.id);
    if (indexed === undefined) {
      await deps.indexStore.add({
        id: feature.id.value, projectId: feature.projectId.value, root: feature.root,
        name: feature.name, updatedAt: feature.updatedAt,
      });
    } else if (indexed.root !== feature.root) {
      let duplicateIsActive = false;
      try {
        duplicateIsActive = (await loadIndexedFeatureWithinProject(deps, indexed)).id.equals(feature.id);
      } catch {
        duplicateIsActive = false;
      }
      if (duplicateIsActive) throw new FeatureLocationConflictError(feature.id.value, indexed.root, feature.root);
      await deps.indexStore.upsert({
        id: feature.id.value, projectId: feature.projectId.value, root: feature.root,
        name: feature.name, updatedAt: feature.updatedAt,
      });
    }
    return feature;
  };
}
