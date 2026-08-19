/**
 * `listFeatures` use-case. Port fidèle de listProjects
 * (arka-cc-management, core/use-cases/projects/list-projects.ts).
 *
 * Lit l'index et réhydrate chaque entrée via featureStore.load(entry.root).
 * Tri déjà assuré par l'index (lastUsedAt desc, ties par id asc).
 * Cas dégradé : entrée d'index dont le marker est absent → log warn + skip.
 * Source de vérité lastUsedAt = l'index (peut être plus récent que le
 * marker si la propagation a été interrompue).
 */
import type { Feature } from "../../domain/feature/feature.js";
import { mapConcurrent } from "../../application/shared/map-concurrent.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";

export type ListFeaturesUseCase = () => Promise<readonly Feature[]>;

export function listFeaturesUseCaseFactory(deps: FeaturesDeps): ListFeaturesUseCase {
  const { featureStore, indexStore, logger } = deps;

  return async (): Promise<readonly Feature[]> => {
    const entries = await indexStore.load();
    const features = await mapConcurrent(entries, 8, async (entry): Promise<Feature | undefined> => {
      try {
        const feature = await featureStore.load(entry.root);
        const reconciled =
          feature.updatedAt.getTime() === entry.updatedAt.getTime() ? feature : feature.touched(entry.updatedAt);
        return reconciled;
      } catch (err) {
        logger.warn("listFeatures: index entry has no readable marker — skipped", {
          id: entry.id,
          root: entry.root,
          error: err instanceof Error ? err.message : String(err),
        });
        return undefined;
      }
    });
    return features.filter((feature): feature is Feature => feature !== undefined);
  };
}
