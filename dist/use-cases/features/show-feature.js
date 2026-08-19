import { FeatureNotFoundError } from "../../domain/errors.js";
export function showFeatureUseCaseFactory(deps) {
    return async (id) => {
        const entry = await deps.indexStore.find(id);
        if (entry === undefined)
            throw new FeatureNotFoundError(id.value);
        return deps.featureStore.load(entry.root);
    };
}
//# sourceMappingURL=show-feature.js.map