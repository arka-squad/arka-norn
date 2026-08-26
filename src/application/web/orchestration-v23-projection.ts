/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { CampaignEventProjection } from "../../domain/orchestration/orchestration-event.js";
import type { CampaignPlan, RunAuthorization, TaskAttempt } from "../../domain/orchestration/orchestration-plan.js";
import type { CampaignApplicationArtifact, CampaignResultArtifact } from "../../ports/outbound/orchestration-campaign-v23-store.js";
import type { OrchestrationTrackingView } from "./contracts.js";

type TaskView = NonNullable<OrchestrationTrackingView["dag"]>["tasks"][number];

export function v23Tasks(plan: CampaignPlan, attempts: readonly TaskAttempt[], projection: CampaignEventProjection | undefined): readonly TaskView[] {
  const latest = new Map<string, TaskAttempt>();
  for (const attempt of attempts) latest.set(attempt.props.taskId, attempt);
  return plan.tasks.map((task) => {
    const attempt = latest.get(task.id)?.props;
    return {
      id: task.id, agentId: task.agentId, role: task.role, status: projection?.tasks[task.id] ?? "planned",
      ...(attempt === undefined ? {} : { profileId: attempt.profileId }), dependencies: [...task.dependencies],
      readScopes: [...task.readScopes], writeScopes: [...task.writeScopes], proofCount: attempt?.proofReferences.length ?? 0,
    };
  });
}

export function v23Dag(plan: CampaignPlan, tasks: readonly TaskView[], result: CampaignResultArtifact | undefined, application: CampaignApplicationArtifact | undefined, authorization: RunAuthorization | undefined): NonNullable<OrchestrationTrackingView["dag"]> {
  return {
    planFingerprint: plan.fingerprint,
    ...(authorization === undefined ? {} : { riskPolicyFingerprint: authorization.props.riskPolicyFingerprint }), tasks,
    ...(result === undefined ? {} : {
      risk: { score: result.risk.totalScore, automaticEligible: result.risk.automaticEligible, hardDenials: [...result.risk.hardDenials] },
      applicationFingerprint: application?.fingerprint ?? result.fingerprint,
      ...(result.applicationGate === undefined ? {} : { applicationGate: { ...result.applicationGate } }),
    }),
    requiresHumanApproval: result !== undefined && result.appliedCommit === undefined && application === undefined,
    discardedHunkCount: result?.integration.discardedHunks?.length ?? 0,
  };
}

export function v23Campaign(id: string, status: string, plan: CampaignPlan, projection: CampaignEventProjection | undefined, activeTaskId: string | undefined): NonNullable<OrchestrationTrackingView["campaign"]> {
  return {
    id, status, revision: projection?.revision ?? 0, workspaceMode: "isolated",
    completedMissions: projection?.progress.succeeded ?? 0, maximumMissions: plan.tasks.length,
    currentStepId: activeTaskId ?? "campaign", decisionCount: 0,
    ...(status !== "awaiting_application" ? {} : { actionRequired: { kind: "human_application", reason: "Review the risk score and confirmed application fingerprint." } }),
  };
}
