import { FeatureLocationConflictError, FeatureMarkerNotFoundError, FeatureNotFoundError, ProjectNotFoundError } from "../../domain/errors.js";
export function importFeatureUseCaseFactory(deps) {
    return async (input) => {
        const project = await deps.projectIndexStore.find(input.projectId);
        if (project === undefined)
            throw new ProjectNotFoundError(input.projectId.value);
        const confined = await deps.pathPolicy.assertContained(project.root, input.root);
        if (!(await deps.featureStore.exists(confined.child)))
            throw new FeatureMarkerNotFoundError(confined.child);
        const feature = await deps.featureStore.load(confined.child);
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
                duplicateIsActive = (await deps.featureStore.load(indexed.root)).id.equals(feature.id);
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