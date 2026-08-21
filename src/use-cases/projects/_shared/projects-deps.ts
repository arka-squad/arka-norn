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

import type { Clock } from "../../../ports/outbound/clock.js";
import type { Filesystem } from "../../../ports/outbound/filesystem.js";
import type { Logger } from "../../../ports/outbound/logger.js";
import type { ProjectIndexStore } from "../../../ports/outbound/project-index-store.js";
import type { ProjectStore } from "../../../ports/outbound/project-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

export interface ProjectsDeps {
  readonly projectStore: ProjectStore;
  readonly indexStore: ProjectIndexStore;
  readonly filesystem: Filesystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly pathPolicy: PathPolicy;
}
