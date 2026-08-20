import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("CR Dev et recette QA v2/v3 portent leurs relations explicites", () => {
  const crSchema = json("schemas/cr-dev.schema.json") as { readonly required: readonly string[] };
  const qaSchema = json("schemas/recette-qa.schema.json") as { readonly required: readonly string[] };
  const crRequired = ["schema_version", "feature_id", "sequence", "created_at"];
  const qaRequired = ["schema_version", "feature_id", "sequence", "created_at", "cr_dev_id"];
  crRequired.forEach((field) => assert.ok(crSchema.required.includes(field), field));
  qaRequired.forEach((field) => assert.ok(qaSchema.required.includes(field), field));
});

test("l’enveloppe v3 exige l’identité Agent tout en gardant la v2 lisible", () => {
  const envelope = json("schemas/document-envelope.schema.json") as {
    readonly properties: { readonly schema_version: { readonly enum: readonly number[] }; readonly author_agent_id: { readonly pattern: string } };
    readonly allOf: readonly unknown[];
  };
  assert.deepEqual(envelope.properties.schema_version.enum, [2, 3]);
  assert.ok(envelope.properties.author_agent_id.pattern.includes("[0-9]{8}"));
  assert.equal(envelope.allOf.length, 1);
});

test("l'audit Project v4 est réservé à audit_etat_reel et ne porte pas de Feature", () => {
  const auditSchema = json("schemas/audit-etat-reel.schema.json") as {
    readonly allOf: readonly [{
      readonly if: { readonly properties: { readonly schema_version: { readonly const: number } } };
      readonly then: { readonly $ref: string };
      readonly else: { readonly $ref: string };
    }];
  };
  const projectEnvelope = json("schemas/project-audit-envelope.schema.json") as {
    readonly required: readonly string[];
    readonly properties: { readonly schema_version: { readonly const: number }; readonly project_id: { readonly pattern: string } };
  };
  const example = json("examples/project-audit-v4/01-audit-etat-reel.json") as {
    readonly schema_version: number;
    readonly project_id: string;
    readonly feature_id?: string;
    readonly type: string;
  };
  assert.equal(auditSchema.allOf[0].if.properties.schema_version.const, 4);
  assert.equal(auditSchema.allOf[0].then.$ref, "project-audit-envelope.schema.json");
  assert.equal(auditSchema.allOf[0].else.$ref, "document-envelope.schema.json");
  assert.deepEqual(projectEnvelope.required.includes("feature_id"), false);
  assert.equal(projectEnvelope.properties.schema_version.const, 4);
  assert.match(projectEnvelope.properties.project_id.pattern, /a-z0-9/);
  assert.equal(example.schema_version, 4);
  assert.equal(example.project_id, "arka-norn");
  assert.equal(example.feature_id, undefined);
  assert.equal(example.type, "audit_etat_reel");
});

test("la recette d'exemple référence exactement le CR testé", () => {
  const cr = json("examples/feature-notion-linear/09-cr-dev.json") as { readonly id: string; readonly feature_id: string };
  const qa = json("examples/feature-notion-linear/10-recette-qa.json") as {
    readonly cr_dev_id: string;
    readonly feature_id: string;
  };
  assert.equal(qa.cr_dev_id, cr.id);
  assert.equal(qa.feature_id, cr.feature_id);
});

function json(relativePath: string): unknown {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf8")) as unknown;
}
