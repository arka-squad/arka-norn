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
 * Features use-cases — dépendances partagées. Port fidèle de ProjectsDeps
 * (arka-cc-management, core/use-cases/projects/_shared/projects-deps.ts) :
 * chaque factory de use-case accepte cette même struct, la composition
 * root les câble uniformément.
 */
import type { Clock } from "../../../ports/outbound/clock.js";
import type { Filesystem } from "../../../ports/outbound/filesystem.js";
import type { Logger } from "../../../ports/outbound/logger.js";
import type { FeatureIndexStore } from "../../../ports/outbound/feature-index-store.js";
import type { FeatureStore } from "../../../ports/outbound/feature-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";
import type { ProjectIndexStore } from "../../../ports/outbound/project-index-store.js";
import type { ProjectStore } from "../../../ports/outbound/project-store.js";

export interface FeaturesDeps {
  readonly featureStore: FeatureStore;
  readonly indexStore: FeatureIndexStore;
  readonly filesystem: Filesystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly pathPolicy: PathPolicy;
  readonly projectIndexStore: ProjectIndexStore;
  readonly projectStore: ProjectStore;
  readonly resolveDefaultPipelineId?: () => Promise<string>;
}
