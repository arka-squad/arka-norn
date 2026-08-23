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

import type { PipelineBusinessPolicy, PipelineStepDefinition } from "./pipeline-definition.js";
import type { BusinessStatus, EvaluatedDocument, NextAction } from "./pipeline-report.js";
import { canonicalEnumValue, compatibleFieldValue, isDocumentType } from "../compatibility/legacy-contract.js";
import { selectLatestRun } from "./select-latest-run.js";

export interface BusinessPolicyResult {
  readonly status: BusinessStatus;
  readonly selected?: EvaluatedDocument;
  readonly action?: NextAction;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function evaluateBusinessPolicy(input: {
  readonly step: Pick<PipelineStepDefinition, "id" | "businessPolicy">;
  readonly documents: readonly EvaluatedDocument[];
  readonly allDocuments: readonly EvaluatedDocument[];
  readonly featureId?: string;
}): BusinessPolicyResult {
  const valid = input.documents.filter((document) => document.valid);
  const policy = input.step.businessPolicy ?? { type: "presence" as const };
  if (valid.length === 0) return emptyResult();
  if (policy.type === "presence") return result("passed", selectLatestRun(valid));
  if (policy.type === "delivery") return delivery(policy, valid, input.step.id, input.featureId);
  if (policy.type === "audit_then_fix") return auditThenFix(policy, valid, input.allDocuments, input.step.id, input.featureId);
  return reviewLatest(policy, valid, input.allDocuments, input.step.id, input.featureId);
}

function delivery(
  policy: Extract<PipelineBusinessPolicy, { readonly type: "delivery" }>,
  documents: readonly EvaluatedDocument[],
  stepId: string,
  featureId?: string,
): BusinessPolicyResult {
  const selected = selectLatestRun(documents);
  const verdict = selected === undefined ? undefined : stringField(selected.content, policy.verdictField);
  if (verdict !== undefined && policy.passValues.includes(verdict)) return result("passed", selected);
  if (verdict !== undefined && policy.inProgressValues.includes(verdict)) {
    return result("in_progress", selected, createGuidedAction("continue_development", stepId, "The latest delivery is partial.", featureId, selected?.id));
  }
  return result("blocked", selected, createGuidedAction("continue_development", stepId, "The latest delivery is not marked as delivered.", featureId, selected?.id));
}

function reviewLatest(
  policy: Extract<PipelineBusinessPolicy, { readonly type: "review_latest" }>,
  reviews: readonly EvaluatedDocument[],
  allDocuments: readonly EvaluatedDocument[],
  stepId: string,
  featureId?: string,
): BusinessPolicyResult {
  const targets = allDocuments.filter((document) => document.type === policy.targetStep && document.valid);
  const latestTarget = selectLatestRun(targets);
  if (latestTarget?.id === undefined) return emptyResult();
  const errors = unknownTargets(reviews, targets, policy.targetDocumentField, stepId);
  const forLatest = reviews.filter((review) => stringField(review.content, policy.targetDocumentField) === latestTarget.id);
  const selected = selectLatestRun(forLatest);
  const olderPassing = reviews.some((review) => {
    const target = stringField(review.content, policy.targetDocumentField);
    const verdict = stringField(review.content, policy.verdictField);
    return target !== latestTarget.id && verdict !== undefined && policy.passValues.includes(verdict);
  });
  const warnings = olderPassing ? [`A passing ${stepId} exists for an older ${policy.targetStep}; latest is ${latestTarget.id}.`] : [];
  if (selected === undefined) {
    const staleFailure = selectLatestRun(reviews.filter((review) => {
      const verdict = stringField(review.content, policy.verdictField);
      return verdict !== undefined && [...policy.failValues, ...policy.inProgressValues].includes(verdict);
    }));
    if (staleFailure?.id !== undefined && !isAncestor(staleFailure.id, latestTarget, allDocuments)) {
      errors.push(`Latest ${policy.targetStep} ${latestTarget.id} must depend on failed ${stepId} ${staleFailure.id}.`);
      return {
        status: "failed",
        action: createGuidedAction("return_to_development", policy.retryStep, `The corrective report must depend on ${staleFailure.id}.`, featureId, staleFailure.id),
        errors,
        warnings,
      };
    }
    return {
      status: "not_started",
      action: createGuidedAction(isQaReview(stepId) ? "run_qa" : "run_validation", stepId, `No conclusive ${stepId} targets the latest ${policy.targetStep}.`, featureId, latestTarget.id),
      errors,
      warnings,
    };
  }
  const verdict = stringField(selected.content, policy.verdictField);
  if (verdict !== undefined && policy.passValues.includes(verdict)) return { status: "passed", selected, errors, warnings };
  if (verdict !== undefined && policy.failValues.includes(verdict)) {
    return {
      status: "failed", selected,
      action: createGuidedAction("return_to_development", policy.retryStep, `${stepId} failed against the latest ${policy.targetStep}.`, featureId, selected.id),
      errors, warnings,
    };
  }
  if (verdict !== undefined && policy.inProgressValues.includes(verdict)) {
    const kind = isQaReview(stepId) ? "resolve_qa" : "return_to_development";
    return {
      status: "in_progress", selected,
      action: createGuidedAction(kind, kind === "resolve_qa" ? stepId : policy.retryStep, `${stepId} is partial and does not complete the pipeline.`, featureId, selected.id),
      errors, warnings,
    };
  }
  return { status: "blocked", selected, errors, warnings };
}

function auditThenFix(
  policy: Extract<PipelineBusinessPolicy, { readonly type: "audit_then_fix" }>,
  audits: readonly EvaluatedDocument[],
  allDocuments: readonly EvaluatedDocument[],
  stepId: string,
  featureId?: string,
): BusinessPolicyResult {
  const targets = allDocuments.filter((document) => document.type === policy.targetStep && document.valid);
  const latestTarget = selectLatestRun(targets);
  if (latestTarget?.id === undefined) return emptyResult();
  const errors = unknownTargets(audits, targets, policy.targetDocumentField, stepId);
  const applicable = audits.filter((audit) => {
    const auditedId = stringField(audit.content, policy.targetDocumentField);
    return auditedId === latestTarget.id || (audit.id !== undefined && isAncestor(audit.id, latestTarget, allDocuments));
  });
  const selected = selectLatestRun(applicable);
  if (selected === undefined) {
    return {
      status: "not_started",
      action: createGuidedAction("run_audit", stepId, `The latest delivered ${policy.targetStep} must be audited.`, featureId, latestTarget.id),
      errors,
      warnings: [],
    };
  }
  const verdict = stringField(selected.content, policy.verdictField);
  if (verdict !== undefined && policy.passValues.includes(verdict)) return { status: "passed", selected, errors, warnings: [] };
  if (verdict === "corrections_required" || verdict === "corrections_requises") {
    const required = requiredFindingIds(selected.content);
    const closures = correctionsFor(latestTarget.content, selected.id);
    const missing = required.filter((id) => !closures.has(id));
    const dependsOnAudit = selected.id !== undefined && latestTarget.id !== stringField(selected.content, policy.targetDocumentField)
      && isAncestor(selected.id, latestTarget, allDocuments);
    if (dependsOnAudit && missing.length === 0) return { status: "passed", selected, errors, warnings: [] };
    const reason = !dependsOnAudit
      ? `A new delivered ${policy.targetStep} must depend on audit ${selected.id ?? "current"}.`
      : `The corrective report does not close required findings: ${missing.join(", ")}.`;
    return {
      status: "failed", selected,
      action: createGuidedAction("return_to_development", policy.retryStep, reason, featureId, selected.id),
      errors, warnings: [],
    };
  }
  if (verdict !== undefined && policy.failValues.includes(verdict)) {
    return {
      status: "failed", selected,
      action: createGuidedAction("return_to_development", policy.retryStep, `${stepId} blocks delivery.`, featureId, selected.id),
      errors, warnings: [],
    };
  }
  return { status: "blocked", selected, errors, warnings: [] };
}

function unknownTargets(
  documents: readonly EvaluatedDocument[],
  targets: readonly EvaluatedDocument[],
  targetField: string,
  stepId: string,
): string[] {
  const known = new Set(targets.map((target) => target.id).filter((id): id is string => id !== undefined));
  return documents.flatMap((document) => {
    const target = stringField(document.content, targetField);
    return target !== undefined && !known.has(target) ? [`${stepId} references unknown target: ${target}.`] : [];
  });
}

function requiredFindingIds(content: Readonly<Record<string, unknown>>): readonly string[] {
  const findings = compatibleFieldValue(content, "findings");
  if (!Array.isArray(findings)) return [];
  return findings.flatMap((finding) => {
    if (!isRecord(finding) || canonicalEnumValue(String(finding["decision"])) !== "fix" || typeof finding["id"] !== "string") return [];
    return [finding["id"]];
  });
}

function correctionsFor(content: Readonly<Record<string, unknown>>, sourceId: string | undefined): ReadonlySet<string> {
  const corrections = compatibleFieldValue(content, "corrections_applied");
  if (!Array.isArray(corrections) || sourceId === undefined) return new Set();
  return new Set(corrections.flatMap((correction) => {
    const findingId = isRecord(correction) ? compatibleFieldValue(correction, "finding_id") : undefined;
    if (!isRecord(correction) || correction["source_document_id"] !== sourceId || typeof findingId !== "string") return [];
    return [findingId];
  }));
}

function isAncestor(ancestorId: string, document: EvaluatedDocument, allDocuments: readonly EvaluatedDocument[]): boolean {
  const byId = new Map(allDocuments.flatMap((candidate) => candidate.id === undefined ? [] : [[candidate.id, candidate] as const]));
  const pending = [...document.dependencyDocumentIds];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === ancestorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(byId.get(current)?.dependencyDocumentIds ?? []));
  }
  return false;
}

