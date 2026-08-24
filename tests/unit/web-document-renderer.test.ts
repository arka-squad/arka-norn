/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createHumanDocumentView } from "../../src/application/web/human-document.ts";

test("human document projection keeps content, metadata, dependencies and obsolete state distinct", () => {
  const view = createHumanDocumentView({
    summary: {
      id: "plan-001",
      type: "plan",
      filePath: "/project/feature/plan.json",
      valid: true,
      errors: [],
      authorAgentId: "agent-one",
      dependencyDocumentIds: ["concept-001", "missing-001"],
    },
    stepId: "plan",
    raw: {
      schema_version: 5,
      id: "plan-001",
      type: "plan",
      title: "Verified Web delivery plan",
      status: "valid",
      content_locale: "en",
      objective: "Deliver the verified Web interface.",
      batches: [{ id: "L1", title: "Contracts" }],
    },
    knownDocuments: new Map([["concept-001", { title: "Concept" }]]),
    selectedDocumentIds: new Set(["plan-002"]),
  });

  assert.equal(view.title, "Verified Web delivery plan");
  assert.equal(view.presentation.status, "valid");
  assert.equal(view.presentation.contentLocale, "en");
  assert.equal(view.sections.some((section) => section.id === "title"), false);
  assert.equal(view.obsolete, true);
  assert.deepEqual(view.dependencies.map((dependency) => dependency.resolved), [true, false]);
  assert.equal(view.sections.find((section) => section.id === "batches")?.kind, "table");
  assert.equal(view.metadata["schema_version"], 5);
});
