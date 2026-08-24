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
import { EXECUTION_POLICY_SCHEMA_VERSION, ExecutionPolicy, isExecutionSelectionMode, isOrchestrationWorkspaceMode, } from "../../../domain/orchestration/execution-policy.js";
import { InvalidExecutionPolicyError } from "../../../domain/orchestration/errors.js";
import { canonicalExecutionAdapter, isExecutionAdapter, isExecutionCapability, isExecutionModelId, isExecutionPermission, isExecutionProvider, } from "../../../domain/orchestration/types.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { PathSecurityError } from "../../../domain/errors.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsOrchestrationPolicyStore {
    paths;
    constructor(paths = new FsPathPolicy()) {
        this.paths = paths;
    }
    /** Loading v1 is a pure migration in memory; it never rewrites the marker. */
    async load(project) {
        await this.assertProjectRoot(project);
        const path = orchestrationPolicyPath(project.root);
        let value;
        try {
            value = await readJson(path);
        }
        catch (error) {
            throw invalidFile(path, error);
        }
        if (value === undefined)
            return undefined;
        try {
            const policy = deserialize(value);
            if (!policy.projectId.equals(project.id))
                throw new InvalidExecutionPolicyError("projectId mismatch");
            return policy;
        }
        catch (error) {
            throw invalidFile(path, error);
        }
    }
    /** Every explicit save writes v3 and preserves one private legacy backup. */
    async save(project, policy) {
        await this.assertProjectRoot(project);
        if (!policy.projectId.equals(project.id))
            throw new InvalidExecutionPolicyError("policy projectId must match the Project");
        const path = orchestrationPolicyPath(project.root);
        await withFileLock(path, async () => {
            await backupLegacyFile(path);
            await writeJsonAtomic(path, serialize(policy), { mode: 0o600 });
        });
    }
    async assertProjectRoot(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
    }
}
async function backupLegacyFile(path) {
    const value = await readJson(path);
    if (!isRecord(value) || (value["schemaVersion"] !== 1 && value["schemaVersion"] !== 2))
        return;
    const backup = `${path}.v${String(value["schemaVersion"])}.backup`;
    try {
        await fs.copyFile(path, backup, fs.constants.COPYFILE_EXCL);
        await fs.chmod(backup, 0o600);
    }
    catch (error) {
        if (!isNodeError(error, "EEXIST"))
            throw error;
    }
}
export function orchestrationPolicyPath(projectRoot) {
    return join(projectRoot, ".arka-norn", "orchestration.json");
}
export function serializeOrchestrationPolicy(policy) {
    return serialize(policy);
}
export function deserializeOrchestrationPolicy(value) {
    return deserialize(value);
}
function serialize(policy) {
    const props = policy.toProps();
    return {
        schemaVersion: props.schemaVersion,
        projectId: props.projectId.value,
        selectionMode: props.selectionMode,
        workspaceMode: props.workspaceMode,
        providers: props.providers.map((provider) => ({
            provider: provider.provider,
            adapter: provider.adapter,
            enabled: provider.enabled,
            priority: provider.priority,
            capabilities: [...provider.capabilities],
            permissions: [...provider.permissions],
            models: provider.models.map((model) => ({ ...model })),
        })),
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
    };
}
function deserialize(value) {
    if (!isPolicyFile(value))
        throw new InvalidExecutionPolicyError("schema is invalid or contains forbidden fields");
    const props = value.schemaVersion === 1
        ? {
            schemaVersion: EXECUTION_POLICY_SCHEMA_VERSION,
            projectId: ProjectId.of(value.projectId),
            selectionMode: "assisted",
            workspaceMode: "unconfigured",
            providers: value.providers.map((provider) => ({
                provider: provider.provider,
                adapter: canonicalExecutionAdapter(provider.provider),
                enabled: provider.enabled,
                priority: provider.priority,
                capabilities: [...provider.capabilities],
                permissions: [...provider.permissions],
                models: [],
            })),
            createdAt: parseDate(value.createdAt, "createdAt"),
            updatedAt: parseDate(value.updatedAt, "updatedAt"),
        }
        : {
            schemaVersion: EXECUTION_POLICY_SCHEMA_VERSION,
            projectId: ProjectId.of(value.projectId),
            selectionMode: value.selectionMode,
            workspaceMode: value.schemaVersion === 3 ? value.workspaceMode : "unconfigured",
            providers: value.providers.map((provider) => ({
                provider: provider.provider,
                adapter: canonicalExecutionAdapter(provider.provider),
                enabled: provider.enabled,
                priority: provider.priority,
                capabilities: [...provider.capabilities],
                permissions: [...provider.permissions],
                models: provider.models.map((model) => ({ ...model })),
            })),
            createdAt: parseDate(value.createdAt, "createdAt"),
            updatedAt: parseDate(value.updatedAt, "updatedAt"),
        };
    return ExecutionPolicy.create(props);
}
function isPolicyFile(value) {
    return isPolicyFileV1(value) || isPolicyFileV2(value) || isPolicyFileV3(value);
}
function isPolicyFileV1(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "providers", "createdAt", "updatedAt"]))
        return false;
    return value["schemaVersion"] === 1
        && typeof value["projectId"] === "string"
        && Array.isArray(value["providers"])
        && value["providers"].length >= 1
        && value["providers"].length <= 2
        && value["providers"].every(isProviderPolicyRawV1)
        && typeof value["createdAt"] === "string"
        && isIsoDate(value["createdAt"])
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"]);
}
function isPolicyFileV2(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "selectionMode", "providers", "createdAt", "updatedAt"]))
        return false;
    return value["schemaVersion"] === 2
        && typeof value["projectId"] === "string"
        && isExecutionSelectionMode(value["selectionMode"])
        && Array.isArray(value["providers"])
        && value["providers"].every(isProviderPolicyRawV2)
        && typeof value["createdAt"] === "string"
        && isIsoDate(value["createdAt"])
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"]);
}
function isPolicyFileV3(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "selectionMode", "workspaceMode", "providers", "createdAt", "updatedAt"]))
        return false;
    return value["schemaVersion"] === EXECUTION_POLICY_SCHEMA_VERSION
        && typeof value["projectId"] === "string"
        && isExecutionSelectionMode(value["selectionMode"])
        && isOrchestrationWorkspaceMode(value["workspaceMode"])
        && Array.isArray(value["providers"])
        && value["providers"].every(isProviderPolicyRawV2)
        && typeof value["createdAt"] === "string"
        && isIsoDate(value["createdAt"])
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"]);
}
function isProviderPolicyRawV1(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["provider", "enabled", "priority", "capabilities", "permissions"]))
        return false;
    return (value["provider"] === "claude" || value["provider"] === "codex")
        && typeof value["enabled"] === "boolean"
        && Number.isInteger(value["priority"])
        && isUniqueArray(value["capabilities"], isExecutionCapability)
        && isUniqueArray(value["permissions"], isExecutionPermission);
}
function isProviderPolicyRawV2(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["provider", "adapter", "enabled", "priority", "capabilities", "permissions", "models"]))
        return false;
    return isExecutionProvider(value["provider"])
        && isExecutionAdapter(value["adapter"])
        && typeof value["enabled"] === "boolean"
        && Number.isInteger(value["priority"])
        && isUniqueArray(value["capabilities"], isExecutionCapability)
        && isUniqueArray(value["permissions"], isExecutionPermission)
        && Array.isArray(value["models"])
        && value["models"].every(isModelPolicyRaw);
}
function isModelPolicyRaw(value) {
    return isRecord(value)
        && hasExactKeys(value, ["id", "enabled", "priority"])
        && isExecutionModelId(value["id"])
        && typeof value["enabled"] === "boolean"
        && Number.isInteger(value["priority"]);
}
function isUniqueArray(value, predicate) {
    return Array.isArray(value) && value.every(predicate) && new Set(value).size === value.length;
}
async function rejectMarkerDirectorySymlink(root) {
    try {
        const markerDirectory = join(root, ".arka-norn");
        if ((await fs.lstat(markerDirectory)).isSymbolicLink()) {
            throw new PathSecurityError(markerDirectory, "symbolic-link marker directories are forbidden");
        }
    }
    catch (error) {
        if (!isNodeError(error, "ENOENT"))
            throw error;
    }
}
function invalidFile(path, error) {
    const reason = error instanceof Error ? error.message : String(error);
    return new InvalidExecutionPolicyError(`${path}: ${reason}`);
}
function parseDate(value, field) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new InvalidExecutionPolicyError(`${field} is invalid`);
    return date;
}
function isIsoDate(value) {
    return !Number.isNaN(Date.parse(value));
}
function hasExactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    const expectedKeys = [...expected].sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-orchestration-policy-store.js.map