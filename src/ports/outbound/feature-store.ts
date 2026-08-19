/**
 * FeatureStore — persistence for `<feature-root>/.arka-norn/feature.json`.
 *
 * Port fidèle de ProjectStore (arka-cc-management,
 * core/ports/outbound/project-store.ts), simplifié : pas de options.json
 * (arka-norn n'a pas d'options de session CLI). La source de vérité vit
 * dans le filesystem de la feature (pas dans `~/.arka-norn/`), donc on
 * peut désinstaller arka-norn sans casser une feature.
 */
import type { Feature } from "../../domain/feature/feature.js";

export interface FeatureStore {
  /** True si `<root>/.arka-norn/feature.json` existe. */
  exists(root: string): Promise<boolean>;
  hasLegacyMarker(root: string): Promise<boolean>;
  /** Crée le marker. Lève FeatureAlreadyExistsError si déjà présent. */
  init(feature: Feature): Promise<void>;
  /** Charge une feature depuis le disque. Lève FeatureNotFoundError sinon. */
  load(root: string): Promise<Feature>;
  /** Persiste un marker mis à jour (ex: touched()). */
  save(feature: Feature): Promise<void>;
}
