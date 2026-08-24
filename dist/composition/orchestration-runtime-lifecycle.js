/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import { AuditUnavailableError } from "../domain/errors.js";
import { executionSuspensionReason } from "../domain/orchestration/execution-record.js";
import { isActive } from "./orchestration-runtime-support.js";
const STALE_WORKER_AFTER_MS = 60_000;
export function createOrchestrationLifecycle(input) {
    async function updateExecution(project, executionId, transition) {
        const registry = await input.registryStore.update(project, (current) => {
            const now = input.clock.now();
            const record = current.find(executionId);
            if (record === undefined)
                throw new Error(`Execution ${executionId} was not found.`);
            return current.replace(transition(record, now), now);
        });
        const updated = registry.find(executionId);
        if (updated === undefined)
            throw new Error(`Execution ${executionId} disappeared from the registry.`);
        return updated;
    }
    async function requireAutomaticProject(project) {
        const current = await input.projects.show(project.id);
        if (current.orchestrationMode !== "automatic")
            throw new Error("Automatic orchestration is disabled for this Project; no new mission was scheduled.");
        return current;
    }
    async function recoverStaleExecutions(project) {
        const registry = await input.registryStore.load(project);
        const now = input.clock.now().getTime();
        for (const record of registry.executions) {
            if (!isActive(record))
                continue;
            let lastSeen = record.updatedAt;
            try {
                const worker = await input.workerStateStore.load(project.id, record.id);
                if (worker !== undefined)
                    lastSeen = worker.updatedAt;
            }
            catch { /* corrupt private heartbeat follows the same stale boundary */ }
            if (now - lastSeen.getTime() < STALE_WORKER_AFTER_MS)
                continue;
            if (record.status === "planned") {
                await updateExecution(project, record.id, (candidate, at) => candidate.reject(executionSuspensionReason("worker_unavailable", "The local worker did not start before its bounded heartbeat window elapsed."), at)).catch(() => undefined);
            }
            else {
                await updateExecution(project, record.id, (candidate, at) => candidate.interrupt(executionSuspensionReason("interrupted", "The local worker heartbeat expired; retry starts a fresh provider run."), at)).catch(() => undefined);
            }
        }
    }
    async function launchOrReject(project, execution, requireAutomaticMode = false) {
        if (requireAutomaticMode && (await input.projects.show(project.id)).orchestrationMode !== "automatic") {
            return updateExecution(project, execution.id, (record, at) => record.reject(executionSuspensionReason("automatic_disabled", "The Project returned to manual mode before the next worker was launched."), at));
        }
        try {
            await input.launcher.launch({ projectId: project.id.value, executionId: execution.id });
            return execution;
        }
        catch {
            return updateExecution(project, execution.id, (record, at) => record.reject(executionSuspensionReason("worker_unavailable", "The local worker could not be launched."), at));
        }
    }
    async function rejectPlanned(project, executionId, code, detail) {
        await updateExecution(project, executionId, (record, at) => record.reject(executionSuspensionReason(code, detail), at)).catch(() => undefined);
    }
    async function safelyInterruptWorker(project, executionId) {
        const record = (await input.registryStore.load(project)).find(executionId);
        if (record?.status !== "running")
            return;
        await updateExecution(project, executionId, (candidate, at) => candidate.interrupt(executionSuspensionReason("interrupted", "The local worker ended before it returned a terminal outcome."), at)).catch(() => undefined);
    }
    async function safelyRejectWorkerStartup(project, executionId) {
        try {
            const record = (await input.registryStore.load(project)).find(executionId);
            if (record?.status === "planned")
                await updateExecution(project, executionId, (candidate, at) => candidate.reject(executionSuspensionReason("worker_unavailable", "The local worker failed before it could dispatch the mission."), at));
            else if (record?.status === "running")
                await safelyInterruptWorker(project, executionId);
        }
        catch { /* the caller still exits non-zero without exposing internals */ }
    }
    async function appendAudit(event) {
        try {
            await input.audit.append(event);
        }
        catch (error) {
            throw new AuditUnavailableError(event.action, error instanceof Error ? error.message : String(error));
        }
    }
    const auditIntent = (project, action, entityId) => appendAudit({ occurredAt: input.clock.now(), action, outcome: "intent", entityType: "project", ...(entityId === undefined ? {} : { entityId }), root: project.root });
    const auditSuccess = (project, action, entityId, details = {}) => appendAudit({ occurredAt: input.clock.now(), action, outcome: "success", entityType: "project", entityId, root: project.root, details });
    const auditFailure = (project, action, entityId) => appendAudit({ occurredAt: input.clock.now(), action, outcome: "failure", entityType: "project", ...(entityId === undefined ? {} : { entityId }), root: project.root });
    return { updateExecution, requireAutomaticProject, recoverStaleExecutions, launchOrReject, rejectPlanned, safelyInterruptWorker, safelyRejectWorkerStartup, auditIntent, auditSuccess, auditFailure };
}
//# sourceMappingURL=orchestration-runtime-lifecycle.js.map