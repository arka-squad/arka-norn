export function projectOrchestration(input) {
    const campaign = input.campaign;
    const execution = input.execution;
    const changed = input.changed ?? { created: 0, modified: 0, deleted: 0, renamed: 0 };
    const action = campaign?.actionRequired;
    const running = isRunning(execution);
    const stale = running && input.now.getTime() - (execution?.updatedAt.getTime() ?? input.now.getTime()) > 60_000;
    return {
        schemaVersion: 1,
        state: campaign?.status ?? execution?.status ?? "idle",
        progress: { completedMissions: campaign?.missionIds.length ?? 0, maximumMissions: campaign?.maxMissions ?? 0 },
        currentActivity: currentActivity(campaign),
        verifiedNextAction: action?.kind ?? (running ? "wait" : "start"),
        actionRequired: action === undefined ? null : { ...action },
        reason: projectionReason(action?.reason, execution, running),
        risks: campaignRisks(campaign),
        changedFilesSummary: { total: changed.created + changed.modified + changed.deleted + changed.renamed, ...changed },
        lastVerifiedAt: (campaign?.updatedAt ?? execution?.updatedAt ?? input.now).toISOString(),
        stale,
        webRoute: `/projects/${encodeURIComponent(input.projectId)}/live`,
        allowedActionIds: allowedActions(campaign),
        revision: campaign?.revision ?? 0,
    };
}
function isRunning(execution) {
    return execution?.status === "running" || execution?.status === "planned";
}
function currentActivity(campaign) {
    return campaign === undefined ? "No automatic campaign is active." : `Pipeline step ${campaign.currentStepId}`;
}
function projectionReason(actionReason, execution, running) {
    return actionReason ?? execution?.suspensionReason?.detail ?? (running ? "The verified assistant mission is running." : "No human decision is required.");
}
function campaignRisks(campaign) {
    return campaign?.workspaceMode === "direct" ? ["Changes are written directly to the real Project."] : [];
}
function allowedActions(campaign) {
    if (campaign?.actionRequired !== undefined)
        return [campaign.actionRequired.kind, "cancel"];
    if (campaign?.status === "running")
        return ["pause", "cancel"];
    if (campaign?.status === "paused")
        return ["resume", "cancel", "abandon"];
    if (campaign?.status === "blocked")
        return ["inspect", "abandon"];
    return campaign === undefined ? ["start"] : [];
}
//# sourceMappingURL=orchestration-projection.js.map