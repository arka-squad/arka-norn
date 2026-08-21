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
import { test } from "node:test";

import { evaluatePipeline, selectLatestRun } from "../../src/domain/pipeline/evaluate-pipeline.ts";
import type { EvaluatedDocument, PipelineEvaluationInput } from "../../src/domain/pipeline/pipeline-report.ts";

const steps = [
  { id: "concept", order: 1, required: true, multiple: false, dependsOn: [] },
  { id: "cr_dev", order: 2, required: true, multiple: true, dependsOn: ["concept"], businessPolicy: { type: "delivery", verdictField: "statut", passValues: ["livre"], inProgressValues: ["partiel"] } },
  { id: "recette_qa", order: 3, required: true, multiple: true, dependsOn: ["cr_dev"], businessPolicy: { type: "review_latest", targetStep: "cr_dev", targetDocumentField: "cr_dev_id", verdictField: "statut_global", passValues: ["pass"], failValues: ["fail"], inProgressValues: ["partial"], retryStep: "cr_dev" } },
] as const;

test("un Pipeline vide propose concept", () => {
  const report = evaluate([]);
  assert.equal(report.overallStatus, "incomplete");
  assert.deepEqual(report.nextActions.map((action) => [action.kind, action.stepId]), [["create_document", "concept"]]);
});

test("un document invalide est bloqué avec une action de correction", () => {
  const report = evaluate([document("concept", "concept-1", { valid: false, errors: ["objectif is required"] })]);
  assert.equal(report.overallStatus, "invalid");
  assert.equal(report.steps[0]?.schemaStatus, "invalid");
  assert.equal(report.nextActions[0]?.kind, "fix_document");
});

test("QA fail sur le dernier CR boucle vers le développement", () => {
  const report = evaluate(baseRuns("fail"));
  assert.equal(report.latestCrDevId, "cr-2");
  assert.equal(report.selectedQaId, "qa-2");
  assert.equal(report.overallStatus, "failed");
  assert.deepEqual(report.nextActions.map((action) => action.kind), ["return_to_development"]);
});

test("QA partial reste incomplète", () => {
  const report = evaluate(baseRuns("partial"));
  assert.equal(report.overallStatus, "incomplete");
  assert.equal(report.nextActions[0]?.kind, "resolve_qa");
});

test("QA pass sur un ancien CR ne termine pas le Pipeline", () => {
  const documents = [
    concept(),
    cr("cr-2", 2, "2026-08-19T12:00:00.000Z"),
    qa("qa-old", 9, "cr-1", "pass"),
    cr("cr-1", 1, "2026-08-19T10:00:00.000Z"),
  ];
  const report = evaluate(documents);
  assert.equal(report.latestCrDevId, "cr-2");
  assert.equal(report.selectedQaId, undefined);
  assert.equal(report.overallStatus, "incomplete");
  assert.equal(report.nextActions[0]?.kind, "run_qa");
  assert.equal(report.warnings.length, 1);
});

test("QA pass sur le dernier CR termine le Pipeline", () => {
  const report = evaluate(baseRuns("pass"));
  assert.equal(report.overallStatus, "completed");
  assert.equal(report.nextActions.length, 0);
});

test("la sélection multiple est indépendante de l'ordre disque", () => {
  const runs = [
    cr("cr-z", 2, "2026-08-19T10:00:00.000Z"),
    cr("cr-a", 3, "2026-08-19T09:00:00.000Z"),
    cr("cr-b", 3, "2026-08-19T11:00:00.000Z"),
  ];
  assert.equal(selectLatestRun(runs)?.id, "cr-b");
  assert.equal(selectLatestRun([...runs].reverse())?.id, "cr-b");
});

test("une QA vers un CR inconnu invalide le graphe", () => {
  const report = evaluate([concept(), cr("cr-1", 1, "2026-08-19T10:00:00.000Z"), qa("qa-forged", 1, "cr-unknown", "pass")]);
  assert.equal(report.overallStatus, "invalid");
  assert.ok(report.errors.some((error) => /unknown target/.test(error)));
});

