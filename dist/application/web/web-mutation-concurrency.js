/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
export class WebMutationError extends Error {
    status;
    code;
    details;
    constructor(status, code, details = {}) {
        super(code);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
export function assertExpectedTimestamp(expected, current, conflictCode) {
    if (typeof expected !== "string" || expected.length > 64 || Number.isNaN(Date.parse(expected))) {
        throw new WebMutationError(400, "invalid_expected_timestamp");
    }
    const normalized = new Date(expected).toISOString();
    const actual = new Date(current).toISOString();
    if (normalized !== actual)
        throw new WebMutationError(409, conflictCode);
    return normalized;
}
export function assertExpectedRevision(expected, current, conflictCode) {
    if (!Number.isInteger(expected) || Number(expected) < 0)
        throw new WebMutationError(400, "invalid_expected_revision");
    const revision = Number(expected);
    if (revision !== current)
        throw new WebMutationError(409, conflictCode);
    return revision;
}
//# sourceMappingURL=web-mutation-concurrency.js.map