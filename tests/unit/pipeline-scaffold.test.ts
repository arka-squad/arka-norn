import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

test("les schémas réels guident les tableaux requis non vides et gardent les vides documentés", () => {
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

  assert.deepEqual(concept.hypotheses, [{ sujet: "À_REMPLIR", position_retenue: "À_REMPLIR" }]);
  assert.deepEqual(concept.sections, []);
  assert.deepEqual(plan.concepts_sources, ["À_REMPLIR"]);
  assert.deepEqual(plan.criteres_de_fini, ["À_REMPLIR"]);
  assert.ok(findScaffoldSentinels(plan).includes(".concepts_sources[0]"));
  assert.ok(findScaffoldSentinels(plan).includes(".criteres_de_fini[0]"));
  assert.ok(findScaffoldSentinels(concept).includes(".hypotheses[0].sujet"));
});
