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

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export interface LegacyFeatureFixture {
  readonly root: string;
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly pipelineId?: string;
}

/**
 * Writes an explicit v4 compatibility fixture. Tests using this helper are
 * exercising historical Features; it must never be used as a production
 * creation path.
 */
export function writeLegacyFeatureMarker(input: LegacyFeatureFixture): string {
  const markerDirectory = resolve(input.root, ".arka-norn");
  const markerPath = resolve(markerDirectory, "feature.json");
  const timestamp = "2026-08-26T00:00:00.000Z";
  mkdirSync(markerDirectory, { recursive: true });
  writeFileSync(markerPath, `${JSON.stringify({
    schemaVersion: 4,
    id: input.id,
    projectId: input.projectId,
    name: input.name,
    pipelineId: input.pipelineId ?? "arka-norn-complete",
    documentContractVersion: 5,
    createdAt: timestamp,
    updatedAt: timestamp,
  }, null, 2)}\n`, "utf8");
  return markerPath;
}
