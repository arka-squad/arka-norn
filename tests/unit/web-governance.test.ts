/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createGovernanceEvent } from "../../src/domain/governance/governance-event.ts";
import { appendGovernanceEvent, emptyGovernanceLedger, reduceGovernance } from "../../src/domain/governance/governance-ledger.ts";

const author = { id: "human_0123456789abcdef01234567", name: "Norn QA" } as const;

test("governance ledger is append-only and resolves current state without rewriting history", () => {
  const opened = createGovernanceEvent({
    id: "gov_0123456789abcdef01234567",
    kind: "decision_opened",
    projectId: "project-one",
    targets: [{ type: "feature", id: "feature-one" }],
    reason: "Choose a delivery boundary.",
    occurredAt: "2026-08-24T00:00:00.000Z",
    author,
  });
  const first = appendGovernanceEvent(emptyGovernanceLedger("project-one"), opened);
  const resolved = createGovernanceEvent({
    id: "gov_89abcdef0123456789abcdef",
    kind: "decision_resolved",
    projectId: "project-one",
    targets: opened.targets,
    reason: "The Project boundary is accepted.",
    occurredAt: "2026-08-24T00:01:00.000Z",
    author,
    resolvesEventId: opened.id,
  });
  const second = appendGovernanceEvent(first, resolved);

  assert.equal(first.events.length, 1);
  assert.equal(second.events.length, 2);
  assert.equal(second.revision, 2);
  assert.equal(reduceGovernance(second).openDecisions.length, 0);
  assert.deepEqual(reduceGovernance(second).history.map((event) => event.id), [resolved.id, opened.id]);
  assert.throws(() => appendGovernanceEvent(second, resolved), /already exists/);
});

test("governance rejects broken references and unsafe targets", () => {
  assert.throws(() => createGovernanceEvent({
    id: "gov_0123456789abcdef01234567",
    kind: "correction_requested",
    projectId: "project-one",
    targets: [{ type: "document", id: "../secret" }],
    reason: "Correct it.",
    occurredAt: "2026-08-24T00:00:00.000Z",
    author,
  }), /target is invalid/);
});
