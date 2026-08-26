/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export function createProjectDraftListItem(draft, framing) {
    return {
        id: draft.id,
        name: draft.name,
        root: draft.root,
        featureCount: 0,
        health: draft.materialization === "recovery_required" ? "blocked" : "attention",
        updatedAt: draft.updatedAt,
        lifecycle: "draft",
        materialization: activeMaterialization(draft.materialization),
        ...(framing === undefined ? {} : { framing }),
    };
}
export function createProjectDraftOverview(draft, framing) {
    const recovery = draft.materialization === "recovery_required";
    return {
        id: draft.id,
        name: draft.name,
        root: draft.root,
        health: recovery ? "blocked" : "attention",
        orchestrationMode: "manual",
        lifecycle: "draft",
        materialization: activeMaterialization(draft.materialization),
        availability: { markerReady: false, reason: recovery ? "project_recovery_required" : "framing_publication_required" },
        coverage: { tracked: 0, total: 0 },
        freshness: { observedAt: draft.updatedAt, stale: false },
        counts: {
            features: 0, completedFeatures: 0, blockedFeatures: 0, invalidDocuments: 0,
            openDecisions: 0, openCorrections: 0, audits: 0, activeOrchestrations: 0,
        },
        features: [],
        ...(framing === undefined ? {} : { framing }),
    };
}
function activeMaterialization(value) {
    if (value === "materialized")
        throw new Error("A materialized ProjectDraft cannot be projected as active.");
    return value;
}
//# sourceMappingURL=project-draft-projection.js.map