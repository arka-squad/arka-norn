/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import { createHash } from "node:crypto";
import { relative, resolve } from "node:path";
import { roleForStep } from "../application/agents/agent-orchestration.js";
import { Feature } from "../domain/feature/feature.js";
import { ExecutionRecord } from "../domain/orchestration/execution-record.js";
import { MissionOrder } from "../domain/orchestration/mission-order.js";
import { sameExecutionTarget } from "../domain/orchestration/types.js";
import { requirementsForExecution } from "./orchestration-provider-configuration.js";
import { isActive, nextExecutionId, nextMissionId } from "./orchestration-runtime-support.js";
export function createCampaignRuntime(input) {
    async function update(project, campaignId, transform) {
        const campaigns = await input.campaignStore.update(project, (current) => current.map((campaign) => campaign.id === campaignId ? transform(campaign) : campaign));
        return requireCampaign(campaigns, campaignId);
    }
    async function featureInWorkspace(project, feature, campaign) {
        if (campaign.workspaceMode === "direct")
            return feature;
        const workspace = await input.workspaceManager.open(project, campaign);
        const featureRelativePath = relative(project.root, feature.root);
        if (featureRelativePath === "" || featureRelativePath === ".." || featureRelativePath.startsWith("../") || featureRelativePath.startsWith("..\\"))
            throw new Error("The Feature is outside the Product root.");
        return Feature.create({
            id: feature.id,
            projectId: feature.projectId,
            name: feature.name,
            root: resolve(workspace.physicalRoot, featureRelativePath),
            pipelineId: feature.pipelineId,
            schemaVersion: feature.schemaVersion,
            documentContractVersion: feature.documentContractVersion,
            createdAt: feature.createdAt,
            updatedAt: feature.updatedAt,
        });
    }
    async function advance(project, executionId, workspaceFeature) {
        const campaign = (await input.campaignStore.load(project)).find((candidate) => candidate.missionIds.includes(executionId));
        if (campaign === undefined || campaign.status !== "running")
            return;
        const report = (await input.missionPlanner.inspectWorkspaceFeature(project, workspaceFeature)).report;
        const next = report.nextActions[0];
        if (next === undefined) {
            if (campaign.workspaceMode === "direct") {
                await update(project, campaign.id, (candidate) => candidate.complete(input.clock.now()));
                return;
            }
            const changes = await input.workspaceManager.changes(project, campaign);
            await update(project, campaign.id, (candidate) => candidate.requireAction("apply_changes", `${changes.changes.length} verified workspace change(s) are ready for human validation.`, changes.fingerprint, input.clock.now()));
            return;
        }
        if (next.decisionGate !== "continue") {
            await update(project, campaign.id, (candidate) => candidate.requireAction("business_decision", `A human decision is required before Pipeline step ${next.stepId}.`, actionFingerprint(candidate, "business_decision", next.stepId), input.clock.now(), "awaiting_decision", next.stepId));
            return;
        }
        await continueOrBlock(project, campaign, next.stepId);
    }
    async function continueOrBlock(project, campaign, stepId) {
        try {
            return await scheduleContinuation(project, campaign, stepId);
        }
        catch (error) {
            await update(project, campaign.id, (current) => current.requireAction("inspect", `The campaign could not continue: ${boundedFailure(error)}`, actionFingerprint(current, "inspect", stepId), input.clock.now(), "blocked", stepId));
            return undefined;
        }
    }
    async function scheduleContinuation(project, campaign, stepId) {
        if (campaign.missionIds.length >= campaign.maxMissions) {
            await update(project, campaign.id, (current) => current.requireAction("inspect", "The confirmed campaign mission budget is exhausted; a new preview is required.", actionFingerprint(current, "inspect", stepId), input.clock.now(), "blocked", stepId));
            return undefined;
        }
        const role = roleForStep(stepId);
        if (role === undefined)
            throw new Error(`Pipeline step ${stepId} has no bounded assistant role.`);
        const requirements = requirementsForExecution(role);
        const policy = await input.policyStore.load(project);
        if (policy === undefined || !policy.allowsTarget(campaign.target, requirements))
            throw new Error("The campaign target is no longer allowed by Project policy.");
        const registry = await input.registryStore.load(project);
        const active = registry.executions.find(isActive);
        if (active !== undefined)
            throw new Error(`Execution ${active.id} is still active.`);
        const at = input.clock.now();
        const feature = await input.features.show(campaign.featureId);
        const executionId = nextExecutionId();
        const order = MissionOrder.create({
            id: nextMissionId(),
            scope: { projectId: project.id, featureId: campaign.featureId, paths: campaign.scopePaths },
            preconditions: { pipelineId: feature.pipelineId, nextStepId: stepId },
            requiredCapabilities: requirements.capabilities,
            requiredPermissions: requirements.permissions,
            summary: `Continue the verified campaign with Pipeline step ${stepId}.`,
            issuedAt: at,
        });
        const planned = ExecutionRecord.planned(executionId, order, campaign.target, at).appendEvent("campaign_continued", `campaign=${campaign.id}; step=${stepId}`, at);
        await input.registryStore.update(project, (current) => current.add(planned, at));
        await update(project, campaign.id, (current) => current.appendMission(executionId, stepId, at));
        return input.launch(project, planned);
    }
    async function validateContinuation(project, campaign) {
        const currentProject = await input.projects.show(project.id);
        if (currentProject.orchestrationMode !== "automatic")
            throw new Error("Automatic orchestration is disabled; a new preview is required.");
        if (campaign.frameworkVersion !== input.frameworkVersion)
            throw new Error("The arka.norn framework changed; a new campaign preview is required.");
        const policy = await input.policyStore.load(project);
        const role = roleForStep(campaign.currentStepId);
        if (policy === undefined || policy.workspaceMode !== campaign.workspaceMode || role === undefined || !policy.allowsTarget(campaign.target, requirementsForExecution(role))) {
            throw new Error("The orchestration policy or current Pipeline role changed; a new preview is required.");
        }
        const health = await input.missionPlanner.targetHealth(project, policy);
        const currentRuntime = health.find((entry) => sameExecutionTarget(entry.target, campaign.target));
        if (currentRuntime?.healthy !== true)
            throw new Error("The confirmed CLI provider is no longer available; a new preview is required.");
        if (campaign.runtimeFingerprint !== undefined && currentRuntime.runtimeFingerprint !== campaign.runtimeFingerprint) {
            throw new Error("The confirmed CLI runtime changed; a new campaign preview is required.");
        }
        await input.workspaceManager.verifyResume(project, campaign);
    }
    async function cleanupUnstarted(project, campaign) {
        const current = (await input.campaignStore.load(project)).find((candidate) => candidate.id === campaign.id);
        if (current?.status !== "planned" || current.missionIds.length !== 0)
            return;
        await input.workspaceManager.discard(project, current);
        await update(project, current.id, (candidate) => candidate.abandon(input.clock.now()));
    }
    function requestDecision(project, campaign, reason) {
        return update(project, campaign.id, (current) => current.requireAction("business_decision", reason, actionFingerprint(current, "business_decision", current.currentStepId), input.clock.now(), "awaiting_decision"));
    }
    function requestRetry(project, campaign, reason) {
        const exhausted = campaign.retryCount >= 1;
        return update(project, campaign.id, (current) => current.requireAction(exhausted ? "inspect" : "retry", exhausted ? `The single campaign retry is exhausted. ${reason}` : reason, actionFingerprint(current, exhausted ? "inspect" : "retry", current.currentStepId), input.clock.now(), "blocked"));
    }
    async function reconcileFailure(project, executionId) {
        const record = (await input.registryStore.load(project)).find(executionId);
        if (record === undefined || !["failed", "cancelled", "interrupted", "rejected"].includes(record.status))
            return;
        const campaign = (await input.campaignStore.load(project)).find((candidate) => candidate.status === "running" && candidate.missionIds.includes(executionId));
        if (campaign === undefined)
            return;
        if (record.suspensionReason?.code === "permission_not_preapproved") {
            await update(project, campaign.id, (current) => current.requireAction("inspect", "The provider requested a capability outside the confirmed envelope; a new preview is required.", current.previewFingerprint, input.clock.now(), "blocked"));
            return;
        }
        await requestRetry(project, campaign, record.suspensionReason?.detail ?? "The mission stopped without verified proof. Confirm the single campaign retry or inspect the failure.");
    }
    return { update, featureInWorkspace, advance, continueOrBlock, validateContinuation, cleanupUnstarted, requestDecision, requestRetry, reconcileFailure };
}
function requireCampaign(campaigns, campaignId) {
    const campaign = campaigns.find((candidate) => candidate.id === campaignId);
    if (campaign === undefined)
        throw new Error(`Campaign ${campaignId} was not found.`);
    return campaign;
}
function actionFingerprint(campaign, kind, stepId) {
    return createHash("sha256").update(JSON.stringify({ campaignId: campaign.id, revision: campaign.revision, kind, stepId, preview: campaign.previewFingerprint })).digest("hex");
}
function boundedFailure(error) {
    const value = error instanceof Error ? error.message : "the verified continuation failed";
    const cleaned = value.replace(/[\u0000-\u001f\u007f]/gu, " ").trim();
    return cleaned.length === 0 ? "the verified continuation failed" : cleaned.slice(0, 400);
}
//# sourceMappingURL=orchestration-campaign-runtime.js.map