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

import { ProjectLocationConflictError, ProjectMarkerNotFoundError } from "../../domain/errors.js";
import type { Project } from "../../domain/project/project.js";
import type { ImportProjectInput } from "../../ports/inbound/for-projects.js";
import type { ProjectsDeps } from "./_shared/projects-deps.js";
import { loadIndexedProject } from "./_shared/verified-project.js";

export function importProjectUseCaseFactory(deps: ProjectsDeps) {
  return async (input: ImportProjectInput): Promise<Project> => {
    const root = await deps.pathPolicy.canonicalDirectory(input.root);
    if (!(await deps.projectStore.exists(root))) throw new ProjectMarkerNotFoundError(root);
    const project = await deps.projectStore.load(root);
    const indexed = await deps.indexStore.find(project.id);
    if (indexed === undefined) {
      await deps.indexStore.add({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
    } else if (indexed.root !== project.root) {
      let duplicateIsActive = false;
      try {
        duplicateIsActive = (await loadIndexedProject(deps, indexed)).id.equals(project.id);
      } catch {
        duplicateIsActive = false;
      }
      if (duplicateIsActive) throw new ProjectLocationConflictError(project.id.value, indexed.root, project.root);
      await deps.indexStore.upsert({ id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt });
    }
    return project;
  };
}
