import { FeatureNotFoundError } from "../../domain/errors.js";
import { loadIndexedFeatureWithinProject } from "./_shared/verified-feature.js";
export function showFeatureUseCaseFactory(deps) {
    return async (id) => {
        const entry = await deps.indexStore.find(id);
        if (entry === undefined)
            throw new FeatureNotFoundError(id.value);
        return loadIndexedFeatureWithinProject(deps, entry);
    };
}
//# sourceMappingURL=show-feature.js.map