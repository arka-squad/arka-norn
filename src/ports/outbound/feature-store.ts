/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
