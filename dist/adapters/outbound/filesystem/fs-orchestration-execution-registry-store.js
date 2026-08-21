import * as fs from "node:fs/promises";
import { join } from "node:path";
import { PathSecurityError } from "../../../domain/errors.js";
import { EXECUTION_REGISTRY_SCHEMA_VERSION, ExecutionRegistry, } from "../../../domain/orchestration/execution-registry.js";
import { ExecutionRecord, isExecutionSuspensionCode, } from "../../../domain/orchestration/execution-record.js";
import { InvalidExecutionRegistryError } from "../../../domain/orchestration/errors.js";
import { MissionOrder, } from "../../../domain/orchestration/mission-order.js";
import { isExecutionAttemptStatus, isExecutionCapability, isExecutionPermission, isExecutionProvider, isExecutionRecordStatus, } from "../../../domain/orchestration/types.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsExecutionRegistryStore {
    paths;
    constructor(paths = new FsPathPolicy()) {
        this.paths = paths;
    }
    async load(project) {
        await this.assertProjectRoot(project);
        return this.loadUnlocked(project);
    }
    async update(project, transform) {
        await this.assertProjectRoot(project);
        const path = executionRegistryPath(project.root);
        return withFileLock(path, async () => {
            const next = transform(await this.loadUnlocked(project));
            if (!(next instanceof ExecutionRegistry))
                throw new InvalidExecutionRegistryError("registry transform must return an ExecutionRegistry");
            if (!next.projectId.equals(project.id))
                throw new InvalidExecutionRegistryError("registry projectId must match the Project");
            await writeJsonAtomic(path, serialize(next), { mode: 0o600 });
            return next;
        });
    }
    async loadUnlocked(project) {
        const path = executionRegistryPath(project.root);
        let value;
        try {
            value = await readJson(path);
        }
        catch (error) {
            throw invalidFile(path, error);
        }
        if (value === undefined)
            return ExecutionRegistry.empty(project.id);
        try {
            const registry = deserialize(value);
            if (!registry.projectId.equals(project.id))
                throw new InvalidExecutionRegistryError("projectId mismatch");
            return registry;
        }
        catch (error) {
            throw invalidFile(path, error);
        }
    }
    async assertProjectRoot(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        await rejectMarkerDirectorySymlink(project.root);
    }
}
export function executionRegistryPath(projectRoot) {
    return join(projectRoot, ".arka-norn", "executions.json");
}
export function serializeExecutionRegistry(registry) {
    return serialize(registry);
}
export function deserializeExecutionRegistry(value) {
    return deserialize(value);
}
function serialize(registry) {
    const props = registry.toProps();
    return {
        schemaVersion: props.schemaVersion,
        projectId: props.projectId.value,
        updatedAt: props.updatedAt.toISOString(),
        executions: props.executions.map(serializeRecord),
    };
}
function serializeRecord(record) {
    const props = record.toProps();
    return {
        id: props.id,
        order: serializeOrder(props.order),
        provider: props.provider,
        status: props.status,
        attempts: props.attempts.map((attempt) => ({
            number: attempt.number,
            status: attempt.status,
            startedAt: attempt.startedAt.toISOString(),
            ...(attempt.endedAt === undefined ? {} : { endedAt: attempt.endedAt.toISOString() }),
            ...(attempt.providerSessionId === undefined ? {} : { providerSessionId: attempt.providerSessionId }),
        })),
        events: props.events.map((event) => ({ at: event.at.toISOString(), type: event.type, detail: event.detail })),
        truncatedEventCount: props.truncatedEventCount,
        proofReferences: [...props.proofReferences],
        ...(props.suspensionReason === undefined ? {} : { suspensionReason: { ...props.suspensionReason } }),
        ...(props.providerSessionId === undefined ? {} : { providerSessionId: props.providerSessionId }),
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
    };
}
function serializeOrder(order) {
    const props = order.toProps();
    return {
        id: props.id,
        scope: {
            projectId: props.scope.projectId.value,
            ...(props.scope.featureId === undefined ? {} : { featureId: props.scope.featureId.value }),
            paths: [...props.scope.paths],
        },
        preconditions: { ...props.preconditions },
        requiredCapabilities: [...props.requiredCapabilities],
        requiredPermissions: [...props.requiredPermissions],
        summary: props.summary,
        issuedAt: props.issuedAt.toISOString(),
    };
}
function deserialize(value) {
    if (!isRegistryFile(value))
        throw new InvalidExecutionRegistryError("schema is invalid or contains forbidden fields");
    const props = {
        schemaVersion: value.schemaVersion,
        projectId: ProjectId.of(value.projectId),
        executions: value.executions.map(deserializeRecord),
        updatedAt: parseDate(value.updatedAt, "updatedAt"),
    };
    return ExecutionRegistry.create(props);
}
function deserializeRecord(value) {
    const props = {
        id: value.id,
        order: deserializeOrder(value.order),
        provider: value.provider,
        status: value.status,
        attempts: value.attempts.map(deserializeAttempt),
        events: value.events.map(deserializeEvent),
        truncatedEventCount: value.truncatedEventCount,
        proofReferences: [...value.proofReferences],
        ...(value.suspensionReason === undefined ? {} : { suspensionReason: deserializeReason(value.suspensionReason) }),
        ...(value.providerSessionId === undefined ? {} : { providerSessionId: value.providerSessionId }),
        createdAt: parseDate(value.createdAt, "createdAt"),
        updatedAt: parseDate(value.updatedAt, "updatedAt"),
    };
    return ExecutionRecord.create(props);
}
function deserializeOrder(value) {
    const scope = {
        projectId: ProjectId.of(value.scope.projectId),
        ...(value.scope.featureId === undefined ? {} : { featureId: FeatureId.of(value.scope.featureId) }),
        paths: [...value.scope.paths],
    };
    const preconditions = { ...value.preconditions };
    const props = {
        id: value.id,
        scope,
        preconditions,
        requiredCapabilities: [...value.requiredCapabilities],
        requiredPermissions: [...value.requiredPermissions],
        summary: value.summary,
        issuedAt: parseDate(value.issuedAt, "order.issuedAt"),
    };
    return MissionOrder.create(props);
}
function deserializeAttempt(value) {
    return {
        number: value.number,
        status: value.status,
        startedAt: parseDate(value.startedAt, "attempt.startedAt"),
        ...(value.endedAt === undefined ? {} : { endedAt: parseDate(value.endedAt, "attempt.endedAt") }),
        ...(value.providerSessionId === undefined ? {} : { providerSessionId: value.providerSessionId }),
    };
}
function deserializeEvent(value) {
    return { at: parseDate(value.at, "event.at"), type: value.type, detail: value.detail };
}
function deserializeReason(value) {
    if (!isExecutionSuspensionCode(value.code))
        throw new InvalidExecutionRegistryError("suspension reason code is invalid");
    return { code: value.code, detail: value.detail };
}
function isRegistryFile(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "updatedAt", "executions"]))
        return false;
    return value["schemaVersion"] === EXECUTION_REGISTRY_SCHEMA_VERSION
        && typeof value["projectId"] === "string"
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"])
        && Array.isArray(value["executions"])
        && value["executions"].every(isExecutionRecordRaw);
}
function isExecutionRecordRaw(value) {
    const required = ["id", "order", "provider", "status", "attempts", "events", "truncatedEventCount", "proofReferences", "createdAt", "updatedAt"];
    const optional = ["suspensionReason", "providerSessionId"];
    if (!isRecord(value) || !hasKeys(value, required, optional))
        return false;
    return typeof value["id"] === "string"
        && isMissionOrderRaw(value["order"])
        && isExecutionProvider(value["provider"])
        && isExecutionRecordStatus(value["status"])
        && Array.isArray(value["attempts"])
        && value["attempts"].every(isExecutionAttemptRaw)
        && Array.isArray(value["events"])
        && value["events"].every(isExecutionEventRaw)
        && Number.isInteger(value["truncatedEventCount"])
        && isStringArray(value["proofReferences"])
        && optionalRawReason(value["suspensionReason"])
        && optionalString(value["providerSessionId"])
        && typeof value["createdAt"] === "string"
        && isIsoDate(value["createdAt"])
        && typeof value["updatedAt"] === "string"
        && isIsoDate(value["updatedAt"]);
}
function isMissionOrderRaw(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["id", "scope", "preconditions", "requiredCapabilities", "requiredPermissions", "summary", "issuedAt"]))
        return false;
    return typeof value["id"] === "string"
        && isMissionScopeRaw(value["scope"])
        && isPipelinePreconditionsRaw(value["preconditions"])
        && isUniqueArray(value["requiredCapabilities"], isExecutionCapability)
        && isUniqueArray(value["requiredPermissions"], isExecutionPermission)
        && typeof value["summary"] === "string"
        && typeof value["issuedAt"] === "string"
        && isIsoDate(value["issuedAt"]);
}
function isMissionScopeRaw(value) {
    if (!isRecord(value) || !hasKeys(value, ["projectId", "paths"], ["featureId"]))
        return false;
    return typeof value["projectId"] === "string"
        && optionalString(value["featureId"])
        && isStringArray(value["paths"]);
}
function isPipelinePreconditionsRaw(value) {
    return isRecord(value)
        && hasExactKeys(value, ["pipelineId", "nextStepId"])
        && typeof value["pipelineId"] === "string"
        && typeof value["nextStepId"] === "string";
}
function isExecutionAttemptRaw(value) {
    if (!isRecord(value) || !hasKeys(value, ["number", "status", "startedAt"], ["endedAt", "providerSessionId"]))
        return false;
    return Number.isInteger(value["number"])
        && isExecutionAttemptStatus(value["status"])
        && typeof value["startedAt"] === "string"
        && isIsoDate(value["startedAt"])
        && optionalIsoDate(value["endedAt"])
        && optionalString(value["providerSessionId"]);
}
function isExecutionEventRaw(value) {
    return isRecord(value)
        && hasExactKeys(value, ["at", "type", "detail"])
        && typeof value["at"] === "string"
        && isIsoDate(value["at"])
        && typeof value["type"] === "string"
        && typeof value["detail"] === "string";
}
function optionalRawReason(value) {
    return value === undefined || (isRecord(value)
        && hasExactKeys(value, ["code", "detail"])
        && isExecutionSuspensionCode(value["code"])
        && typeof value["detail"] === "string");
}
function isUniqueArray(value, predicate) {
    return Array.isArray(value) && value.every(predicate) && new Set(value).size === value.length;
}
function isStringArray(value) {
    return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}
function optionalString(value) {
    return value === undefined || typeof value === "string";
}
function optionalIsoDate(value) {
    return value === undefined || (typeof value === "string" && isIsoDate(value));
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
    return new InvalidExecutionRegistryError(`${path}: ${reason}`);
}
function parseDate(value, field) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime()))
        throw new InvalidExecutionRegistryError(`${field} is invalid`);
    return date;
}
function isIsoDate(value) {
    return !Number.isNaN(Date.parse(value));
}
function hasExactKeys(value, expected) {
    return hasKeys(value, expected, []);
}
function hasKeys(value, required, optional) {
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-orchestration-execution-registry-store.js.map