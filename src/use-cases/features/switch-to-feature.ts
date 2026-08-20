/**
 * `switchToFeature` use-case. Port fidèle de switchProject
 * (arka-cc-management, core/use-cases/projects/switch-project.ts).
 *
 * Pas de champ `current` explicite dans l'index : la feature courante est
 * implicitement celle dont lastUsedAt est le plus récent. switchTo(id)
 * réalise cette bascule en touchant l'index puis en persistant le nouveau
 * lastUsedAt dans le marker.
 */
import { FeatureNotFoundError } from "../../domain/errors.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";
import { loadIndexedFeatureWithinProject } from "./_shared/verified-feature.js";

export type SwitchToFeatureUseCase = (id: FeatureId) => Promise<Feature>;

export function switchToFeatureUseCaseFactory(deps: FeaturesDeps): SwitchToFeatureUseCase {
  const { featureStore, indexStore, clock } = deps;

  return async (id: FeatureId): Promise<Feature> => {
    const entry = await indexStore.find(id);
    if (entry === undefined) throw new FeatureNotFoundError(id.value);

    const feature = await loadIndexedFeatureWithinProject(deps, entry);
    const now = clock.now();
    const touched = feature.touched(now);
    await featureStore.save(touched);
    await indexStore.touch(id, now);
    return touched;
  };
}
