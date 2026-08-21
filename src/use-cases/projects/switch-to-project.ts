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

import type { Project } from "../../domain/project/project.js";
import type { ProjectId } from "../../domain/project/project-id.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";
import { loadProjectById } from "./_shared/verified-project.js";

export type SwitchToProjectUseCase = (id: ProjectId) => Promise<Project>;

export function switchToProjectUseCaseFactory(deps: ProjectsDeps): SwitchToProjectUseCase {
  return async (id) => {
    const now = deps.clock.now();
    const project = (await loadProjectById(deps, id)).touched(now);
    await deps.indexStore.touch(id, now);
    await deps.projectStore.save(project);
    return project;
  };
}
