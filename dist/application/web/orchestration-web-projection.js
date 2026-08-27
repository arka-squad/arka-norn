/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { FeatureId } from "../../domain/feature/feature-id.js";
import { ProjectId } from "../../domain/project/project-id.js";
export async function previewOrchestrationView(runtime, projectId, featureId) {
    if (runtime === undefined)
        throw new Error("Orchestration preview is not configured on this surface.");
    const preview = await runtime.preview({ projectId: ProjectId.of(projectId), featureId: FeatureId.of(featureId) });
    return {
        schemaVersion: 1,
        projectId,
        featureId,
        eligible: preview.eligible,
        planFingerprint: preview.plan?.fingerprint ?? null,
        riskPolicyFingerprint: preview.riskPolicyFingerprint,
        tasks: preview.tasks.map((task) => ({
            id: task.id,
            role: task.role,
            dependencies: [...task.dependencies],
            readScopes: [...task.readScopes],
            writeScopes: [...task.writeScopes],
            deliverables: [...task.deliverables],
            validations: [...task.validations],
        })),
        profiles: preview.profiles.map((profile) => ({ ...profile })),
        preflights: preview.preflights.map((preflight) => ({ profileId: preflight.profileId, healthy: preflight.healthy, code: preflight.code, message: preflight.message })),
        issues: preview.issues.map((issue) => ({ ...issue })),
    };
}
export async function authorizeOrchestrationView(runtime, projectId, input) {
    if (runtime === undefined)
        throw new Error("Orchestration authorization is not configured on this surface.");
    const run = await runtime.start({
        projectId: ProjectId.of(projectId),
        previewFingerprint: input.previewFingerprint,
        actor: input.actor,
        profileByRole: input.profileByRole,
        allowCommits: input.allowCommits,
        applyMode: input.applyMode,
        automaticRiskThreshold: input.automaticRiskThreshold,
        maxParallel: input.maxParallel,
        budgetMode: input.budgetMode,
        budgetLimits: input.budgetLimits,
        openBarProfiles: input.openBarProfiles,
        riskPolicyFingerprint: input.riskPolicyFingerprint,
    });
    return {
        schemaVersion: 1,
        campaignId: run.campaignId,
        status: run.projection.status,
        progress: { ...run.projection.progress },
        applicationFingerprint: run.artifact?.fingerprint ?? null,
        appliedCommit: run.application?.appliedCommit ?? run.artifact?.appliedCommit ?? null,
        riskScore: run.artifact?.risk.totalScore ?? null,
        hardDenials: run.artifact === undefined ? [] : [...run.artifact.risk.hardDenials],
        applicationGate: run.artifact?.applicationGate === undefined ? null : { code: run.artifact.applicationGate.code, message: run.artifact.applicationGate.message },
    };
}
//# sourceMappingURL=orchestration-web-projection.js.map