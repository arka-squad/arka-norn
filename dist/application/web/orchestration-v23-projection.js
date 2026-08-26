/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
export function v23Tasks(plan, attempts, projection) {
    const latest = new Map();
    for (const attempt of attempts)
        latest.set(attempt.props.taskId, attempt);
    return plan.tasks.map((task) => {
        const attempt = latest.get(task.id)?.props;
        return {
            id: task.id, agentId: task.agentId, role: task.role, status: projection?.tasks[task.id] ?? "planned",
            ...(attempt === undefined ? {} : { profileId: attempt.profileId }), dependencies: [...task.dependencies],
            readScopes: [...task.readScopes], writeScopes: [...task.writeScopes], proofCount: attempt?.proofReferences.length ?? 0,
        };
    });
}
export function v23Dag(plan, tasks, result, application, authorization) {
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
export function v23Campaign(id, status, plan, projection, activeTaskId) {
    return {
        id, status, revision: projection?.revision ?? 0, workspaceMode: "isolated",
        completedMissions: projection?.progress.succeeded ?? 0, maximumMissions: plan.tasks.length,
        currentStepId: activeTaskId ?? "campaign", decisionCount: 0,
        ...(status !== "awaiting_application" ? {} : { actionRequired: { kind: "human_application", reason: "Review the risk score and confirmed application fingerprint." } }),
    };
}
//# sourceMappingURL=orchestration-v23-projection.js.map