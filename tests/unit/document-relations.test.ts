/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("v5 development reports and QA reviews expose explicit relations", () => {
  const reportSchema = json("schemas/development-report.schema.json") as { readonly required: readonly string[] };
  const reviewSchema = json("schemas/qa-review.schema.json") as { readonly required: readonly string[] };
  ["schema_version", "feature_id", "sequence", "created_at"].forEach((field) => assert.ok(reportSchema.required.includes(field), field));
  ["schema_version", "feature_id", "sequence", "created_at", "development_report_id"].forEach((field) => assert.ok(reviewSchema.required.includes(field), field));
});

test("the v5 envelope requires content locale and a signed author", () => {
  const envelope = json("schemas/document-envelope.schema.json") as {
    readonly required: readonly string[];
    readonly properties: {
      readonly schema_version: { readonly const: number };
      readonly content_locale: { readonly enum: readonly string[] };
      readonly author_agent_id: { readonly pattern: string };
    };
    readonly allOf: readonly unknown[];
  };
  assert.equal(envelope.properties.schema_version.const, 5);
  assert.deepEqual(envelope.properties.content_locale.enum, ["en", "fr"]);
  assert.ok(envelope.required.includes("content_locale"));
  assert.ok(envelope.properties.author_agent_id.pattern.includes("[0-9]{8}"));
  assert.equal(envelope.allOf.length, 1);
});

test("the canonical Project audit is v5 while the French v4 contract remains packaged", () => {
  const auditSchema = json("schemas/current-state-audit.schema.json") as { readonly allOf: readonly [{ readonly if: { readonly required: readonly string[] }; readonly then: { readonly $ref: string }; readonly else: { readonly $ref: string } }] };
  const projectEnvelope = json("schemas/project-audit-envelope.schema.json") as {
    readonly required: readonly string[];
    readonly properties: { readonly schema_version: { readonly const: number } };
  };
  const legacyEnvelope = json("schemas/legacy/fr/project-audit-envelope.schema.json") as {
    readonly properties: { readonly schema_version: { readonly const: number } };
  };
  assert.deepEqual(auditSchema.allOf[0].if.required, ["project_id"]);
  assert.equal(auditSchema.allOf[0].then.$ref, "project-audit-envelope.schema.json");
  assert.equal(auditSchema.allOf[0].else.$ref, "document-envelope.schema.json");
  assert.equal(projectEnvelope.properties.schema_version.const, 5);
  assert.equal(projectEnvelope.required.includes("feature_id"), false);
  assert.equal(legacyEnvelope.properties.schema_version.const, 4);
});

test("legacy French v2 and v3 contracts remain available only under the compatibility tree", () => {
  const report = json("schemas/legacy/fr/cr-dev.schema.json") as { readonly properties: { readonly type: { readonly const: string } } };
  const review = json("schemas/legacy/fr/recette-qa.schema.json") as { readonly required: readonly string[] };
  assert.equal(report.properties.type.const, "cr_dev");
  assert.ok(review.required.includes("cr_dev_id"));
});

function json(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf8")) as unknown;
}
