/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { createGovernanceEvent } from "./governance-event.js";
export function emptyGovernanceLedger(projectId) {
    return Object.freeze({ schemaVersion: 1, projectId, revision: 0, events: Object.freeze([]) });
}
export function appendGovernanceEvent(ledger, event) {
    const normalized = createGovernanceEvent(event);
    if (normalized.projectId !== ledger.projectId)
        throw new Error("Governance event belongs to another Project.");
    if (ledger.events.some((candidate) => candidate.id === normalized.id))
        throw new Error("Governance event id already exists.");
    requireReferencedEvent(ledger, normalized.resolvesEventId);
    requireReferencedEvent(ledger, normalized.supersedesEventId);
    return Object.freeze({
        schemaVersion: 1,
        projectId: ledger.projectId,
        revision: ledger.revision + 1,
        events: Object.freeze([...ledger.events, normalized]),
    });
}
export function reduceGovernance(ledger) {
    const closed = new Set(ledger.events.flatMap((event) => [event.resolvesEventId, event.supersedesEventId]).filter((id) => id !== undefined));
    const open = ledger.events.filter((event) => !closed.has(event.id));
    return Object.freeze({
        openDecisions: Object.freeze(open.filter((event) => event.kind === "decision_opened")),
        openCorrections: Object.freeze(open.filter((event) => event.kind === "correction_requested")),
        acknowledgements: Object.freeze(open.filter((event) => event.kind === "risk_acknowledged" || event.kind === "debt_acknowledged")),
        history: Object.freeze([...ledger.events].reverse()),
    });
}
function requireReferencedEvent(ledger, id) {
    if (id !== undefined && !ledger.events.some((event) => event.id === id)) {
        throw new Error(`Referenced governance event does not exist: ${id}`);
    }
}
//# sourceMappingURL=governance-ledger.js.map