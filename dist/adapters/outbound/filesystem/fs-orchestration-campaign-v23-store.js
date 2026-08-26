/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CampaignPlan, RunAuthorization, TaskAttempt } from "../../../domain/orchestration/orchestration-plan.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsOrchestrationCampaignV23Store {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async listCampaignIds(projectId) {
        validateId(projectId);
        try {
            return Object.freeze((await readdir(join(this.homeDir, ".arka-norn", "campaigns-v23", projectId))).filter(safeId).sort());
        }
        catch {
            return [];
        }
    }
    async savePlan(plan) {
        const props = plan.props;
        await writeJsonAtomic(join(base(this.homeDir, props.projectId, props.id), "plan.json"), { ...props, createdAt: props.createdAt.toISOString() }, { mode: 0o600, exclusive: true });
    }
    async loadPlan(projectId, campaignId) {
        const value = await readJson(join(base(this.homeDir, projectId, campaignId), "plan.json"));
        return value === undefined ? undefined : deserializePlan(value);
    }
    async findPlanByFingerprint(projectId, fingerprint) {
        validateId(projectId);
        validateFingerprint(fingerprint);
        let campaigns;
        try {
            campaigns = await readdir(join(this.homeDir, ".arka-norn", "campaigns-v23", projectId));
        }
        catch {
            return undefined;
        }
        for (const campaignId of campaigns.sort().reverse()) {
            if (!safeId(campaignId))
                continue;
            const plan = await this.loadPlan(projectId, campaignId);
            if (plan?.fingerprint === fingerprint)
                return plan;
        }
        return undefined;
    }
    async saveAuthorization(projectId, campaignId, authorization) {
        const props = authorization.props;
        await writeJsonAtomic(join(base(this.homeDir, projectId, campaignId), "authorization.json"), { ...props, confirmedAt: props.confirmedAt.toISOString() }, { mode: 0o600, exclusive: true });
    }
    async loadAuthorization(projectId, campaignId, plan) {
        const value = await readJson(join(base(this.homeDir, projectId, campaignId), "authorization.json"));
        if (value === undefined)
            return undefined;
        if (!isRecord(value) || typeof value["confirmedAt"] !== "string")
            throw new Error("Invalid campaign authorization.");
        return RunAuthorization.create({ ...value, confirmedAt: new Date(value["confirmedAt"]) }, plan);
    }
    async appendAttempt(projectId, campaignId, attempt) {
        const props = attempt.props;
        const directory = join(base(this.homeDir, projectId, campaignId), "attempts", props.taskId);
        await withFileLock(join(directory, "index.json"), async () => {
            const revisions = await attemptRevisions(directory);
            const revision = revisions.length + 1;
            const previous = revision === 1 ? undefined : deserializeAttempt(await readJson(join(directory, revisionFile(revision - 1))));
            assertAttemptTransition(previous, attempt);
            const { startedAt, endedAt, ...plain } = props;
            const stored = { ...plain, ...(startedAt === undefined ? {} : { startedAt: startedAt.toISOString() }), ...(endedAt === undefined ? {} : { endedAt: endedAt.toISOString() }) };
            await writeJsonAtomic(join(directory, `${String(revision).padStart(6, "0")}.json`), stored, { mode: 0o600, exclusive: true });
            await writeJsonAtomic(join(directory, "index.json"), { schemaVersion: 1, revision }, { mode: 0o600 });
        });
    }
    async loadAttempts(projectId, campaignId) {
        const root = join(base(this.homeDir, projectId, campaignId), "attempts");
        let taskIds;
        try {
            taskIds = await readdir(root);
        }
        catch {
            return [];
        }
        const attempts = [];
        for (const taskId of taskIds.sort()) {
            if (!safeId(taskId))
                continue;
            const directory = join(root, taskId);
            const revisions = await attemptRevisions(directory);
            const index = await readJson(join(directory, "index.json"));
            if (index !== undefined && (!isRecord(index) || !Number.isInteger(index["revision"]) || Number(index["revision"]) > revisions.length))
                throw new Error("Invalid task attempt index.");
            for (const revision of revisions) {
                const value = await readJson(join(directory, revisionFile(revision)));
                attempts.push(deserializeAttempt(value));
            }
        }
        return Object.freeze(attempts);
    }
    async saveResult(projectId, campaignId, result) {
        const { fingerprint, ...unsigned } = result;
        if (fingerprint !== artifactFingerprint(unsigned))
            throw new Error("Campaign result fingerprint does not match its immutable content.");
        const value = { ...result, recordedAt: result.recordedAt.toISOString() };
        await writeJsonAtomic(join(base(this.homeDir, projectId, campaignId), "result.json"), value, { mode: 0o600, exclusive: true });
    }
    async loadResult(projectId, campaignId) {
        const value = await readJson(join(base(this.homeDir, projectId, campaignId), "result.json"));
        if (!isStoredResult(value))
            return value === undefined ? undefined : Promise.reject(new Error("Invalid campaign result."));
        const result = { ...value, recordedAt: new Date(value.recordedAt) };
        const { fingerprint, ...unsigned } = result;
        if (fingerprint !== artifactFingerprint(unsigned))
            throw new Error("Campaign result fingerprint does not match its immutable content.");
        return Object.freeze(result);
    }
    async saveApplication(projectId, campaignId, application) {
        const { fingerprint, ...unsigned } = application;
        if (fingerprint !== artifactFingerprint(unsigned))
            throw new Error("Campaign application fingerprint does not match its immutable content.");
        const value = { ...application, recordedAt: application.recordedAt.toISOString() };
        await writeJsonAtomic(join(base(this.homeDir, projectId, campaignId), "application.json"), value, { mode: 0o600, exclusive: true });
    }
    async loadApplication(projectId, campaignId) {
        const value = await readJson(join(base(this.homeDir, projectId, campaignId), "application.json"));
        if (!isStoredApplication(value))
            return value === undefined ? undefined : Promise.reject(new Error("Invalid campaign application artifact."));
        const application = { ...value, recordedAt: new Date(value.recordedAt) };
        const { fingerprint, ...unsigned } = application;
        if (fingerprint !== artifactFingerprint(unsigned))
            throw new Error("Campaign application fingerprint does not match its immutable content.");
        return Object.freeze(application);
    }
}
function base(home, projectId, campaignId) { validateId(projectId); validateId(campaignId); return join(home, ".arka-norn", "campaigns-v23", projectId, campaignId); }
function deserializePlan(value) { if (!isRecord(value) || typeof value["createdAt"] !== "string")
    throw new Error("Invalid campaign plan."); const props = { ...value, createdAt: new Date(value["createdAt"]) }; const { fingerprint, ...unsigned } = props; if (fingerprint !== planFingerprint(unsigned))
    throw new Error("Campaign plan fingerprint does not match its immutable content."); return CampaignPlan.create(props); }
