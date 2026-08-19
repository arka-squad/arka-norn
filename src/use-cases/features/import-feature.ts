import { FeatureNotFoundError, ProjectNotFoundError } from "../../domain/errors.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { ImportFeatureInput } from "../../ports/inbound/for-features.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";

export function importFeatureUseCaseFactory(deps: FeaturesDeps) {
  return async (input: ImportFeatureInput): Promise<Feature> => {
    const project = await deps.projectIndexStore.find(input.projectId);
    if (project === undefined) throw new ProjectNotFoundError(input.projectId.value);
    const confined = await deps.pathPolicy.assertContained(project.root, input.root);
    if (!(await deps.featureStore.exists(confined.child))) throw new FeatureNotFoundError(confined.child);
    const feature = await deps.featureStore.load(confined.child);
    if (!feature.belongsTo(input.projectId)) throw new FeatureNotFoundError(`${feature.id.value}: project mismatch`);
    if ((await deps.indexStore.find(feature.id)) === undefined) {
      await deps.indexStore.add({
        id: feature.id.value, projectId: feature.projectId.value, root: feature.root,
        name: feature.name, updatedAt: feature.updatedAt,
      });
    }
    return feature;
  };
}
