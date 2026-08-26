/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";

import { createProjectDraft, parseProjectDraft } from "../../src/domain/project/project-draft.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("ProjectDraft v1 reste manuel, validé et conforme à son contrat JSON public", () => {
  const draft = createProjectDraft({
    id: "project-draft",
    name: "Project Draft",
    root: "/workspace/project",
    createdAt: "2026-08-26T12:00:00.000Z",
    updatedAt: "2026-08-26T12:00:00.000Z",
    rootFingerprint: "a".repeat(64),
  });
  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
  const schema = JSON.parse(readFileSync(resolve(ROOT, "schemas", "project-draft.schema.json"), "utf8")) as AnySchema;
  const validate = ajv.compile(schema);

  assert.equal(validate(draft), true, JSON.stringify(validate.errors));
  assert.equal(draft.orchestrationMode, "manual");
  assert.equal(draft.materialization, "draft");
  assert.throws(() => parseProjectDraft({ ...draft, orchestrationMode: "automatic" }), /manual orchestration mode/u);
  assert.throws(() => parseProjectDraft({ ...draft, materialization: "unknown" }), /materialization state/u);
});
