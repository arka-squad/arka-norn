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
import { ProjectAlreadyExistsError } from "../../domain/errors.js";
import { Project } from "../../domain/project/project.js";
export function createProjectUseCaseFactory(deps) {
    return async (input) => {
        const canonicalRoot = await deps.pathPolicy.canonicalDirectory(input.root);
        if (await deps.projectStore.exists(canonicalRoot)) {
            const existing = await deps.projectStore.load(canonicalRoot);
            if (!existing.id.equals(input.id))
                throw new ProjectAlreadyExistsError(existing.root);
            if ((await deps.indexStore.find(existing.id)) === undefined) {
                await deps.indexStore.add(toIndexEntry(existing));
                deps.logger.warn("createProject: re-registered orphan project", { id: existing.id.value, root: existing.root });
            }
            return existing;
        }
        const now = deps.clock.now();
        const project = Project.create({
            id: input.id,
            name: input.name,
            root: canonicalRoot,
            schemaVersion: 4,
            orchestrationMode: input.orchestrationMode ?? "manual",
            createdAt: now,
            updatedAt: now,
        });
        try {
            await deps.projectStore.init(project);
            await deps.indexStore.add(toIndexEntry(project));
        }
        catch (error) {
            throw error;
        }
        return project;
    };
}
function toIndexEntry(project) {
    return { id: project.id.value, root: project.root, name: project.name, updatedAt: project.updatedAt };
}
//# sourceMappingURL=create-project.js.map