import * as fs from "node:fs/promises";
import { join } from "node:path";
import { PathSecurityError } from "../../../domain/errors.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
const WORKER_STATE_SCHEMA_VERSION = 1;
const EXECUTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,95}$/;
/**
 * Private, disposable process metadata. It is deliberately outside the
 * Project marker and the portable execution registry. It is not used to send
 * signals: a stale/reused PID must never authorize killing another process.
 */
export class FsOrchestrationWorkerStateStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load(projectId, executionId) {
        const path = workerStatePath(this.homeDir, projectId, executionId);
        let value;
        try {
            value = await readJson(path);
        }
        catch (error) {
            throw invalidState(path, error);
        }
        if (value === undefined)
            return undefined;
        const state = deserialize(value, path);
        if (state.projectId !== projectId.value || state.executionId !== executionId) {
            throw new Error(`Orchestration worker state identity mismatch at ${path}.`);
        }
        return state;
    }
    async start(input) {
        const path = workerStatePath(this.homeDir, input.projectId, input.executionId);
        const state = createState(input);
        await withFileLock(path, async () => {
            await writeJsonAtomic(path, serialize(state), { mode: 0o600 });
        });
        return state;
    }
    async touch(input) {
        const path = workerStatePath(this.homeDir, input.projectId, input.executionId);
        return withFileLock(path, async () => {
            const current = await this.load(input.projectId, input.executionId);
            if (current === undefined)
                return this.write(path, createState(input));
            if (current.pid !== input.pid)
                throw new Error(`Orchestration worker PID mismatch at ${path}.`);
            return this.write(path, { ...current, updatedAt: cloneDate(input.at, "updatedAt") });
        });
    }
    async clear(projectId, executionId) {
        const path = workerStatePath(this.homeDir, projectId, executionId);
        await withFileLock(path, async () => {
            await fs.unlink(path).catch((error) => {
                if (isNodeError(error, "ENOENT"))
                    return;
                throw error;
            });
        });
    }
    async write(path, state) {
        await writeJsonAtomic(path, serialize(state), { mode: 0o600 });
        return state;
    }
}
export function workerStatePath(homeDir, projectId, executionId) {
    validateExecutionId(executionId);
    if (typeof homeDir !== "string" || homeDir.length === 0)
        throw new PathSecurityError(homeDir, "home directory is required");
    return join(homeDir, ".arka-norn", "workers", projectId.value, `${executionId}.json`);
}
function createState(input) {
    validateExecutionId(input.executionId);
    if (!Number.isInteger(input.pid) || input.pid <= 0)
        throw new Error("Orchestration worker PID is invalid.");
    const at = cloneDate(input.at, "at");
    return {
        schemaVersion: WORKER_STATE_SCHEMA_VERSION,
        projectId: input.projectId.value,
        executionId: input.executionId,
        pid: input.pid,
        startedAt: at,
        updatedAt: new Date(at.getTime()),
    };
}
function serialize(state) {
    return {
        schemaVersion: state.schemaVersion,
        projectId: state.projectId,
        executionId: state.executionId,
        pid: state.pid,
        startedAt: state.startedAt.toISOString(),
        updatedAt: state.updatedAt.toISOString(),
    };
}
function deserialize(value, path) {
    if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "executionId", "pid", "startedAt", "updatedAt"])) {
        throw new Error(`Invalid orchestration worker state at ${path}.`);
    }
    const pid = value["pid"];
    if (value["schemaVersion"] !== WORKER_STATE_SCHEMA_VERSION || typeof value["projectId"] !== "string" || typeof value["executionId"] !== "string" || typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || typeof value["startedAt"] !== "string" || typeof value["updatedAt"] !== "string") {
        throw new Error(`Invalid orchestration worker state at ${path}.`);
    }
    validateExecutionId(value["executionId"]);
    const startedAt = cloneDate(new Date(value["startedAt"]), "startedAt");
    const updatedAt = cloneDate(new Date(value["updatedAt"]), "updatedAt");
    if (updatedAt.getTime() < startedAt.getTime())
        throw new Error(`Invalid orchestration worker state at ${path}.`);
    return {
        schemaVersion: WORKER_STATE_SCHEMA_VERSION,
        projectId: value["projectId"],
        executionId: value["executionId"],
        pid,
        startedAt,
        updatedAt,
    };
}
function validateExecutionId(value) {
    if (!EXECUTION_ID_PATTERN.test(value))
        throw new Error("Orchestration worker execution id is invalid.");
}
function cloneDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()))
        throw new Error(`Orchestration worker ${field} is invalid.`);
    return new Date(value.getTime());
}
function hasExactKeys(value, keys) {
    return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function invalidState(path, error) {
    return new Error(`Cannot read orchestration worker state at ${path}: ${error instanceof Error ? error.message : String(error)}`);
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-orchestration-worker-state-store.js.map