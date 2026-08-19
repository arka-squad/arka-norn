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
  /** Retire une entrée par id. No-op si absente. */
  remove(id: FeatureId): Promise<void>;
  /** Met à jour updatedAt. Lève FeatureNotFoundError si absente. */
  touch(id: FeatureId, at: Date): Promise<void>;
  /** Une entrée, ou undefined si absente de l'index. */
  find(id: FeatureId): Promise<FeatureIndexEntry | undefined>;
}
