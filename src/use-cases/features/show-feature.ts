import { FeatureNotFoundError } from "../../domain/errors.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";

export function showFeatureUseCaseFactory(deps: FeaturesDeps) {
  return async (id: FeatureId): Promise<Feature> => {
    const entry = await deps.indexStore.find(id);
    if (entry === undefined) throw new FeatureNotFoundError(id.value);
    return deps.featureStore.load(entry.root);
  };
}
