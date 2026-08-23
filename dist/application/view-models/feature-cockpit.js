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
import { canonicalDocumentType } from "../compatibility/legacy-french-contract.js";
export function createFeatureCockpitViewModel(feature, report) {
    const completed = report.steps.filter((step) => step.completionStatus === "completed").length;
    const required = report.steps.filter((step) => step.required).length;
    const crStep = findStep(report, "development_report");
    const qaStep = findStep(report, "qa_review");
    const debtStep = findStep(report, "debt_register");
    const next = report.nextActions[0];
    const fastdev = feature.pipelineId === "arka-norn-fastdev";
    const fastdevDetails = createFastdevDetails(report, crStep, next, fastdev);
    return {
        title: feature.name,
        root: feature.root,
        overallStatus: report.overallStatus,
        progress: fastdev ? `${fastdevDetails.phase} - ${completed}/${required}` : `${completed}/${required} required steps completed`,
        nextAction: nextLabel(next),
        nextReason: nextReason(next),
        timeline: report.steps.map((step) => `${String(step.order).padStart(2, "0")} ${symbol(step.completionStatus)} ${step.id} - ${step.schemaStatus}/${step.businessStatus}`),
        developmentRuns: crStep?.documents.length ?? 0,
        qaRuns: qaStep?.documents.length ?? 0,
        qaFailures: qaStep?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
        debtDocuments: debtStep?.documents.length ?? 0,
        handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
        ...fastdevDetails,
    };
}
function createFastdevDetails(report, crStep, next, fastdev) {
    const auditStep = findStep(report, "delivery_audit");
    const validationStep = findStep(report, "delivery_validation");
    const closedCorrections = sumField(crStep, "correctionCount");
    const findings = sumField(auditStep, "openFindingCount");
    const phase = fastdev && next?.stepId === "development_report" && auditStep?.businessStatus === "failed"
        ? "Corrections"
        : next?.phase ?? (report.overallStatus === "completed" ? "Completed" : "Diagnostic");
    const auditedCommit = selectedDocument(auditStep)?.exactCommit;
    return {
        ...(fastdev ? { workflowBadge: "FASTDEV" } : {}),
        phase,
        iteration: Math.max(1, crStep?.documents.length ?? 0),
        openFindings: Math.max(0, findings - closedCorrections),
        closedCorrections,
        ...(auditedCommit === undefined ? {} : { latestAuditedCommit: auditedCommit }),
        validationState: selectedDocument(validationStep)?.businessVerdict ?? "absent",
        instructions: next?.instructions ?? [],
        ...(next === undefined ? {} : { expectedArtifact: `${next.stepId}.json` }),
        ...(next?.suggestedCommand === undefined ? {} : { suggestedCommand: next.suggestedCommand }),
    };
}
function selectedDocument(step) {
    return step?.documents.find((document) => document.id === step.selectedDocumentId);
}
function sumField(step, field) {
    return step?.documents.reduce((count, document) => count + (document[field] ?? 0), 0) ?? 0;
}
function nextLabel(next) {
    return next === undefined ? "None - pipeline completed" : `${next.kind} -> ${next.stepId}`;
}
function nextReason(next) {
    return next === undefined ? "all required steps and the latest review are conclusive" : next.reason;
}
function findStep(report, canonicalType) {
    return report.steps.find((step) => canonicalDocumentType(step.id) === canonicalType);
}
function symbol(status) {
    if (status === "completed")
        return "✓";
    if (status === "failed" || status === "blocked")
        return "!";
    if (status === "in_progress")
        return "~";
    return "·";
}
//# sourceMappingURL=feature-cockpit.js.map