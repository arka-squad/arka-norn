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

import type { Feature } from "../../domain/feature/feature.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import { mapConcurrent } from "../../application/shared/map-concurrent.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";
import { loadIndexedFeatureWithinProject } from "./_shared/verified-feature.js";

export type ListFeaturesUseCase = (projectId?: ProjectId) => Promise<readonly Feature[]>;

export function listFeaturesUseCaseFactory(deps: FeaturesDeps): ListFeaturesUseCase {
  const { indexStore, logger } = deps;

  return async (projectId): Promise<readonly Feature[]> => {
    const entries = (await indexStore.load()).filter((entry) => projectId === undefined || entry.projectId === projectId.value);
    const features = await mapConcurrent(entries, 8, async (entry): Promise<Feature | undefined> => {
      try {
        const feature = await loadIndexedFeatureWithinProject(deps, entry);
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
