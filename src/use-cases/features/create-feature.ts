/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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

    const defaultPipelineId = deps.resolveDefaultPipelineId === undefined
      ? DEFAULT_PIPELINE_ID
      : await deps.resolveDefaultPipelineId();
    const now = clock.now();
    const framed = input.framingPlanRef !== undefined;
    const feature = Feature.create({
      id: input.id,
      projectId: input.projectId,
      name: input.name,
      root: confined.child,
      pipelineId: input.pipelineId ?? defaultPipelineId,
      schemaVersion: framed ? 5 : 4,
      documentContractVersion: 5,
      ...(framed ? { pipelineDefinitionVersion: input.pipelineDefinitionVersion ?? "2.3", framingPlanRef: input.framingPlanRef } : {}),
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
