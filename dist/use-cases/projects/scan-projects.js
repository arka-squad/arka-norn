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
import { loadIndexedProject } from "./_shared/verified-project.js";
export function scanProjectsUseCaseFactory(deps) {
    return async (options) => {
        const target = await deps.pathPolicy.canonicalDirectory(options?.target ?? deps.filesystem.homeDir());
        const targetCurrent = await deps.filesystem.exists(deps.filesystem.resolve(target, ".arka-norn", "project.json"));
        const targetLegacy = !targetCurrent && await deps.filesystem.exists(deps.filesystem.resolve(target, ".arka-norn", "depot.json"));
        let roots;
        if (targetCurrent || targetLegacy) {
            roots = [target];
        }
        else {
            let children;
            try {
                children = await deps.filesystem.readDir(target);
            }
            catch (error) {
                deps.logger.warn("scanProjects: target unreadable", { target, error: error instanceof Error ? error.message : String(error) });
                return [];
            }
            const discovered = [];
            for (const name of children) {
                const root = deps.filesystem.resolve(target, name);
                try {
                    if ((await deps.filesystem.stat(root)).isDirectory)
                        discovered.push(root);
                }
                catch {
                    continue;
                }
            }
            roots = discovered;
        }
        const results = [];
        for (const root of roots) {
            const current = await deps.filesystem.exists(deps.filesystem.resolve(root, ".arka-norn", "project.json"));
            const legacy = !current && await deps.filesystem.exists(deps.filesystem.resolve(root, ".arka-norn", "depot.json"));
            if (!current && !legacy) {
                results.push({ root, hasMarker: false });
                continue;
            }
            let project;
            try {
                project = await deps.projectStore.load(root);
            }
            catch (error) {
                deps.logger.warn("scanProjects: marker unreadable", { root, error: error instanceof Error ? error.message : String(error) });
            }
            results.push(project === undefined
                ? { root, hasMarker: true, ...(legacy ? { legacyMarker: true } : {}) }
                : { root, hasMarker: true, project, ...(legacy ? { legacyMarker: true } : {}) });
        }
        const known = new Map((await deps.indexStore.load()).map((entry) => [entry.id, entry]));
        for (const result of results) {
            if (result.project === undefined)
                continue;
            const entry = {
                id: result.project.id.value,
                root: result.project.root,
                name: result.project.name,
                updatedAt: result.project.updatedAt,
            };
            const indexed = known.get(entry.id);
            if (indexed === undefined) {
                await deps.indexStore.add(entry);
                known.set(entry.id, entry);
                continue;
            }
            if (indexed.root === entry.root)
                continue;
            let duplicateIsActive = false;
            try {
                duplicateIsActive = (await loadIndexedProject(deps, indexed)).id.value === entry.id;
            }
            catch {
                duplicateIsActive = false;
            }
            if (duplicateIsActive) {
                deps.logger.warn("scanProjects: duplicate portable marker ignored", { id: entry.id, indexedRoot: indexed.root, candidateRoot: entry.root });
                continue;
            }
            await deps.indexStore.upsert(entry);
            known.set(entry.id, entry);
        }
        return results;
    };
}
//# sourceMappingURL=scan-projects.js.map