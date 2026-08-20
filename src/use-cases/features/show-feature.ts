import { FeatureNotFoundError } from "../../domain/errors.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";
import { loadIndexedFeatureWithinProject } from "./_shared/verified-feature.js";

export function showFeatureUseCaseFactory(deps: FeaturesDeps) {
  return async (id: FeatureId): Promise<Feature> => {
    const entry = await deps.indexStore.find(id);
    if (entry === undefined) throw new FeatureNotFoundError(id.value);
    return loadIndexedFeatureWithinProject(deps, entry);
  };
}
