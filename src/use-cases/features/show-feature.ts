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
