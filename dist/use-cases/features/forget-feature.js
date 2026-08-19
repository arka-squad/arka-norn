/**
 * `forgetFeature` use-case. Port fidèle de forgetProject
 * (arka-cc-management, core/use-cases/projects/forget-project.ts).
 *
 * Ne supprime JAMAIS le dossier disque de la feature. Retire seulement
 * l'entrée de `~/.arka-norn/index/features.json`. Pas d'idempotence
 * silencieuse : FeatureNotFoundError si l'id est déjà absent (signe d'un
 * état désynchronisé à signaler, pas à masquer).
 */
import { FeatureNotFoundError } from "../../domain/errors.js";
export function forgetFeatureUseCaseFactory(deps) {
    const { indexStore, logger } = deps;
    return async (id) => {
        const entry = await indexStore.find(id);
        if (entry === undefined)
            throw new FeatureNotFoundError(id.value);
        await indexStore.remove(id);
        logger.info("forgetFeature: feature removed from index (filesystem untouched)", {
            id: id.value,
            root: entry.root,
        });
    };
}
//# sourceMappingURL=forget-feature.js.map