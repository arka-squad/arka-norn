import { mapConcurrent } from "../../application/shared/map-concurrent.js";
import { loadIndexedFeatureWithinProject } from "./_shared/verified-feature.js";
export function listFeaturesUseCaseFactory(deps) {
    const { indexStore, logger } = deps;
    return async (projectId) => {
        const entries = (await indexStore.load()).filter((entry) => projectId === undefined || entry.projectId === projectId.value);
        const features = await mapConcurrent(entries, 8, async (entry) => {
            try {
                const feature = await loadIndexedFeatureWithinProject(deps, entry);
                const reconciled = feature.updatedAt.getTime() === entry.updatedAt.getTime() ? feature : feature.touched(entry.updatedAt);
                return reconciled;
            }
            catch (err) {
                logger.warn("listFeatures: index entry has no readable marker — skipped", {
                    id: entry.id,
                    root: entry.root,
                    error: err instanceof Error ? err.message : String(err),
                });
                return undefined;
            }
        });
        return features.filter((feature) => feature !== undefined);
    };
}
//# sourceMappingURL=list-features.js.map