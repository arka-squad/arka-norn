import assert from "node:assert/strict";
import { test } from "node:test";

import { evaluatePipeline } from "../../src/domain/pipeline/evaluate-pipeline.ts";
import type { EvaluatedDocument, PipelineEvaluationInput } from "../../src/domain/pipeline/pipeline-report.ts";

const steps: PipelineEvaluationInput["steps"] = [
  { id: "cadrage_rework", order: 1, required: true, multiple: false, dependsOn: [] },
  { id: "cr_dev", order: 2, required: true, multiple: true, dependsOn: ["cadrage_rework"], businessPolicy: { type: "delivery", verdictField: "statut", passValues: ["livre"], inProgressValues: ["partiel"] } },
  { id: "audit_rework", order: 3, required: true, multiple: true, dependsOn: ["cr_dev"], businessPolicy: { type: "audit_then_fix", targetStep: "cr_dev", targetDocumentField: "cr_dev_id", verdictField: "verdict", passValues: ["pass"], failValues: ["corrections_requises", "bloque"], retryStep: "cr_dev" } },
  { id: "validation_fastdev", order: 4, required: true, multiple: true, dependsOn: ["cr_dev", "audit_rework"], businessPolicy: { type: "review_latest", targetStep: "cr_dev", targetDocumentField: "cr_dev_id", verdictField: "verdict", passValues: ["pass"], failValues: ["fail"], inProgressValues: ["partial"], retryStep: "cr_dev" } },
];

test("audit pass puis validation pass terminent FastDev", () => {
  const report = evaluate([cadrage(), cr("cr-1", 1, ["scope-1"]), audit("audit-1", "cr-1", "pass"), validation("validation-1", "cr-1", "audit-1", "pass")]);
  assert.equal(report.overallStatus, "completed");
  assert.equal(report.latestCrDevId, "cr-1");
  assert.equal(report.selectedValidationId, "validation-1");
});

test("audit corrections_requises impose un nouveau CR dépendant et complet", () => {
  const base = [cadrage(), cr("cr-1", 1, ["scope-1"]), audit("audit-1", "cr-1", "corrections_requises")];
  const missing = evaluate(base);
  assert.equal(missing.overallStatus, "failed");
  assert.equal(missing.nextActions[0]?.kind, "return_to_development");

  const partial = evaluate([...base, cr("cr-2", 2, ["scope-1", "audit-1"], [])]);
  assert.equal(partial.overallStatus, "failed");
  assert.match(partial.nextActions[0]?.reason ?? "", /ne ferme pas/);

  const corrected = cr("cr-2", 2, ["scope-1", "audit-1"], [{ source_document_id: "audit-1", constat_id: "F-1", action: "corrigé", preuve: "test" }]);
  const complete = evaluate([...base, corrected, validation("validation-2", "cr-2", "audit-1", "pass")]);
  assert.equal(complete.overallStatus, "completed");
});

test("validation fail devient obsolète après un nouveau CR qui en dépend", () => {
  const documents = [
    cadrage(),
    cr("cr-1", 1, ["scope-1"]),
    audit("audit-1", "cr-1", "pass"),
    validation("validation-1", "cr-1", "audit-1", "fail"),
  ];
  assert.equal(evaluate(documents).nextActions[0]?.kind, "return_to_development");
  const stale = evaluate([...documents, cr("cr-2", 2, ["scope-1", "validation-1"])]);
  assert.equal(stale.overallStatus, "incomplete");
  assert.equal(stale.nextActions[0]?.kind, "run_validation");
  assert.equal(stale.selectedValidationId, undefined);
});

test("les auteurs v3 doivent être enregistrés et autorisés, mais peuvent être inactifs historiquement", () => {
  const historical = cadrage("Former_dev_20260820");
  const inactive = evaluate([historical], [{ id: "Former_dev_20260820", active: false, authorized: true }]);
  assert.equal(inactive.errors.length, 0);

  const absent = evaluate([historical], []);
  assert.ok(absent.errors.some((error) => error.includes("absent from the Project registry")));

  const outside = evaluate([historical], [{ id: "Former_dev_20260820", active: true, authorized: false }]);
  assert.ok(outside.errors.some((error) => error.includes("outside the Feature scope")));
});

function evaluate(documents: readonly EvaluatedDocument[], authorRegistry?: PipelineEvaluationInput["authorRegistry"]) {
  return evaluatePipeline({
    pipelineId: "arka-norn-fastdev",
    featureRoot: "/feature",
    featureId: "feature-1",
    steps,
    documents,
    ...(authorRegistry === undefined ? {} : { authorRegistry }),
  });
}

function cadrage(authorAgentId = "Codex_dev_20260820"): EvaluatedDocument {
  return document("cadrage_rework", "scope-1", [], 1, { schema_version: 3, author_agent_id: authorAgentId });
}

function cr(id: string, sequence: number, dependencies: readonly string[], corrections?: readonly Readonly<Record<string, unknown>>[]): EvaluatedDocument {
  return document("cr_dev", id, dependencies, sequence, { statut: "livre", ...(corrections === undefined ? {} : { corrections_apportees: corrections }) }, "livre");
}

function audit(id: string, crDevId: string, verdict: "pass" | "corrections_requises"): EvaluatedDocument {
  return document("audit_rework", id, [crDevId], 1, {
    cr_dev_id: crDevId,
    verdict,
    constats: verdict === "corrections_requises" ? [{ id: "F-1", decision: "corriger" }] : [],
  }, verdict, crDevId);
}

function validation(id: string, crDevId: string, auditId: string, verdict: "pass" | "fail"): EvaluatedDocument {
  return document("validation_fastdev", id, [crDevId, auditId], 1, { cr_dev_id: crDevId, audit_rework_id: auditId, verdict }, verdict, crDevId);
}

function document(
  type: string,
  id: string,
  dependencyDocumentIds: readonly string[],
  sequence: number,
  content: Readonly<Record<string, unknown>>,
  businessVerdict?: string,
  crDevId?: string,
): EvaluatedDocument {
  return {
    type,
    id,
    featureId: "feature-1",
    filePath: `/feature/${id}.json`,
    valid: true,
    errors: [],
    dependencyDocumentIds,
    sequence,
    createdAt: `2026-08-20T${String(sequence + 10).padStart(2, "0")}:00:00.000Z`,
    content,
    ...(businessVerdict === undefined ? {} : { businessVerdict }),
    ...(crDevId === undefined ? {} : { crDevId }),
  };
}
