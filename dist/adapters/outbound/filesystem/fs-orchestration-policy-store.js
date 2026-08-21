import * as fs from "node:fs/promises";
import { join } from "node:path";
import { EXECUTION_POLICY_SCHEMA_VERSION, ExecutionPolicy, } from "../../../domain/orchestration/execution-policy.js";
import { InvalidExecutionPolicyError } from "../../../domain/orchestration/errors.js";
import { isExecutionCapability, isExecutionPermission, isExecutionProvider, } from "../../../domain/orchestration/types.js";
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
    async save(project, policy) {
        await this.assertProjectRoot(project);
        if (!policy.projectId.equals(project.id))
            throw new InvalidExecutionPolicyError("policy projectId must match the Project");
        const path = orchestrationPolicyPath(project.root);
        await withFileLock(path, async () => {
            await writeJsonAtomic(path, serialize(policy), { mode: 0o600 });
        });
    }
    async assertProjectRoot(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
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
        providers: props.providers.map((provider) => ({
            provider: provider.provider,
            enabled: provider.enabled,
            priority: provider.priority,
            capabilities: [...provider.capabilities],
            permissions: [...provider.permissions],
        })),
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
    };
}
function deserialize(value) {
    if (!isPolicyFile(value))
        throw new InvalidExecutionPolicyError("schema is invalid or contains forbidden fields");
    const props = {
        schemaVersion: value.schemaVersion,
        projectId: ProjectId.of(value.projectId),
        providers: value.providers.map((provider) => ({
            provider: provider.provider,
            enabled: provider.enabled,
            priority: provider.priority,
            capabilities: [...provider.capabilities],
            permissions: [...provider.permissions],
        })),
        createdAt: parseDate(value.createdAt, "createdAt"),
        updatedAt: parseDate(value.updatedAt, "updatedAt"),
    };
    return ExecutionPolicy.create(props);
}
function isPolicyFile(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "providers", "createdAt", "updatedAt"]))
        return false;
    return value["schemaVersion"] === EXECUTION_POLICY_SCHEMA_VERSION
        && typeof value["projectId"] === "string"
        && Array.isArray(value["providers"])
        && value["providers"].every(isProviderPolicyRaw)
        && typeof value["createdAt"] === "string"
        && isIsoDate(value["createdAt"])
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"]);
}
function isProviderPolicyRaw(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["provider", "enabled", "priority", "capabilities", "permissions"]))
        return false;
    return isExecutionProvider(value["provider"])
        && typeof value["enabled"] === "boolean"
        && Number.isInteger(value["priority"])
        && isUniqueArray(value["capabilities"], isExecutionCapability)
        && isUniqueArray(value["permissions"], isExecutionPermission);
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