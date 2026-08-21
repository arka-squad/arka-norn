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
import { FeatureLocationConflictError, FeatureMarkerNotFoundError, FeatureNotFoundError } from "../../domain/errors.js";
import { loadFeatureWithinProject, loadIndexedFeatureWithinProject, loadProjectForFeature } from "./_shared/verified-feature.js";
export function importFeatureUseCaseFactory(deps) {
    return async (input) => {
        const project = await loadProjectForFeature(deps, input.projectId);
        const confined = await deps.pathPolicy.assertContained(project.root, input.root);
        if (!(await deps.featureStore.exists(confined.child)))
            throw new FeatureMarkerNotFoundError(confined.child);
        const feature = await loadFeatureWithinProject(deps, confined.child);
        if (!feature.belongsTo(input.projectId))
            throw new FeatureNotFoundError(`${feature.id.value}: project mismatch`);
        const indexed = await deps.indexStore.find(feature.id);
        if (indexed === undefined) {
            await deps.indexStore.add({
                id: feature.id.value, projectId: feature.projectId.value, root: feature.root,
                name: feature.name, updatedAt: feature.updatedAt,
            });
        }
        else if (indexed.root !== feature.root) {
            let duplicateIsActive = false;
            try {
                duplicateIsActive = (await loadIndexedFeatureWithinProject(deps, indexed)).id.equals(feature.id);
            }
            catch {
                duplicateIsActive = false;
            }
            if (duplicateIsActive)
                throw new FeatureLocationConflictError(feature.id.value, indexed.root, feature.root);
            await deps.indexStore.upsert({
                id: feature.id.value, projectId: feature.projectId.value, root: feature.root,
                name: feature.name, updatedAt: feature.updatedAt,
            });
        }
        return feature;
    };
}
//# sourceMappingURL=import-feature.js.map