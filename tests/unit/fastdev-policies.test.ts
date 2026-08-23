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

import { evaluatePipeline } from "../../src/domain/pipeline/evaluate-pipeline.ts";
import type { EvaluatedDocument, PipelineEvaluationInput } from "../../src/domain/pipeline/pipeline-report.ts";

const steps: PipelineEvaluationInput["steps"] = [
  { id: "rework_brief", order: 1, required: true, multiple: false, dependsOn: [] },
  { id: "development_report", order: 2, required: true, multiple: true, dependsOn: ["rework_brief"], businessPolicy: { type: "delivery", verdictField: "status", passValues: ["delivered"], inProgressValues: ["partial"] } },
  { id: "delivery_audit", order: 3, required: true, multiple: true, dependsOn: ["development_report"], businessPolicy: { type: "audit_then_fix", targetStep: "development_report", targetDocumentField: "development_report_id", verdictField: "verdict", passValues: ["pass"], failValues: ["corrections_required", "blocked"], retryStep: "development_report" } },
  { id: "delivery_validation", order: 4, required: true, multiple: true, dependsOn: ["development_report", "delivery_audit"], businessPolicy: { type: "review_latest", targetStep: "development_report", targetDocumentField: "development_report_id", verdictField: "verdict", passValues: ["pass"], failValues: ["fail"], inProgressValues: ["partial"], retryStep: "development_report" } },
];

test("a passing audit and validation complete FastDev", () => {
  const report = evaluate([brief(), developmentReport("cr-1", 1, ["scope-1"]), audit("audit-1", "cr-1", "pass"), validation("validation-1", "cr-1", "audit-1", "pass")]);
  assert.equal(report.overallStatus, "completed");
  assert.equal(report.latestCrDevId, "cr-1");
  assert.equal(report.selectedValidationId, "validation-1");
});

test("required corrections need a dependent report that closes every finding", () => {
  const base = [brief(), developmentReport("cr-1", 1, ["scope-1"]), audit("audit-1", "cr-1", "corrections_required")];
  const missing = evaluate(base);
  assert.equal(missing.overallStatus, "failed");
  assert.equal(missing.nextActions[0]?.kind, "return_to_development");

  const partial = evaluate([...base, developmentReport("cr-2", 2, ["scope-1", "audit-1"], [])]);
  assert.equal(partial.overallStatus, "failed");
  assert.match(partial.nextActions[0]?.reason ?? "", /does not close/);

  const corrected = developmentReport("cr-2", 2, ["scope-1", "audit-1"], [{ source_document_id: "audit-1", finding_id: "F-1", action: "fixed", evidence: "test" }]);
  const complete = evaluate([...base, corrected, validation("validation-2", "cr-2", "audit-1", "pass")]);
  assert.equal(complete.overallStatus, "completed");
});

test("a failed validation becomes stale after a dependent corrective report", () => {
  const documents = [
    brief(),
    developmentReport("cr-1", 1, ["scope-1"]),
    audit("audit-1", "cr-1", "pass"),
    validation("validation-1", "cr-1", "audit-1", "fail"),
  ];
  assert.equal(evaluate(documents).nextActions[0]?.kind, "return_to_development");
  const stale = evaluate([...documents, developmentReport("cr-2", 2, ["scope-1", "validation-1"])]);
  assert.equal(stale.overallStatus, "incomplete");
  assert.equal(stale.nextActions[0]?.kind, "run_validation");
  assert.equal(stale.selectedValidationId, undefined);
});

test("v3 authors must be registered and authorized but may be historically inactive", () => {
  const historical = brief("Former_dev_20260820");
  const inactive = evaluate([historical], [{ id: "Former_dev_20260820", active: false, authorized: true }]);
  assert.equal(inactive.errors.length, 0);

  const absent = evaluate([historical], []);
  assert.ok(absent.errors.some((error) => error.includes("absent from the Project registry")));

  const outside = evaluate([historical], [{ id: "Former_dev_20260820", active: true, authorized: false }]);
  assert.ok(outside.errors.some((error) => error.includes("outside the Feature scope")));
});

function evaluate(
  documents: readonly EvaluatedDocument[],
  authorRegistry: PipelineEvaluationInput["authorRegistry"] = [{ id: "Codex_dev_20260820", active: true, authorized: true }],
) {
  return evaluatePipeline({
    pipelineId: "arka-norn-fastdev",
    featureRoot: "/feature",
    featureId: "feature-1",
    steps,
    documents,
    authorRegistry,
  });
}

function brief(authorAgentId = "Codex_dev_20260820"): EvaluatedDocument {
  return document("rework_brief", "scope-1", [], 1, { schema_version: 5, author_agent_id: authorAgentId });
}

function developmentReport(id: string, sequence: number, dependencies: readonly string[], corrections?: readonly Readonly<Record<string, unknown>>[]): EvaluatedDocument {
  return document("development_report", id, dependencies, sequence, { status: "delivered", ...(corrections === undefined ? {} : { corrections_applied: corrections }) }, "delivered");
}

function audit(id: string, reportId: string, verdict: "pass" | "corrections_required"): EvaluatedDocument {
  return document("delivery_audit", id, [reportId], 1, {
    development_report_id: reportId,
    verdict,
    findings: verdict === "corrections_required" ? [{ id: "F-1", decision: "fix" }] : [],
  }, verdict, reportId);
}

function validation(id: string, reportId: string, auditId: string, verdict: "pass" | "fail"): EvaluatedDocument {
  return document("delivery_validation", id, [reportId, auditId], 1, { development_report_id: reportId, delivery_audit_id: auditId, verdict }, verdict, reportId);
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