test("les identifiants dupliqués et les cardinalités singleton invalident le graphe", () => {
  const report = evaluate([concept(), document("concept", "concept-1")]);
  assert.equal(report.overallStatus, "invalid");
  assert.ok(report.errors.some((error) => error.includes("Duplicate document id")));
  assert.ok(report.errors.some((error) => error.includes("allows one document")));
});

test("les fichiers inconnus sont signalés sans disparaître", () => {
  const report = evaluate([concept(), document("mystery", "x")]);
  assert.deepEqual(report.unknownFiles, ["/feature/mystery-x.json"]);
  assert.equal(report.warnings.length, 1);
});

test("une Feature gérée exige un registre d'auteurs vérifié", () => {
  const report = evaluateManaged([document("concept", "concept-1", {
    content: { schema_version: 3, author_agent_id: "Codex_dev_20260820" },
  })]);
  assert.equal(report.overallStatus, "invalid");
  assert.ok(report.errors.some((error) => error.includes("cannot be inspected without a verified Project author registry")));
});

test("une Feature gérée invalide les auteurs v3 absents ou hors périmètre", () => {
  const signed = document("concept", "concept-1", {
    content: { schema_version: 3, author_agent_id: "Codex_dev_20260820" },
  });
  const absent = evaluateManaged([signed], []);
  assert.equal(absent.overallStatus, "invalid");
  assert.ok(absent.errors.some((error) => error.includes("absent from the Project registry")));

  const outsideScope = evaluateManaged([signed], [{ id: "Codex_dev_20260820", active: true, authorized: false }]);
  assert.equal(outsideScope.overallStatus, "invalid");
  assert.ok(outsideScope.errors.some((error) => error.includes("outside the Feature scope")));
});

function evaluate(documents: readonly EvaluatedDocument[]) {
  const input: PipelineEvaluationInput = {
    pipelineId: "test-pipeline",
    featureRoot: "/feature",
    steps,
    documents,
    transversalDocumentTypes: ["handoff"],
  };
  return evaluatePipeline(input);
}

function evaluateManaged(
  documents: readonly EvaluatedDocument[],
  authorRegistry?: PipelineEvaluationInput["authorRegistry"],
) {
  return evaluatePipeline({
    pipelineId: "test-pipeline",
    featureRoot: "/feature",
    featureId: "feature-1",
    steps,
    documents,
    transversalDocumentTypes: ["handoff"],
    ...(authorRegistry === undefined ? {} : { authorRegistry }),
  });
}

function baseRuns(verdict: "pass" | "fail" | "partial"): readonly EvaluatedDocument[] {
  return [
    qa("qa-2", 2, "cr-2", verdict),
    cr("cr-1", 1, "2026-08-19T10:00:00.000Z"),
    concept(),
    cr("cr-2", 2, "2026-08-19T12:00:00.000Z"),
  ];
}

function concept(): EvaluatedDocument {
  return document("concept", "concept-1");
}

function cr(id: string, sequence: number, createdAt: string): EvaluatedDocument {
  return document("cr_dev", id, { sequence, createdAt, businessVerdict: "livre", dependencyDocumentIds: ["concept-1"], content: { statut: "livre" } });
}

function qa(id: string, sequence: number, crDevId: string, businessVerdict: string): EvaluatedDocument {
  return document("recette_qa", id, {
    sequence,
    createdAt: `2026-08-19T${String(sequence + 12).padStart(2, "0")}:00:00.000Z`,
    crDevId,
    businessVerdict,
    dependencyDocumentIds: [crDevId],
    content: { cr_dev_id: crDevId, statut_global: businessVerdict },
  });
}

function document(
  type: string,
  id: string,
  options: Partial<Omit<EvaluatedDocument, "filePath" | "type" | "id">> = {},
): EvaluatedDocument {
  return {
    type,
    id,
    featureId: "feature-1",
    filePath: `/feature/${type}-${id}.json`,
    valid: true,
    errors: [],
    dependencyDocumentIds: [],
    content: {},
    ...options,
  };
}
