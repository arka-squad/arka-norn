/**
 * `scanFeatures` use-case. Port fidèle de scanProjects
 * (arka-cc-management, core/use-cases/projects/scan-projects.ts) :
 *
 *     find <cible> -maxdepth 1 -type d -exec test -e "{}/.arka-norn" \; -print
 *
 * Pas de méthode store dédiée — le use-case fait le walk directement via
 * le port Filesystem :
 *   1. readDir(target) → enfants directs (depth 1, pas de récursion).
 *   2. Pour chaque enfant : stat() pour vérifier que c'est un directory,
 *      puis exists(<root>/.arka-norn/feature.json).
 *   3. Si marker présent : featureStore.load(root) réhydrate l'entité.
 *      Marker présent mais illisible → hasMarker: true, feature: undefined
 *      (la TUI affichera « feature cassée »).
 *
 * Effet de bord index : les features nouvellement découvertes sont
 * ajoutées à l'index. On ne retire JAMAIS les entrées non retrouvées
 * (la feature peut être sur un volume débranché).
 */
import type { Feature } from "../../domain/feature/feature.js";
import type { FeatureScanResult, ScanOptions } from "../../ports/inbound/for-scan.js";
import type { FeaturesDeps } from "./_shared/features-deps.js";

export type ScanFeaturesUseCase = (options?: ScanOptions) => Promise<readonly FeatureScanResult[]>;

export function scanFeaturesUseCaseFactory(deps: FeaturesDeps): ScanFeaturesUseCase {
  const { featureStore, indexStore, filesystem, logger } = deps;

  return async (options?: ScanOptions): Promise<readonly FeatureScanResult[]> => {
    const requestedTarget = options?.target ?? filesystem.homeDir();
    let target: string;
    try {
      target = await deps.pathPolicy.canonicalDirectory(requestedTarget);
      if (options?.projectId !== undefined) {
        const project = await deps.projectIndexStore.find(options.projectId);
        if (project === undefined) return [];
        const canonicalProject = await deps.pathPolicy.canonicalDirectory(project.root);
        if (target !== canonicalProject) await deps.pathPolicy.assertContained(canonicalProject, target);
      }
    } catch (err) {
      logger.warn("scanFeatures: unsafe scan target", { target: requestedTarget, error: err instanceof Error ? err.message : String(err) });
      return [];
    }

    let children: readonly string[];
    try {
      children = await filesystem.readDir(target);
    } catch (err) {
      logger.warn("scanFeatures: scan target unreadable", {
        target,
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }

    const results: FeatureScanResult[] = [];
    for (const name of children) {
      const root = filesystem.resolve(target, name);

      let isDir = false;
      try {
        const s = await filesystem.stat(root);
        isDir = s.isDirectory;
      } catch {
        continue;
      }
      if (!isDir) continue;

      const markerPath = filesystem.resolve(root, ".arka-norn", "feature.json");
      const hasMarker = await filesystem.exists(markerPath);
      if (!hasMarker) {
        results.push({ root, hasMarker: false });
        continue;
      }

      let feature: Feature | undefined;
      const legacyMarker = await featureStore.hasLegacyMarker(root);
      try {
        feature = await featureStore.load(root);
        if (options?.projectId !== undefined && !feature.belongsTo(options.projectId)) feature = undefined;
      } catch (err) {
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
