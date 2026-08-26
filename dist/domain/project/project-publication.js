/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { ProjectId } from "./project-id.js";
export const PROJECT_PUBLICATION_STATES = [
    "prepared", "staged", "plan_committed", "marker_committed", "indexed", "materialized",
];
export function createProjectPublicationJournal(input) {
    return parseProjectPublicationJournal({ ...input, schemaVersion: 1, state: "prepared", error: null });
}
export function parseProjectPublicationJournal(value) {
    if (!isRecord(value) || value["schemaVersion"] !== 1)
        throw new Error("Invalid Project publication journal.");
    const id = identifier(value, "id", 96);
    const projectId = identifier(value, "projectId", 64);
    ProjectId.of(projectId);
    const framingId = identifier(value, "framingId", 256);
    const planId = identifier(value, "planId", 256);
    const planRevision = value["planRevision"];
    if (!Number.isInteger(planRevision) || Number(planRevision) < 1)
        throw new Error("Invalid Project publication plan revision.");
    const planFingerprint = fingerprint(value, "planFingerprint");
    const root = text(value, "root", 4_096);
    if (!root.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(root))
        throw new Error("Invalid Project publication root.");
    const rootFingerprint = fingerprint(value, "rootFingerprint");
    const relativePlanPath = text(value, "relativePlanPath", 1_024);
    if (!/^\.arka-norn\/plans\/[A-Za-z0-9._:-]+\/[0-9]{8}-[a-f0-9]{64}\.json$/u.test(relativePlanPath)) {
        throw new Error("Invalid Project publication plan path.");
    }
    const state = value["state"];
    if (!PROJECT_PUBLICATION_STATES.includes(state))
        throw new Error("Invalid Project publication state.");
    const createdAt = timestamp(value, "createdAt");
    const updatedAt = timestamp(value, "updatedAt");
    if (Date.parse(updatedAt) < Date.parse(createdAt))
        throw new Error("Invalid Project publication timestamps.");
    const error = parseError(value["error"]);
    return Object.freeze({
        schemaVersion: 1, id, projectId, framingId, planId, planRevision: Number(planRevision), planFingerprint,
        root, rootFingerprint, relativePlanPath, state: state, createdAt, updatedAt, error,
    });
}
function parseError(value) {
    if (value === null)
        return null;
    if (!isRecord(value))
        throw new Error("Invalid Project publication error.");
    return Object.freeze({ code: identifier(value, "code", 64), message: text(value, "message", 512) });
}
function identifier(value, field, maximum) {
    const candidate = text(value, field, maximum);
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(candidate))
        throw new Error(`Invalid Project publication ${field}.`);
    return candidate;
}
function fingerprint(value, field) {
    const candidate = text(value, field, 64);
    if (!/^[a-f0-9]{64}$/u.test(candidate))
        throw new Error(`Invalid Project publication ${field}.`);
    return candidate;
}
function timestamp(value, field) {
    const candidate = text(value, field, 64);
    if (Number.isNaN(Date.parse(candidate)))
        throw new Error(`Invalid Project publication ${field}.`);
    return candidate;
}
function text(value, field, maximum) {
    const candidate = value[field];
    if (typeof candidate !== "string" || candidate.trim().length === 0 || candidate.length > maximum) {
        throw new Error(`Invalid Project publication ${field}.`);
    }
    return candidate;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=project-publication.js.map