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

import type { Feature } from "../../domain/feature/feature.js";

export interface FeatureStore {
  /** True si `<root>/.arka-norn/feature.json` existe. */
  exists(root: string): Promise<boolean>;
  hasLegacyMarker(root: string): Promise<boolean>;
  init(feature: Feature): Promise<void>;
  load(root: string): Promise<Feature>;
  save(feature: Feature): Promise<void>;
}
