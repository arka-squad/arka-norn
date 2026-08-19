export function scanFeaturesUseCaseFactory(deps) {
    const { featureStore, indexStore, filesystem, logger } = deps;
    return async (options) => {
        const requestedTarget = options?.target ?? filesystem.homeDir();
        let target;
        try {
            target = await deps.pathPolicy.canonicalDirectory(requestedTarget);
            if (options?.projectId !== undefined) {
                const project = await deps.projectIndexStore.find(options.projectId);
                if (project === undefined)
                    return [];
                const canonicalProject = await deps.pathPolicy.canonicalDirectory(project.root);
                if (target !== canonicalProject)
                    await deps.pathPolicy.assertContained(canonicalProject, target);
            }
        }
        catch (err) {
            logger.warn("scanFeatures: unsafe scan target", { target: requestedTarget, error: err instanceof Error ? err.message : String(err) });
            return [];
        }
        let children;
        try {
            children = await filesystem.readDir(target);
        }
        catch (err) {
            logger.warn("scanFeatures: scan target unreadable", {
                target,
                error: err instanceof Error ? err.message : String(err),
            });
            return [];
        }
        const results = [];
        for (const name of children) {
            const root = filesystem.resolve(target, name);
            let isDir = false;
            try {
                const s = await filesystem.stat(root);
                isDir = s.isDirectory;
            }
            catch {
                continue;
            }
            if (!isDir)
                continue;
            const markerPath = filesystem.resolve(root, ".arka-norn", "feature.json");
            const hasMarker = await filesystem.exists(markerPath);
            if (!hasMarker) {
                results.push({ root, hasMarker: false });
                continue;
            }
            let feature;
            const legacyMarker = await featureStore.hasLegacyMarker(root);
            try {
                feature = await featureStore.load(root);
                if (options?.projectId !== undefined && !feature.belongsTo(options.projectId))
                    feature = undefined;
            }
            catch (err) {
                logger.warn("scanFeatures: marker exists but feature failed to load", {
                    root,
                    error: err instanceof Error ? err.message : String(err),
                });
            }
            results.push(feature
                ? { root, hasMarker: true, feature, ...(legacyMarker ? { legacyMarker: true } : {}) }
                : { root, hasMarker: true, ...(legacyMarker ? { legacyMarker: true } : {}) });
        }
        const indexEntries = await indexStore.load();
        const knownIds = new Set(indexEntries.map((e) => e.id));
        for (const r of results) {
            if (r.feature !== undefined && !knownIds.has(r.feature.id.value)) {
                await indexStore.add({
                    id: r.feature.id.value,
                    projectId: r.feature.projectId.value,
                    root: r.feature.root,
                    name: r.feature.name,
                    updatedAt: r.feature.updatedAt,
                });
            }
        }
        return results;
    };
}
//# sourceMappingURL=scan-features.js.map