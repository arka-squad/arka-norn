/**
 * FeatureId value object — kebab-case slug identifier.
 *
 * Port fidèle de ProjectId (arka-cc-management,
 * core/domain/project/project-id.ts) : même format, même contrat.
 *
 * - Format : `[a-z0-9][a-z0-9-]{0,63}` (1-64 car., minuscules + chiffres +
 *   tiret, jamais commençant par un tiret).
 * - Stocké sous sa forme canonique minuscule. Comparaison exacte.
 *
 * Clé dans `~/.arka-norn/index/features.json`.
 *
 * La stratégie de génération (dérivée du chemin, cf. deriveFeatureId dans
 * home-view.ts) vit dans la couche use-case/adapter. Le domaine valide
 * seulement.
 */
import { InvalidFeatureIdError } from "../errors.js";
const FEATURE_ID_REGEX = /^[a-z0-9][a-z0-9-]{0,63}$/;
export class FeatureId {
    value;
    constructor(value) {
        this.value = value;
    }
    static of(value) {
        if (typeof value !== "string") {
            throw new InvalidFeatureIdError(String(value), "must be a string");
        }
        if (value.length === 0) {
            throw new InvalidFeatureIdError(value, "must not be empty");
        }
        if (value.length > 64) {
            throw new InvalidFeatureIdError(value, `length ${value.length} exceeds 64`);
        }
        if (!FEATURE_ID_REGEX.test(value)) {
            throw new InvalidFeatureIdError(value, "must match [a-z0-9][a-z0-9-]{0,63} (kebab-case, no leading dash)");
        }
        return new FeatureId(value);
    }
    static isValid(value) {
        return typeof value === "string" && value.length > 0 && value.length <= 64 && FEATURE_ID_REGEX.test(value);
    }
    equals(other) {
        return this.value === other.value;
    }
    toString() {
        return this.value;
    }
}
//# sourceMappingURL=feature-id.js.map