export function createGuidedAction(
  kind: NextAction["kind"],
  stepId: string,
  reason: string,
  featureId?: string,
  relatedDocumentId?: string,
): NextAction {
  const target = featureId ?? "<feature>";
  return {
    kind,
    stepId,
    reason,
    phase: phaseFor(stepId),
    instructions: instructionsFor(stepId),
    suggestedCommand: `arka-norn pipeline scaffold ${stepId} --feature ${target}`,
    ...(relatedDocumentId === undefined ? {} : { relatedDocumentId }),
  };
}

function phaseFor(stepId: string): string {
  if (stepId === "rework_brief" || stepId === "feature_brief") return "Brief";
  if (stepId === "development_report") return "Development";
  if (stepId === "delivery_audit") return "Audit";
  if (stepId === "delivery_validation") return "Validation";
  if (stepId === "qa_review") return "QA review";
  return stepId;
}

function instructionsFor(stepId: string): readonly string[] {
  if (stepId === "rework_brief" || stepId === "feature_brief") return ["Bound the problem and exclusions.", "Define code, functional, UX and security acceptance criteria."];
  if (stepId === "development_report") return ["Deliver a bounded batch with its tests.", "Reference and close every required finding in corrective work."];
  if (stepId === "delivery_audit") return ["Audit the latest development report and exact commit.", "Provide evidence for every finding."];
  if (stepId === "delivery_validation") return ["Review only the latest development report.", "Verify criteria, corrections, gates and functional/UX evidence."];
  return ["Produce the expected document with reproducible evidence."];
}

function result(status: BusinessStatus, selected?: EvaluatedDocument, action?: NextAction): BusinessPolicyResult {
  return { status, ...(selected === undefined ? {} : { selected }), ...(action === undefined ? {} : { action }), errors: [], warnings: [] };
}

function emptyResult(): BusinessPolicyResult {
  return { status: "not_started", errors: [], warnings: [] };
}

function stringField(content: Readonly<Record<string, unknown>>, field: string): string | undefined {
  const value = content[field];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQaReview(stepId: string): boolean {
  return isDocumentType(stepId, "qa_review");
}
