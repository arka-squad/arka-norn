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
import { mapConcurrent } from "../../application/shared/map-concurrent.js";
import { loadIndexedProject } from "./_shared/verified-project.js";
export function listProjectsUseCaseFactory(deps) {
    return async () => {
        const entries = await deps.indexStore.load();
        const projects = await mapConcurrent(entries, 8, async (entry) => {
            try {
                const project = await loadIndexedProject(deps, entry);
                return project.updatedAt.getTime() === entry.updatedAt.getTime() ? project : project.touched(entry.updatedAt);
            }
            catch (error) {
                deps.logger.warn("listProjects: unreadable marker skipped", {
                    id: entry.id,
                    root: entry.root,
                    error: error instanceof Error ? error.message : String(error),
                });
                return undefined;
            }
        });
        return projects.filter((project) => project !== undefined);
    };
}
//# sourceMappingURL=list-projects.js.map