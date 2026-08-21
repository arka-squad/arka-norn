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
 * FeatureIndexStore — persistence for `~/.arka-norn/index/features.json`.
 *
 * Port fidèle de ProjectIndexStore (arka-cc-management,
 * core/ports/outbound/project-index-store.ts). Source de vérité feature =
 * marker `<root>/.arka-norn/feature.json` (cf. FeatureStore), donc ce
 * fichier est reconstructible par scanFeatures.
 */
import type { FeatureId } from "../../domain/feature/feature-id.js";

export interface FeatureIndexEntry {
  readonly id: string;
  readonly projectId: string;
  readonly root: string;
  readonly name: string;
  readonly updatedAt: Date;
}

export interface FeatureIndexStore {
  /** Toutes les features connues, triées par updatedAt desc. */
  load(): Promise<readonly FeatureIndexEntry[]>;
  /** Remplace l'index entier (écriture atomique). */
  save(entries: readonly FeatureIndexEntry[]): Promise<void>;
  /** Ajoute une entrée. Lève FeatureAlreadyExistsError si l'id existe déjà. */
  add(entry: FeatureIndexEntry): Promise<void>;
  /** Ajoute ou remplace atomiquement une entrée après arbitrage métier d'une relocalisation. */
  upsert(entry: FeatureIndexEntry): Promise<void>;
  /** Retire une entrée par id. No-op si absente. */
  remove(id: FeatureId): Promise<void>;
  /** Met à jour updatedAt. Lève FeatureNotFoundError si absente. */
  touch(id: FeatureId, at: Date): Promise<void>;
  /** Une entrée, ou undefined si absente de l'index. */
  find(id: FeatureId): Promise<FeatureIndexEntry | undefined>;
}
