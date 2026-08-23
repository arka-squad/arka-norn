/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

import { findScaffoldSentinels, scaffoldFromSchema } from "../../src/domain/pipeline/scaffold-schema.ts";

test("scaffold emits every required property and preserves constants", () => {
  const schema = {
    type: "object",
    required: ["type", "title", "status", "items"],
    properties: {
      type: { const: "concept" },
      title: { type: "string" },
      status: { type: "string", enum: ["draft", "ready"] },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          required: ["id", "enabled"],
          properties: { id: { type: "string" }, enabled: { type: "boolean" } },
        },
      },
    },
  } as const;
  const result = scaffoldFromSchema(schema);
  assert.deepEqual(result, {
    type: "concept",
    title: "TO_FILL",
    status: "CHOOSE::draft|ready",
    items: [{ id: "TO_FILL", enabled: false }],
  });
  assert.deepEqual(findScaffoldSentinels(result), [".title", ".status", ".items[0].id"]);
});

test("unresolved references are rejected explicitly", () => {
  assert.throws(() => scaffoldFromSchema({ type: "object", required: ["value"], properties: { value: { $ref: "#/$defs/value" } } }), /Cannot scaffold unresolved \$ref/);
  assert.throws(() => scaffoldFromSchema({ type: "object", required: ["value"], properties: { value: { $ref: "other.schema.json#/$defs/value" } } }), /Cannot scaffold unresolved \$ref/);
});

test("local $defs references resolve recursively", () => {
  const result = scaffoldFromSchema({
    type: "object",
    required: ["checks"],
    properties: { checks: { $ref: "#/$defs/checks" } },
    $defs: {
      checks: { type: "array", minItems: 1, items: { $ref: "#/$defs/check" } },
      check: {
        type: "object",
        required: ["id", "status"],
        properties: { id: { type: "string" }, status: { enum: ["pass", "fail"] } },
      },
    },
  });
  assert.deepEqual(result, { checks: [{ id: "TO_FILL", status: "CHOOSE::pass|fail" }] });
});

test("scaffold honors numeric minimums and schema array defaults", () => {
  const result = scaffoldFromSchema({
    type: "object",
    required: ["sequence", "hypotheses"],
    properties: {
      sequence: { type: "integer", minimum: 1 },
      hypotheses: {
        type: "array",
        default: [{ subject: "TO_FILL", selected_position: "TO_FILL" }],
        items: { type: "object" },
      },
    },
  });
  assert.deepEqual(result, { sequence: 1, hypotheses: [{ subject: "TO_FILL", selected_position: "TO_FILL" }] });
  assert.deepEqual(findScaffoldSentinels(result), [".hypotheses[0].subject", ".hypotheses[0].selected_position"]);
});

test("canonical schemas guide required arrays and preserve documented empty arrays", () => {
  const root = resolve(import.meta.dirname, "../..");
  const parseSchema = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8")) as Record<string, unknown>;
  const strip = (schema: Record<string, unknown>) => {
    const copy = structuredClone(schema);
    delete copy["allOf"];
    delete copy["unevaluatedProperties"];
    return copy;
  };
  const concept = scaffoldFromSchema(strip(parseSchema("schemas/concept.schema.json")));
  const plan = scaffoldFromSchema(strip(parseSchema("schemas/plan.schema.json")));

  assert.deepEqual(concept.assumptions, [{ subject: "TO_FILL", selected_position: "TO_FILL" }]);
  assert.deepEqual(concept.sections, []);
  assert.deepEqual(plan.source_concepts, ["TO_FILL"]);
  assert.deepEqual(plan.completion_criteria, ["TO_FILL"]);
  assert.ok(findScaffoldSentinels(plan).includes(".source_concepts[0]"));
  assert.ok(findScaffoldSentinels(plan).includes(".completion_criteria[0]"));
  assert.ok(findScaffoldSentinels(concept).includes(".assumptions[0].subject"));
});
