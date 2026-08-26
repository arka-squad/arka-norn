/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { isExecutionTransport } from "./execution-profile.js";
export const TASK_ATTEMPT_STATUSES = ["prepared", "running", "succeeded", "failed", "blocked", "budget_stopped", "cancelled"];
export const BUDGET_MODES = ["admission", "hard-stop", "observe"];
export class CampaignPlan {
    value;
    constructor(value) {
        this.value = value;
    }
    static create(value) {
        validateCampaignPlan(value);
        return new CampaignPlan(freezePlan(value));
    }
    get props() { return clonePlan(this.value); }
    get tasks() { return this.value.tasks.map(cloneTask); }
    get fingerprint() { return this.value.fingerprint; }
    ready(completedTaskIds, runningTaskIds) {
        const completed = new Set(completedTaskIds);
        const running = new Set(runningTaskIds);
        return this.value.tasks
            .filter((task) => !completed.has(task.id) && !running.has(task.id) && task.dependencies.every((dependency) => completed.has(dependency)))
            .sort((left, right) => right.priority - left.priority || left.id.localeCompare(right.id))
            .map(cloneTask);
    }
}
export class RunAuthorization {
    value;
    constructor(value) {
        this.value = value;
    }
    static create(value, plan) {
        validateRunAuthorization(value, plan);
        return new RunAuthorization(freezeAuthorization(value));
    }
    get props() { return cloneAuthorization(this.value); }
    profileFor(role) {
        const profile = this.value.profileByRole[role];
        if (profile === undefined)
            throw new Error(`No execution profile was authorized for role ${role}.`);
        return profile;
    }
}
export class TaskAttempt {
    value;
    constructor(value) {
        this.value = value;
    }
    static create(value) {
        validateTaskAttempt(value);
        return new TaskAttempt(freezeAttempt(value));
    }
    get props() { return cloneAttempt(this.value); }
    get status() { return this.value.status; }
}
function validateCampaignPlan(value) {
    if (value.schemaVersion !== 1 || !safeId(value.id, 100) || !safeId(value.projectId, 120) || !safeId(value.featureId, 120))
        throw new TypeError("Campaign plan identity is invalid.");
    if (!sha(value.snapshot.commit) || !sha(value.snapshot.tree) || !fingerprint(value.snapshot.fingerprint))
        throw new TypeError("Campaign snapshot is invalid.");
    if (typeof value.snapshot.clean !== "boolean")
        throw new TypeError("Campaign snapshot cleanliness is invalid.");
    validateScopes(value.snapshot.declaredUntracked, true);
    if (value.tasks.length === 0 || value.tasks.length > 100)
        throw new TypeError("Campaign tasks are invalid.");
    const ids = new Set();
    for (const task of value.tasks) {
        validateTask(task);
        if (ids.has(task.id))
            throw new TypeError(`Duplicate campaign task ${task.id}.`);
        ids.add(task.id);
    }
    for (const task of value.tasks)
        for (const dependency of task.dependencies)
            if (!ids.has(dependency) || dependency === task.id)
                throw new TypeError(`Task ${task.id} has an invalid dependency.`);
    assertAcyclic(value.tasks);
    assertIndependentScopesDoNotOverlap(value.tasks);
    if (!safeId(value.integrationRole, 80) || !safeAgentId(value.integrationAgentId))
        throw new TypeError("Campaign integration identity is invalid.");
    validateProfileRequirement(value.integrationRequiredProfile);
    if (!Number.isInteger(value.maximumParallelism) || value.maximumParallelism < 1 || value.maximumParallelism > 32)
        throw new TypeError("Campaign maximum parallelism is invalid.");
    if (!fingerprint(value.fingerprint) || !validDate(value.createdAt))
        throw new TypeError("Campaign plan fingerprint or timestamp is invalid.");
}
function validateTask(value) {
    if (!safeId(value.id, 100) || !safeAgentId(value.agentId) || !safeId(value.role, 80) || !Number.isInteger(value.priority) || value.priority < 0 || value.priority > 10_000)
        throw new TypeError("Task identity, agent, role or priority is invalid.");
    validateProfileRequirement(value.requiredProfile);
    if (!uniqueIds(value.dependencies, 100))
        throw new TypeError(`Task ${value.id} dependencies are invalid.`);
    validateScopes(value.readScopes, false);
    validateScopes(value.writeScopes, false);
    if (!value.writeScopes.every((scope) => value.readScopes.some((readScope) => containsScope(readScope, scope))))
        throw new TypeError(`Task ${value.id} write scope exceeds its read scope.`);
    if (!safeTexts(value.deliverables, 100, 300) || !safeTexts(value.validations, 100, 300))
        throw new TypeError(`Task ${value.id} deliverables or validations are invalid.`);
}
function validateRunAuthorization(value, plan) {
    if (value.schemaVersion !== 1 || value.campaignPlanFingerprint !== plan.fingerprint || !safeText(value.actor, 160))
        throw new TypeError("Run authorization identity is invalid.");
    if (typeof value.allowCommits !== "boolean" || !["human", "automatic"].includes(value.applyMode))
        throw new TypeError("Run authorization mutation policy is invalid.");
    if (!Number.isInteger(value.automaticRiskThreshold) || value.automaticRiskThreshold < 0 || value.automaticRiskThreshold > 20)
        throw new TypeError("Automatic risk threshold must be between 0 and 20.");
    if (value.applyMode === "automatic" && !value.allowCommits)
        throw new TypeError("Automatic application requires commit authority.");
    if (value.maxParallel !== "all" && (!Number.isInteger(value.maxParallel) || value.maxParallel < 1 || value.maxParallel > 32))
        throw new TypeError("Run parallelism is invalid.");
    if (!BUDGET_MODES.includes(value.budgetMode))
        throw new TypeError("Run budget mode is invalid.");
    if (!fingerprint(value.riskPolicyFingerprint) || !validDate(value.confirmedAt))
        throw new TypeError("Run risk policy confirmation is invalid.");
    const roles = new Set([...plan.tasks.map((task) => task.role), plan.props.integrationRole]);
    const configuredRoles = Object.keys(value.profileByRole);
    if (configuredRoles.length !== roles.size || configuredRoles.some((role) => !roles.has(role) || !safeId(value.profileByRole[role] ?? "", 80)))
        throw new TypeError("Every campaign role must have exactly one authorized profile.");
    const fingerprintRoles = Object.keys(value.profileFingerprintByRole);
    if (fingerprintRoles.length !== roles.size || fingerprintRoles.some((role) => !roles.has(role) || !fingerprint(value.profileFingerprintByRole[role] ?? "")))
        throw new TypeError("Every campaign role must freeze exactly one execution profile fingerprint.");
    const seenLimits = new Set();
    validateBudgetLimits(value.budgetLimits, seenLimits);
    if (!uniqueIds(value.openBarProfiles, 64))
        throw new TypeError("Open-bar profile allowlist is invalid.");
    const authorizedProfiles = new Set(Object.values(value.profileByRole));
    if (value.openBarProfiles.some((profileId) => !authorizedProfiles.has(profileId)))
        throw new TypeError("Open-bar allowlist contains an unauthorized profile.");
    for (const profileId of authorizedProfiles) {
        if (!value.openBarProfiles.includes(profileId) && !value.budgetLimits.some((limit) => limit.profileId === profileId))
            throw new TypeError(`Profile ${profileId} requires a budget limit or explicit open-bar authorization.`);
    }
}
function validateTaskAttempt(value) {
    if (value.schemaVersion !== 1 || !safeId(value.id, 120) || !safeId(value.taskId, 100) || !safeId(value.profileId, 80))
        throw new TypeError("Task attempt identity is invalid.");
    if (!TASK_ATTEMPT_STATUSES.includes(value.status))
        throw new TypeError("Task attempt status is invalid.");
    if (!safePath(value.worktree) || !safeText(value.branch, 240))
        throw new TypeError("Task attempt worktree or branch is invalid.");
    if (value.commit !== undefined && !sha(value.commit))
        throw new TypeError("Task attempt commit is invalid.");
    if (!safeTexts(value.proofReferences, 100, 512))
        throw new TypeError("Task attempt proofs are invalid.");
    if (value.failureCode !== undefined && !safeId(value.failureCode, 100))
        throw new TypeError("Task attempt failure code is invalid.");
    if (value.startedAt !== undefined && !validDate(value.startedAt))
        throw new TypeError("Task attempt start is invalid.");
    if (value.endedAt !== undefined && (!validDate(value.endedAt) || value.startedAt === undefined || value.endedAt < value.startedAt))
        throw new TypeError("Task attempt end is invalid.");
    if (["succeeded", "failed", "blocked", "budget_stopped", "cancelled"].includes(value.status) !== (value.endedAt !== undefined))
        throw new TypeError("Terminal task attempts require an end timestamp.");
    if (value.status === "succeeded" && (value.commit === undefined || value.proofReferences.length === 0))
        throw new TypeError("Successful task attempts require a commit and proof.");
}
function assertAcyclic(tasks) {
    const byId = new Map(tasks.map((task) => [task.id, task]));
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
        if (visiting.has(id))
            throw new TypeError("Campaign task graph contains a cycle.");
        if (visited.has(id))
            return;
        visiting.add(id);
        for (const dependency of byId.get(id).dependencies)
            visit(dependency);
        visiting.delete(id);
        visited.add(id);
    };
    for (const task of tasks)
        visit(task.id);
}
function assertIndependentScopesDoNotOverlap(tasks) {
    for (let leftIndex = 0; leftIndex < tasks.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < tasks.length; rightIndex += 1) {
            const left = tasks[leftIndex];
            const right = tasks[rightIndex];
            if (dependsOn(tasks, left.id, right.id) || dependsOn(tasks, right.id, left.id))
                continue;
            if (left.writeScopes.some((leftScope) => right.writeScopes.some((rightScope) => scopesOverlap(leftScope, rightScope))))
                throw new TypeError(`Independent tasks ${left.id} and ${right.id} have overlapping write scopes.`);
        }
    }
}
function dependsOn(tasks, taskId, candidateDependency, seen = new Set()) {
    if (seen.has(taskId))
        return false;
    seen.add(taskId);
    const task = tasks.find((entry) => entry.id === taskId);
    return task?.dependencies.some((dependency) => dependency === candidateDependency || dependsOn(tasks, dependency, candidateDependency, seen)) ?? false;
}
function validateScopes(scopes, allowEmpty) {
    if ((!allowEmpty && scopes.length === 0) || scopes.length > 100 || new Set(scopes).size !== scopes.length || scopes.some((scope) => !safeScope(scope)))
        throw new TypeError("Task scopes are invalid.");
}
function safeScope(value) { return value === "." || (value.length <= 512 && !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")); }
function validateProfileRequirement(value) { if (value.transports.length === 0 || new Set(value.transports).size !== value.transports.length || value.transports.some((transport) => !isExecutionTransport(transport)) || value.capabilities.length === 0 || new Set(value.capabilities).size !== value.capabilities.length || value.capabilities.some((capability) => !["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"].includes(capability)))
    throw new TypeError("Task execution profile requirement is invalid."); }
function safePath(value) { return value.startsWith("/") && value.length <= 2048 && !/[\u0000-\u001f\u007f]/u.test(value); }
function containsScope(parent, child) { return parent === "." || parent === child || child.startsWith(`${parent}/`); }
function scopesOverlap(left, right) { return containsScope(left, right) || containsScope(right, left); }
function uniqueIds(values, maximum) { return values.length <= maximum && new Set(values).size === values.length && values.every((value) => safeId(value, 100)); }
function safeTexts(values, maximum, length) { return values.length <= maximum && values.every((value) => safeText(value, length)); }
function validateBudgetLimits(limits, seen) { for (const limit of limits) {
    const key = `${limit.profileId}:${limit.metric}`;
    if (limit.metric === "unknown" || !safeId(limit.profileId, 80) || !Number.isFinite(limit.maximum) || limit.maximum <= 0 || seen.has(key))
        throw new TypeError("Run budget limit is invalid.");
    seen.add(key);
} }
function safeId(value, maximum) { return value.length > 0 && value.length <= maximum && /^[a-z0-9][a-z0-9._-]*$/u.test(value); }
function safeAgentId(value) { return /^[A-Z][A-Za-z0-9-]{0,39}_[a-z][a-z0-9-]{0,39}_\d{8}(?:_\d{2})?$/u.test(value); }
function safeText(value, maximum) { return value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function sha(value) { return /^[a-f0-9]{40,64}$/u.test(value); }
function fingerprint(value) { return /^[a-f0-9]{64}$/u.test(value); }
function validDate(value) { return value instanceof Date && !Number.isNaN(value.getTime()); }
function cloneTask(value) { return { ...value, requiredProfile: { transports: [...value.requiredProfile.transports], capabilities: [...value.requiredProfile.capabilities] }, dependencies: [...value.dependencies], readScopes: [...value.readScopes], writeScopes: [...value.writeScopes], deliverables: [...value.deliverables], validations: [...value.validations] }; }
function clonePlan(value) { return { ...value, integrationRequiredProfile: { transports: [...value.integrationRequiredProfile.transports], capabilities: [...value.integrationRequiredProfile.capabilities] }, snapshot: { ...value.snapshot, declaredUntracked: [...value.snapshot.declaredUntracked] }, tasks: value.tasks.map(cloneTask), createdAt: new Date(value.createdAt) }; }
function freezePlan(value) { const copy = clonePlan(value); return Object.freeze({ ...copy, integrationRequiredProfile: Object.freeze({ transports: Object.freeze([...copy.integrationRequiredProfile.transports]), capabilities: Object.freeze([...copy.integrationRequiredProfile.capabilities]) }), snapshot: Object.freeze({ ...copy.snapshot, declaredUntracked: Object.freeze(copy.snapshot.declaredUntracked) }), tasks: Object.freeze(copy.tasks.map((task) => Object.freeze({ ...task, requiredProfile: Object.freeze({ transports: Object.freeze([...task.requiredProfile.transports]), capabilities: Object.freeze([...task.requiredProfile.capabilities]) }), dependencies: Object.freeze(task.dependencies), readScopes: Object.freeze(task.readScopes), writeScopes: Object.freeze(task.writeScopes), deliverables: Object.freeze(task.deliverables), validations: Object.freeze(task.validations) }))) }); }
function cloneAuthorization(value) { return { ...value, profileByRole: { ...value.profileByRole }, profileFingerprintByRole: { ...value.profileFingerprintByRole }, budgetLimits: value.budgetLimits.map((limit) => ({ ...limit })), openBarProfiles: [...value.openBarProfiles], confirmedAt: new Date(value.confirmedAt) }; }
function freezeAuthorization(value) { const copy = cloneAuthorization(value); return Object.freeze({ ...copy, profileByRole: Object.freeze(copy.profileByRole), profileFingerprintByRole: Object.freeze(copy.profileFingerprintByRole), budgetLimits: Object.freeze(copy.budgetLimits.map((limit) => Object.freeze(limit))), openBarProfiles: Object.freeze(copy.openBarProfiles) }); }
function cloneAttempt(value) { return { ...value, proofReferences: [...value.proofReferences], ...(value.startedAt === undefined ? {} : { startedAt: new Date(value.startedAt) }), ...(value.endedAt === undefined ? {} : { endedAt: new Date(value.endedAt) }) }; }
function freezeAttempt(value) { const copy = cloneAttempt(value); return Object.freeze({ ...copy, proofReferences: Object.freeze(copy.proofReferences) }); }
//# sourceMappingURL=orchestration-plan.js.map