function deserializeAttempt(value) { if (!isRecord(value))
    throw new Error("Invalid task attempt."); return TaskAttempt.create({ ...value, ...(typeof value["startedAt"] === "string" ? { startedAt: new Date(value["startedAt"]) } : {}), ...(typeof value["endedAt"] === "string" ? { endedAt: new Date(value["endedAt"]) } : {}) }); }
async function attemptRevisions(directory) { let names; try {
    names = await readdir(directory);
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return [];
    throw error;
} const revisions = names.filter((name) => /^\d{6}\.json$/u.test(name)).map((name) => Number(name.slice(0, 6))).sort((left, right) => left - right); for (let index = 0; index < revisions.length; index += 1)
    if (revisions[index] !== index + 1)
        throw new Error("Task attempt journal is not contiguous."); return revisions; }
function revisionFile(revision) { return `${String(revision).padStart(6, "0")}.json`; }
function assertAttemptTransition(previous, next) { const current = previous?.props; const candidate = next.props; if (current === undefined) {
    if (candidate.status !== "prepared")
        throw new Error("A task attempt journal must begin with prepared.");
    return;
} const terminal = ["succeeded", "failed", "blocked", "budget_stopped", "cancelled"].includes(current.status); if (terminal && candidate.status === "prepared" && candidate.id !== current.id)
    return; if (candidate.id !== current.id || candidate.taskId !== current.taskId || candidate.profileId !== current.profileId || candidate.worktree !== current.worktree || candidate.branch !== current.branch)
    throw new Error("Task attempt identity changed within a revision chain."); const allowed = current.status === "prepared" ? ["running", "failed", "blocked", "cancelled"] : current.status === "running" ? ["succeeded", "failed", "blocked", "budget_stopped", "cancelled"] : []; if (!allowed.includes(candidate.status))
    throw new Error(`Invalid task attempt transition ${current.status} -> ${candidate.status}.`); }
function isStoredResult(value) { return isRecord(value) && value["schemaVersion"] === 1 && typeof value["fingerprint"] === "string" && /^[a-f0-9]{64}$/u.test(value["fingerprint"]) && isRecord(value["integration"]) && Array.isArray(value["commits"]) && isRecord(value["risk"]) && typeof value["recordedAt"] === "string"; }
function isStoredApplication(value) { return isRecord(value) && value["schemaVersion"] === 1 && typeof value["candidateFingerprint"] === "string" && /^[a-f0-9]{64}$/u.test(value["candidateFingerprint"]) && typeof value["appliedCommit"] === "string" && /^[a-f0-9]{40,64}$/u.test(value["appliedCommit"]) && typeof value["fingerprint"] === "string" && /^[a-f0-9]{64}$/u.test(value["fingerprint"]) && typeof value["recordedAt"] === "string"; }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeId(value) { return /^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value); }
function validateId(value) { if (!safeId(value))
    throw new TypeError("Invalid campaign store identity."); }
function validateFingerprint(value) { if (!/^[a-f0-9]{64}$/u.test(value))
    throw new TypeError("Invalid campaign plan fingerprint."); }
function planFingerprint(value) { const canonical = { ...value, createdAt: value.createdAt.toISOString(), tasks: value.tasks.map((task) => ({ ...task, dependencies: [...task.dependencies].sort(), readScopes: [...task.readScopes].sort(), writeScopes: [...task.writeScopes].sort(), deliverables: [...task.deliverables], validations: [...task.validations] })), snapshot: { ...value.snapshot, declaredUntracked: [...value.snapshot.declaredUntracked].sort() } }; return createHash("sha256").update(JSON.stringify(canonical)).digest("hex"); }
function artifactFingerprint(value) { return createHash("sha256").update(JSON.stringify(value, (_key, entry) => entry instanceof Date ? entry.toISOString() : entry)).digest("hex"); }
function isNodeError(error, code) { return error instanceof Error && "code" in error && error.code === code; }
//# sourceMappingURL=fs-orchestration-campaign-v23-store.js.map