/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { FeatureId } from "../feature/feature-id.js";
import { ProjectId } from "../project/project-id.js";
import { isExecutionTarget } from "./types.js";
export const CAMPAIGN_STATUSES = [
    "planned", "running", "paused", "awaiting_decision", "awaiting_application",
    "blocked", "completed", "cancelled", "abandoned",
];
export const ORCHESTRATION_ACTION_KINDS = [
    "business_decision", "scope_expansion", "capability_expansion", "apply_changes", "retry", "inspect",
];
export class OrchestrationCampaign {
    value;
    constructor(value) {
        this.value = value;
    }
    static create(value) {
        validate(value);
        return new OrchestrationCampaign(freeze(value));
    }
    static planned(input, at) {
        return OrchestrationCampaign.create({ ...input, status: "planned", revision: 1, missionIds: [], decisions: [], createdAt: at, updatedAt: at });
    }
    get props() { return clone(this.value); }
    get id() { return this.value.id; }
    get projectId() { return this.value.projectId; }
    get featureId() { return this.value.featureId; }
    get status() { return this.value.status; }
    get revision() { return this.value.revision; }
    get target() { return { ...this.value.target }; }
    get workspaceMode() { return this.value.workspaceMode; }
    get scopePaths() { return [...this.value.scopePaths]; }
    get missionIds() { return [...this.value.missionIds]; }
    get decisions() { return this.value.decisions.map(copyDecision); }
    get currentStepId() { return this.value.currentStepId; }
    get maxMissions() { return this.value.maxMissions; }
    get retryCount() { return this.value.retryCount; }
    get previewFingerprint() { return this.value.previewFingerprint; }
    get frameworkVersion() { return this.value.frameworkVersion; }
    get runtimeVersion() { return this.value.runtimeVersion; }
    get runtimeFingerprint() { return this.value.runtimeFingerprint; }
    get actionRequired() { return this.value.actionRequired === undefined ? undefined : { ...this.value.actionRequired }; }
    get updatedAt() { return new Date(this.value.updatedAt); }
    start(executionId, at) {
        if (this.value.status !== "planned")
            throw new Error(`Campaign ${this.id} cannot start from ${this.value.status}.`);
        return this.transition("running", at, { missionIds: [executionId] });
    }
    appendMission(executionId, stepId, at) {
        if (this.value.status !== "running")
            throw new Error(`Campaign ${this.id} is not running.`);
        if (this.value.missionIds.length >= this.value.maxMissions)
            return this.requireAction("inspect", "The campaign mission budget is exhausted.", this.value.previewFingerprint, at, "blocked");
        return this.transition("running", at, { missionIds: [...this.value.missionIds, executionId], currentStepId: stepId });
    }
    requireAction(kind, reason, fingerprint, at, status = kind === "apply_changes" ? "awaiting_application" : "awaiting_decision", currentStepId) {
        return this.transition(status, at, { actionRequired: { kind, reason, fingerprint }, ...(currentStepId === undefined ? {} : { currentStepId }) });
    }
    resume(expectedRevision, at) {
        this.assertRevision(expectedRevision);
        if (this.value.status !== "paused")
            throw new Error(`Campaign ${this.id} cannot resume from ${this.value.status}.`);
        return this.transition("running", at, { clearAction: true });
    }
    decide(input, at) {
        this.assertRevision(input.expectedRevision);
        if (this.value.status !== "awaiting_decision" || this.value.actionRequired?.kind !== "business_decision")
            throw new Error(`Campaign ${this.id} is not waiting for a business decision.`);
        if (input.fingerprint !== this.value.actionRequired.fingerprint)
            throw new Error("The decision request changed before confirmation.");
        const decision = { kind: "business_decision", actor: input.actor, choice: input.choice, ...(input.reason === undefined ? {} : { reason: input.reason }), fingerprint: input.fingerprint, recordedAt: at };
        return this.transition("running", at, { clearAction: true, decisions: [...this.value.decisions, decision] });
    }
    retry(input, at) {
        this.assertRevision(input.expectedRevision);
        if (this.value.status !== "blocked" || this.value.actionRequired?.kind !== "retry")
            throw new Error(`Campaign ${this.id} is not waiting for a retry.`);
        if (input.fingerprint !== this.value.actionRequired.fingerprint)
            throw new Error("The retry request changed before confirmation.");
        if (this.value.retryCount >= 1)
            throw new Error(`Campaign ${this.id} already consumed its single retry.`);
        return this.transition("running", at, { clearAction: true, retryCount: this.value.retryCount + 1 });
    }
    pause(at) {
        if (this.value.status !== "running")
            throw new Error(`Campaign ${this.id} cannot pause from ${this.value.status}.`);
        return this.transition("paused", at);
    }
    cancel(at) {
        this.assertMutable("cancel");
        return this.transition("cancelled", at, { clearAction: true });
    }
    abandon(at) {
        this.assertMutable("abandon");
        return this.transition("abandoned", at, { clearAction: true });
    }
    complete(at) {
        if (this.value.status !== "running" && this.value.status !== "awaiting_application")
            throw new Error(`Campaign ${this.id} cannot complete from ${this.value.status}.`);
        return this.transition("completed", at, { clearAction: true });
    }
    assertRevision(expected) {
        if (expected !== this.value.revision)
            throw new Error(`Campaign ${this.id} changed; expected revision ${expected}, current revision ${this.value.revision}.`);
    }
    assertMutable(action) {
        if (["completed", "cancelled", "abandoned"].includes(this.value.status))
            throw new Error(`Campaign ${this.id} cannot ${action} from ${this.value.status}.`);
    }
    transition(status, at, changes = {}) {
        const { actionRequired: currentAction, ...base } = this.value;
        const nextAction = changes.actionRequired ?? currentAction;
        const action = changes.clearAction === true || nextAction === undefined ? {} : { actionRequired: nextAction };
        return OrchestrationCampaign.create({ ...base, ...action, ...(changes.missionIds === undefined ? {} : { missionIds: changes.missionIds }), ...(changes.decisions === undefined ? {} : { decisions: changes.decisions }), ...(changes.currentStepId === undefined ? {} : { currentStepId: changes.currentStepId }), ...(changes.retryCount === undefined ? {} : { retryCount: changes.retryCount }), status, revision: this.value.revision + 1, updatedAt: at });
    }
}
function validate(value) {
    if (!/^campaign-[a-z0-9-]{8,80}$/.test(value.id))
        throw new Error("Invalid orchestration campaign id.");
    if (!(value.projectId instanceof ProjectId) || !(value.featureId instanceof FeatureId))
        throw new Error("Campaign scope is invalid.");
    if (!CAMPAIGN_STATUSES.includes(value.status))
        throw new Error("Campaign status is invalid.");
    if (!Number.isInteger(value.revision) || value.revision < 1)
        throw new Error("Campaign revision is invalid.");
    if (!isExecutionTarget(value.target) || value.target.source !== "user")
        throw new Error("Campaign target must be user-confirmed.");
    if (value.workspaceMode !== "isolated" && value.workspaceMode !== "direct")
        throw new Error("Campaign workspace mode must be configured.");
    if (value.scopePaths.length === 0 || value.scopePaths.some((path) => path === "" || path.startsWith("/") || path.includes("..")))
        throw new Error("Campaign scope paths are invalid.");
    if (!validMissionBudget(value.maxMissions))
        throw new Error("Campaign mission budget is invalid.");
    if (!validRetryCount(value.retryCount))
        throw new Error("Campaign retry budget is invalid.");
    if (value.runtimeVersion !== undefined && !safeHumanText(value.runtimeVersion, 240))
        throw new Error("Campaign runtime version is invalid.");
    if (value.runtimeFingerprint !== undefined && !/^[a-f0-9]{64}$/u.test(value.runtimeFingerprint))
        throw new Error("Campaign runtime fingerprint is invalid.");
    if (new Set(value.missionIds).size !== value.missionIds.length || value.missionIds.length > value.maxMissions)
        throw new Error("Campaign mission history is invalid.");
    if (!Array.isArray(value.decisions) || value.decisions.length > 100 || value.decisions.some((decision) => !validDecision(decision)))
        throw new Error("Campaign decisions are invalid.");
    if (value.actionRequired !== undefined && (!ORCHESTRATION_ACTION_KINDS.includes(value.actionRequired.kind) || value.actionRequired.reason.length === 0 || value.actionRequired.fingerprint.length < 16))
        throw new Error("Campaign required action is invalid.");
    if (Number.isNaN(value.createdAt.getTime()) || Number.isNaN(value.updatedAt.getTime()) || value.updatedAt < value.createdAt)
        throw new Error("Campaign timestamps are invalid.");
}
function clone(value) {
    return { ...value, projectId: ProjectId.of(value.projectId.value), featureId: FeatureId.of(value.featureId.value), target: { ...value.target }, scopePaths: [...value.scopePaths], missionIds: [...value.missionIds], decisions: value.decisions.map(copyDecision), ...(value.actionRequired === undefined ? {} : { actionRequired: { ...value.actionRequired } }), createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) };
}
function freeze(value) {
    const cloned = clone(value);
    return Object.freeze({ ...cloned, target: Object.freeze(cloned.target), scopePaths: Object.freeze(cloned.scopePaths), missionIds: Object.freeze(cloned.missionIds), decisions: Object.freeze(cloned.decisions.map((decision) => Object.freeze(decision))), ...(cloned.actionRequired === undefined ? {} : { actionRequired: Object.freeze(cloned.actionRequired) }) });
}
function copyDecision(value) { return { ...value, recordedAt: new Date(value.recordedAt) }; }
function validDecision(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return false;
    const decision = value;
    return decision.kind === "business_decision" && typeof decision.actor === "string" && safeHumanText(decision.actor, 160)
        && typeof decision.choice === "string" && safeHumanText(decision.choice, 500)
        && (decision.reason === undefined || (typeof decision.reason === "string" && safeHumanText(decision.reason, 500)))
        && typeof decision.fingerprint === "string" && /^[a-f0-9]{64}$/u.test(decision.fingerprint)
        && decision.recordedAt instanceof Date && !Number.isNaN(decision.recordedAt.getTime());
}
function safeHumanText(value, maximum) { return value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function validMissionBudget(value) { return Number.isInteger(value) && value >= 1 && value <= 50; }
function validRetryCount(value) { return Number.isInteger(value) && value >= 0 && value <= 1; }
//# sourceMappingURL=orchestration-campaign.js.map