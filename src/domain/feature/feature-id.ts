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
  public readonly value: string;

  private constructor(value: string) {
    this.value = value;
  }

  public static of(value: string): FeatureId {
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

  public static isValid(value: string): boolean {
    return typeof value === "string" && value.length > 0 && value.length <= 64 && FEATURE_ID_REGEX.test(value);
  }

  public equals(other: FeatureId): boolean {
    return this.value === other.value;
  }

  public toString(): string {
    return this.value;
  }
}
