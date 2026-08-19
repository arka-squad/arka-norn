export function listFeaturesUseCaseFactory(deps) {
    const { featureStore, indexStore, logger } = deps;
    return async () => {
        const entries = await indexStore.load();
        const features = [];
        for (const entry of entries) {
            try {
                const feature = await featureStore.load(entry.root);
                const reconciled = feature.updatedAt.getTime() === entry.updatedAt.getTime() ? feature : feature.touched(entry.updatedAt);
                features.push(reconciled);
            }
            catch (err) {
                logger.warn("listFeatures: index entry has no readable marker — skipped", {
                    id: entry.id,
                    root: entry.root,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
        }
        return features;
    };
}
//# sourceMappingURL=list-features.js.map