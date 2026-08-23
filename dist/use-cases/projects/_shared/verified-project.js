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
export async function loadIndexedProject(deps, entry) {
    const project = await deps.projectStore.load(entry.root);
    if (project.id.value !== entry.id) {
        throw new PathSecurityError(entry.root, `project marker identity does not match index entry ${entry.id}`);
    }
    return project;
}
export async function loadProjectById(deps, id) {
    const entry = await deps.indexStore.find(id);
    if (entry === undefined)
        throw new ProjectNotFoundError(id.value);
    return loadIndexedProject(deps, entry);
}
//# sourceMappingURL=verified-project.js.map