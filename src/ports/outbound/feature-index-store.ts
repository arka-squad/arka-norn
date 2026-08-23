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

import type { FeatureId } from "../../domain/feature/feature-id.js";

export interface FeatureIndexEntry {
  readonly id: string;
  readonly projectId: string;
  readonly root: string;
  readonly name: string;
  readonly updatedAt: Date;
}

export interface FeatureIndexStore {
  load(): Promise<readonly FeatureIndexEntry[]>;
  save(entries: readonly FeatureIndexEntry[]): Promise<void>;
  add(entry: FeatureIndexEntry): Promise<void>;
  upsert(entry: FeatureIndexEntry): Promise<void>;
  remove(id: FeatureId): Promise<void>;
  touch(id: FeatureId, at: Date): Promise<void>;
  find(id: FeatureId): Promise<FeatureIndexEntry | undefined>;
}
