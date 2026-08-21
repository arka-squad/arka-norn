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

import { PathSecurityError, ProjectNotFoundError } from "../../../domain/errors.js";
import type { Project } from "../../../domain/project/project.js";
import type { ProjectId } from "../../../domain/project/project-id.js";
import type { ProjectIndexEntry } from "../../../ports/outbound/project-index-store.js";
import type { ProjectsDeps } from "./projects-deps.js";

/**
 * Revalide un Project indexé contre son marker portable avant toute lecture
 * ou écriture. L'index local est un cache non fiable et ne peut jamais
 * redéfinir l'identité ou la racine réelle d'un Project.
 */
export async function loadIndexedProject(deps: ProjectsDeps, entry: ProjectIndexEntry): Promise<Project> {
  const project = await deps.projectStore.load(entry.root);
  if (project.id.value !== entry.id) {
    throw new PathSecurityError(entry.root, `project marker identity does not match index entry ${entry.id}`);
  }
  return project;
}

export async function loadProjectById(deps: ProjectsDeps, id: ProjectId): Promise<Project> {
  const entry = await deps.indexStore.find(id);
  if (entry === undefined) throw new ProjectNotFoundError(id.value);
  return loadIndexedProject(deps, entry);
}
