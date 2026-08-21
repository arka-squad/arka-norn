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
 * ForScan — driving port : scanne le filesystem pour trouver des features
 * arka-norn.
 *
 * Port fidèle de ForScan (arka-cc-management, core/ports/inbound/for-scan.ts) :
 * - Scan **non récursif**, **profondeur 1** depuis un dossier cible.
 * - Pas de remontée vers les parents, pas de descente vers les enfants.
 * - Met à jour `~/.arka-norn/index/features.json` mais reste optionnel
 *   (additif seulement, cf. scan-features.ts).
 */
import type { Feature } from "../../domain/feature/feature.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface ScanOptions {
  /** Chemin absolu à scanner. Défaut : le dossier courant (process.cwd()). */
  readonly target?: string;
  readonly projectId?: ProjectId;
}

export interface FeatureScanResult {
  /** Chemin absolu du dossier candidat. */
  readonly root: string;
  /** True si `<root>/.arka-norn/feature.json` existe et est valide. */
  readonly hasMarker: boolean;
  /** Présent ssi le marker a pu être chargé avec succès. */
  readonly feature?: Feature;
  readonly legacyMarker?: boolean;
}

export interface ForScan {
  /**
   * Scanne `target` en profondeur 1. Effet de bord : ajoute les features
   * nouvellement découvertes à l'index (n'en retire jamais).
   */
  scan(options?: ScanOptions): Promise<readonly FeatureScanResult[]>;
}
