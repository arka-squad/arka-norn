/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { roleForStep } from "../agents/agent-orchestration.js";
import { projectOrchestration } from "../../domain/orchestration/orchestration-projection.js";
export function createLegacyOrchestrationView(input) {
    const { record, worker, campaign, now } = input;
    const startedAt = record.attempts.at(-1)?.startedAt;
    const endedAt = record.attempts.at(-1)?.endedAt;
    const heartbeatAlive = worker !== undefined && now().getTime() - worker.updatedAt.getTime() < 60_000;
    const lastEvent = record.events.at(-1);
    const changedFiles = campaign?.status === "awaiting_application" ? summarizeChanges(input.changes ?? []) : undefined;
    const changed = changedFiles === undefined ? undefined : { created: changedFiles.created, modified: changedFiles.modified, deleted: changedFiles.deleted, renamed: changedFiles.renamed };
    const role = roleForStep(record.order.preconditions.nextStepId);
    return {
        id: record.id,
        status: record.status,
        ...(record.order.scope.featureId === undefined ? {} : { featureId: record.order.scope.featureId.value }),
        stepId: record.order.preconditions.nextStepId,
        ...(role === undefined ? {} : { role }),
        provider: record.target.provider,
        ...(record.target.model === undefined ? {} : { model: record.target.model }),
        ...(record.providerSessionId === undefined ? {} : { providerSessionId: record.providerSessionId }),
        ...(startedAt === undefined ? {} : { startedAt: startedAt.toISOString() }),
        updatedAt: record.updatedAt.toISOString(),
        ...(startedAt === undefined ? {} : { durationMs: (endedAt ?? now()).getTime() - startedAt.getTime() }),
        ...(worker === undefined ? {} : { heartbeatAt: worker.updatedAt.toISOString() }),
        heartbeatAlive,
        ...(lastEvent === undefined ? {} : { lastEvent: { type: lastEvent.type, at: lastEvent.at.toISOString() } }),
        timeline: record.events.slice(-20).map((event) => ({ type: event.type, at: event.at.toISOString() })),
        stale: (record.status === "planned" || record.status === "running") && !heartbeatAlive,
        providerUsage: { available: false },
        proofReferences: record.proofReferences,
        projection: projectOrchestration({
            projectId: input.projectId,
            ...(campaign === undefined ? {} : { campaign }),
            execution: record,
            ...(changed === undefined ? {} : { changed }),
            now: now(),
        }),
        ...(record.suspensionReason === undefined ? {} : { suspension: record.suspensionReason }),
        ...(campaign === undefined ? {} : { campaign: {
                id: campaign.id,
                status: campaign.status,
                revision: campaign.revision,
                workspaceMode: campaign.workspaceMode,
                completedMissions: campaign.missionIds.length,
                maximumMissions: campaign.maxMissions,
                currentStepId: campaign.currentStepId,
                decisionCount: campaign.decisions.length,
                ...(campaign.runtimeVersion === undefined ? {} : { runtimeVersion: campaign.runtimeVersion }),
                ...(changedFiles === undefined ? {} : { changedFiles }),
                ...(campaign.actionRequired === undefined ? {} : { actionRequired: { kind: campaign.actionRequired.kind, reason: campaign.actionRequired.reason } }),
            } }),
    };
}
function summarizeChanges(changes) {
    const created = changes.filter((change) => change.kind === "created").length;
    const modified = changes.filter((change) => change.kind === "modified").length;
    const deleted = changes.filter((change) => change.kind === "deleted").length;
    const renamed = changes.filter((change) => change.kind === "renamed").length;
    return {
        total: changes.length,
        created,
        modified,
        deleted,
        renamed,
        files: changes.slice(0, 100).map((change) => ({
            path: change.path,
            ...(change.previousPath === undefined ? {} : { previousPath: change.previousPath }),
            kind: change.kind,
            binary: change.binary,
            risk: change.binary || change.kind === "deleted" ? "high" : change.kind === "modified" || change.kind === "renamed" ? "medium" : "low",
        })),
    };
}
//# sourceMappingURL=legacy-orchestration-projection.js.map