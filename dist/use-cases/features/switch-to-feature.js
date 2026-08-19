/**
 * `switchToFeature` use-case. Port fidèle de switchProject
 * (arka-cc-management, core/use-cases/projects/switch-project.ts).
 *
 * Pas de champ `current` explicite dans l'index : la feature courante est
 * implicitement celle dont lastUsedAt est le plus récent. switchTo(id)
 * réalise cette bascule en touchant l'index puis en persistant le nouveau
 * lastUsedAt dans le marker.
 */
import { FeatureNotFoundError } from "../../domain/errors.js";
export function switchToFeatureUseCaseFactory(deps) {
    const { featureStore, indexStore, clock } = deps;
    return async (id) => {
        const entry = await indexStore.find(id);
        if (entry === undefined)
            throw new FeatureNotFoundError(id.value);
        const now = clock.now();
        await indexStore.touch(id, now);
        const feature = await featureStore.load(entry.root);
        const touched = feature.touched(now);
        await featureStore.save(touched);
        return touched;
    };
}
//# sourceMappingURL=switch-to-feature.js.map