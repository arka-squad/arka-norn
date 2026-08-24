/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import type { OrchestrationCampaign, OrchestrationActionKind } from "./orchestration-campaign.js";
import type { ExecutionRecord } from "./execution-record.js";

export interface OrchestrationProjection {
  readonly schemaVersion: 1;
  readonly state: string;
  readonly progress: { readonly completedMissions: number; readonly maximumMissions: number };
  readonly currentActivity: string;
  readonly verifiedNextAction: OrchestrationActionKind | "wait" | "start";
  readonly actionRequired: { readonly kind: OrchestrationActionKind; readonly reason: string; readonly fingerprint: string } | null;
  readonly reason: string;
  readonly risks: readonly string[];
  readonly changedFilesSummary: { readonly total: number; readonly created: number; readonly modified: number; readonly deleted: number; readonly renamed: number };
  readonly lastVerifiedAt: string;
  readonly stale: boolean;
  readonly webRoute: string;
  readonly allowedActionIds: readonly string[];
  readonly revision: number;
}

export function projectOrchestration(input: {
  readonly projectId: string;
  readonly campaign?: OrchestrationCampaign;
  readonly execution?: ExecutionRecord;
  readonly now: Date;
  readonly changed?: { readonly created: number; readonly modified: number; readonly deleted: number; readonly renamed: number };
}): OrchestrationProjection {
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

function isRunning(execution: ExecutionRecord | undefined): boolean {
  return execution?.status === "running" || execution?.status === "planned";
}

function currentActivity(campaign: OrchestrationCampaign | undefined): string {
  return campaign === undefined ? "No automatic campaign is active." : `Pipeline step ${campaign.currentStepId}`;
}

function projectionReason(actionReason: string | undefined, execution: ExecutionRecord | undefined, running: boolean): string {
  return actionReason ?? execution?.suspensionReason?.detail ?? (running ? "The verified assistant mission is running." : "No human decision is required.");
}

function campaignRisks(campaign: OrchestrationCampaign | undefined): readonly string[] {
  return campaign?.workspaceMode === "direct" ? ["Changes are written directly to the real Project."] : [];
}

function allowedActions(campaign: OrchestrationCampaign | undefined): readonly string[] {
  if (campaign?.actionRequired !== undefined) return [campaign.actionRequired.kind, "cancel"];
  if (campaign?.status === "running") return ["pause", "cancel"];
  if (campaign?.status === "paused") return ["resume", "cancel", "abandon"];
  if (campaign?.status === "blocked") return ["inspect", "abandon"];
  return campaign === undefined ? ["start"] : [];
}
