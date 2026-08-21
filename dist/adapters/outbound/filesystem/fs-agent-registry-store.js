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
import * as fs from "node:fs/promises";
import { join } from "node:path";
import { AgentRegistration } from "../../../domain/agent/agent.js";
import { AgentId } from "../../../domain/agent/agent-id.js";
import { InvalidAgentRegistryError, PathSecurityError } from "../../../domain/errors.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsAgentRegistryStore {
    paths;
    constructor(paths = new FsPathPolicy()) {
        this.paths = paths;
    }
    async load(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
        return this.loadUnlocked(project);
    }
    async update(project, transform) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
        const path = registryPath(project.root);
        return withFileLock(path, async () => {
            const current = await this.loadUnlocked(project);
            const updated = [...transform(current)];
            validateRelations(updated, path, project.id.value);
            const latest = updated.reduce((value, agent) => Math.max(value, agent.updatedAt.getTime()), project.updatedAt.getTime());
            const payload = {
                schemaVersion: 1,
                projectId: project.id.value,
                updatedAt: new Date(latest).toISOString(),
                agents: updated.map(serialize),
            };
            await writeJsonAtomic(path, payload, { mode: 0o644 });
            return updated;
        });
    }
    async loadUnlocked(project) {
        const path = registryPath(project.root);
        let raw;
        try {
            raw = await readJson(path);
        }
        catch (error) {
            throw new InvalidAgentRegistryError(path, error instanceof Error ? error.message : String(error));
        }
        if (raw === undefined)
            return [];
        if (!isRegistry(raw) || raw.projectId !== project.id.value) {
            throw new InvalidAgentRegistryError(path, "schema or projectId mismatch");
        }
        try {
            const agents = raw.agents.map(deserialize);
            validateRelations(agents, path, project.id.value);
            return agents;
        }
        catch (error) {
            if (error instanceof InvalidAgentRegistryError)
                throw error;
            throw new InvalidAgentRegistryError(path, error instanceof Error ? error.message : String(error));
        }
    }
}
export function agentRegistryPath(projectRoot) {
    return registryPath(projectRoot);
}
function registryPath(projectRoot) {
    return join(projectRoot, ".arka-norn", "agents.json");
}
async function rejectMarkerDirectorySymlink(root) {
    try {
        const path = join(root, ".arka-norn");
        if ((await fs.lstat(path)).isSymbolicLink()) {
            throw new PathSecurityError(path, "symbolic-link marker directories are forbidden");
        }
    }
    catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT"))
            throw error;
    }
}
function serialize(agent) {
    return {
        id: agent.id.value,
        provider: agent.provider,
        role: agent.role,
        active: agent.active,
        scope: {
            projectId: agent.scope.projectId.value,
            featureIds: agent.scope.featureIds.map((id) => id.value),
            paths: [...agent.scope.paths],
            responsibilities: [...agent.scope.responsibilities],
        },
        registeredAt: agent.registeredAt.toISOString(),
        updatedAt: agent.updatedAt.toISOString(),
        ...(agent.deactivatedAt === undefined ? {} : { deactivatedAt: agent.deactivatedAt.toISOString() }),
        ...(agent.replacedByAgentId === undefined ? {} : { replacedByAgentId: agent.replacedByAgentId.value }),
        ...(agent.replacesAgentId === undefined ? {} : { replacesAgentId: agent.replacesAgentId.value }),
    };
}
function deserialize(raw) {
    return AgentRegistration.create({
        id: AgentId.of(raw.id),
        provider: raw.provider,
        role: raw.role,
        active: raw.active,
        scope: {
            projectId: ProjectId.of(raw.scope.projectId),
            featureIds: raw.scope.featureIds.map((value) => FeatureId.of(value)),
            paths: raw.scope.paths,
            responsibilities: raw.scope.responsibilities,
        },
        registeredAt: parseDate(raw.registeredAt),
        updatedAt: parseDate(raw.updatedAt),
        ...(raw.deactivatedAt === undefined ? {} : { deactivatedAt: parseDate(raw.deactivatedAt) }),
        ...(raw.replacedByAgentId === undefined ? {} : { replacedByAgentId: AgentId.of(raw.replacedByAgentId) }),
        ...(raw.replacesAgentId === undefined ? {} : { replacesAgentId: AgentId.of(raw.replacesAgentId) }),
    });
}
function validateRelations(agents, path, projectId) {
    const byId = new Map(agents.map((agent) => [agent.id.value, agent]));
    if (byId.size !== agents.length)
        throw new InvalidAgentRegistryError(path, "duplicate agent ids");
    for (const agent of agents) {
        if (agent.scope.projectId.value !== projectId)
            throw new InvalidAgentRegistryError(path, `scope project mismatch for ${agent.id.value}`);
        if (agent.replacedByAgentId !== undefined) {
            const replacement = byId.get(agent.replacedByAgentId.value);
            if (replacement === undefined || replacement.replacesAgentId?.value !== agent.id.value) {
                throw new InvalidAgentRegistryError(path, `broken replacement relation for ${agent.id.value}`);
            }
        }
        if (agent.replacesAgentId !== undefined) {
            const replaced = byId.get(agent.replacesAgentId.value);
            if (replaced === undefined || replaced.replacedByAgentId?.value !== agent.id.value || replaced.active) {
                throw new InvalidAgentRegistryError(path, `broken replaces relation for ${agent.id.value}`);
            }
        }
    }
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
        if (visiting.has(id))
            throw new InvalidAgentRegistryError(path, `replacement cycle involving ${id}`);
        if (visited.has(id))
            return;
        visiting.add(id);
        const next = byId.get(id)?.replacedByAgentId?.value;
        if (next !== undefined)
            visit(next);
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of byId.keys())
        visit(id);
}
function isRegistry(value) {
    if (!isExactRecord(value, ["schemaVersion", "projectId", "updatedAt", "agents"]))
        return false;
    return value["schemaVersion"] === 1
        && typeof value["projectId"] === "string"
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"])
        && Array.isArray(value["agents"])
        && value["agents"].every(isAgentRaw);
}
function isAgentRaw(value) {
    if (!isRecord(value))
        return false;
    const required = ["id", "provider", "role", "active", "scope", "registeredAt", "updatedAt"];
    const optional = ["deactivatedAt", "replacedByAgentId", "replacesAgentId"];
    if (!hasExactKeys(value, required, optional))
        return false;
    const scope = value["scope"];
    return typeof value["id"] === "string"
        && typeof value["provider"] === "string"
        && typeof value["role"] === "string"
        && typeof value["active"] === "boolean"
        && isExactRecord(scope, ["projectId", "featureIds", "paths", "responsibilities"])
        && typeof scope["projectId"] === "string"
        && isStringArray(scope["featureIds"])
        && isStringArray(scope["paths"])
        && isStringArray(scope["responsibilities"])
        && typeof value["registeredAt"] === "string" && isIsoDate(value["registeredAt"])
        && typeof value["updatedAt"] === "string" && isIsoDate(value["updatedAt"])
        && optionalString(value["deactivatedAt"])
        && optionalString(value["replacedByAgentId"])
        && optionalString(value["replacesAgentId"]);
}
function parseDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new Error(`invalid date: ${value}`);
    return date;
}
function isIsoDate(value) {
    return !Number.isNaN(Date.parse(value));
}
function optionalString(value) {
    return value === undefined || typeof value === "string";
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isExactRecord(value, keys) {
    return isRecord(value) && hasExactKeys(value, keys, []);
}
function hasExactKeys(value, required, optional) {
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=fs-agent-registry-store.js.map