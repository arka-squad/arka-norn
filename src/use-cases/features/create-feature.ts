/**
 * `createFeature` use-case. Port fidèle de createProject
 * (arka-cc-management, core/use-cases/projects/create-project.ts).
 *
 * Sémantique idempotente :
 * 1. featureStore.exists(root) === true ET marker.id === input.id
 *    → no-op + logger.warn + retour de la feature existante. Si l'index
 *      ne contient pas l'entrée (orpheline), on la ré-enregistre.
 * 2. featureStore.exists(root) === true ET marker.id !== input.id
 *    → collision pathologique sur le chemin → FeatureAlreadyExistsError.
 * 3. featureStore.exists(root) === false
 *    → écrit d'abord le marker, source de vérité reconstructible, puis
 *      référence la Feature dans l'index local.
 */
import { FeatureAlreadyExistsError, FeatureNotFoundError } from "../../domain/errors.js";
import { Feature } from "../../domain/feature/feature.js";
import { DEFAULT_PIPELINE_ID } from "../../domain/shared/marker-formats.js";
import type { CreateFeatureInput } from "../../ports/inbound/for-features.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";
import { loadFeatureWithinProject, loadProjectForFeature } from "./_shared/verified-feature.js";

export type CreateFeatureUseCase = (input: CreateFeatureInput) => Promise<Feature>;

export function createFeatureUseCaseFactory(deps: FeaturesDeps): CreateFeatureUseCase {
  const { featureStore, indexStore, clock, logger } = deps;

  return async (input: CreateFeatureInput): Promise<Feature> => {
    const project = await loadProjectForFeature(deps, input.projectId);
    const confined = await deps.pathPolicy.assertContained(project.root, input.root);
    if (!(await deps.filesystem.exists(confined.child))) await deps.filesystem.mkdir(confined.child, { recursive: true });
    if (await featureStore.exists(confined.child)) {
      const existing = await loadFeatureWithinProject(deps, confined.child);
      if (!existing.id.equals(input.id)) {
        throw new FeatureAlreadyExistsError(existing.root);
      }
      if (!existing.belongsTo(input.projectId)) throw new FeatureNotFoundError(`${existing.id.value}: project mismatch`);

      const indexed = await indexStore.find(existing.id);
      if (indexed === undefined) {
        await indexStore.add({
          id: existing.id.value,
          projectId: existing.projectId.value,
          root: existing.root,
          name: existing.name,
          updatedAt: existing.updatedAt,
        });
        logger.warn("createFeature: re-registered orphan feature in index", {
          id: existing.id.value,
          root: existing.root,
        });
      } else {
        logger.warn("createFeature: feature already exists — no-op (idempotent)", {
          id: existing.id.value,
          root: existing.root,
        });
      }
      return existing;
    }

    const now = clock.now();
    const feature = Feature.create({
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      root: confined.child,
      pipelineId: input.pipelineId ?? DEFAULT_PIPELINE_ID,
      schemaVersion: 3,
      createdAt: now,
      updatedAt: now,
    });

    await featureStore.init(feature);
    await indexStore.add({
      id: feature.id.value,
      projectId: feature.projectId.value,
      root: feature.root,
      name: feature.name,
      updatedAt: feature.updatedAt,
    });
    return feature;
  };
}
