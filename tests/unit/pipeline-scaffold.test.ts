import assert from "node:assert/strict";
import { test } from "node:test";

import { findScaffoldSentinels, scaffoldFromSchema } from "../../src/domain/pipeline/scaffold-schema.ts";

test("le scaffold produit toutes les clés requises et conserve les const", () => {
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
    title: "À_REMPLIR",
    status: "À_CHOISIR::draft|ready",
    items: [{ id: "À_REMPLIR", enabled: false }],
  });
  assert.deepEqual(findScaffoldSentinels(result), [".title", ".status", ".items[0].id"]);
});

test("un $ref non résolu est refusé explicitement", () => {
  assert.throws(() => scaffoldFromSchema({ type: "object", required: ["value"], properties: { value: { $ref: "#/$defs/value" } } }), /Cannot scaffold unresolved \$ref/);
});

test("le scaffold respecte un minimum numérique et un exemple de tableau fourni par le schéma", () => {
  const result = scaffoldFromSchema({
    type: "object",
    required: ["sequence", "hypotheses"],
    properties: {
      sequence: { type: "integer", minimum: 1 },
      hypotheses: {
        type: "array",
        default: [{ sujet: "À_REMPLIR", position_retenue: "À_REMPLIR" }],
        items: { type: "object" },
      },
    },
  });
  assert.deepEqual(result, { sequence: 1, hypotheses: [{ sujet: "À_REMPLIR", position_retenue: "À_REMPLIR" }] });
  assert.deepEqual(findScaffoldSentinels(result), [".hypotheses[0].sujet", ".hypotheses[0].position_retenue"]);
});
