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
import { selectLatestRun } from "./select-latest-run.js";
export function evaluateBusinessPolicy(input) {
    const valid = input.documents.filter((document) => document.valid);
    const policy = input.step.businessPolicy ?? { type: "presence" };
    if (valid.length === 0)
        return emptyResult();
    if (policy.type === "presence")
        return result("passed", selectLatestRun(valid));
    if (policy.type === "delivery")
        return delivery(policy, valid, input.step.id, input.featureId);
    if (policy.type === "audit_then_fix")
        return auditThenFix(policy, valid, input.allDocuments, input.step.id, input.featureId);
    return reviewLatest(policy, valid, input.allDocuments, input.step.id, input.featureId);
}
function delivery(policy, documents, stepId, featureId) {
    const selected = selectLatestRun(documents);
    const verdict = selected === undefined ? undefined : stringField(selected.content, policy.verdictField);
    if (verdict !== undefined && policy.passValues.includes(verdict))
        return result("passed", selected);
    if (verdict !== undefined && policy.inProgressValues.includes(verdict)) {
        return result("in_progress", selected, createGuidedAction("continue_development", stepId, "La dernière livraison est partielle.", featureId, selected?.id));
    }
    return result("blocked", selected, createGuidedAction("continue_development", stepId, "La dernière livraison n'est pas livrée.", featureId, selected?.id));
}
function reviewLatest(policy, reviews, allDocuments, stepId, featureId) {
    const targets = allDocuments.filter((document) => document.type === policy.targetStep && document.valid);
    const latestTarget = selectLatestRun(targets);
    if (latestTarget?.id === undefined)
        return emptyResult();
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
                action: createGuidedAction("return_to_development", policy.retryStep, `Le correctif doit dépendre de ${staleFailure.id}.`, featureId, staleFailure.id),
                errors,
                warnings,
            };
        }
        return {
            status: "not_started",
            action: createGuidedAction(stepId === "recette_qa" ? "run_qa" : "run_validation", stepId, `Aucun ${stepId} concluant ne vise le dernier ${policy.targetStep}.`, featureId, latestTarget.id),
            errors,
            warnings,
        };
    }
    const verdict = stringField(selected.content, policy.verdictField);
    if (verdict !== undefined && policy.passValues.includes(verdict))
        return { status: "passed", selected, errors, warnings };
    if (verdict !== undefined && policy.failValues.includes(verdict)) {
        return {
            status: "failed", selected,
            action: createGuidedAction("return_to_development", policy.retryStep, `${stepId} a échoué sur le dernier ${policy.targetStep}.`, featureId, selected.id),
            errors, warnings,
        };
    }
    if (verdict !== undefined && policy.inProgressValues.includes(verdict)) {
        const kind = stepId === "recette_qa" ? "resolve_qa" : "return_to_development";
        return {
            status: "in_progress", selected,
            action: createGuidedAction(kind, kind === "resolve_qa" ? stepId : policy.retryStep, `${stepId} est partiel et ne termine pas le pipeline.`, featureId, selected.id),
            errors, warnings,
        };
    }
    return { status: "blocked", selected, errors, warnings };
}
function auditThenFix(policy, audits, allDocuments, stepId, featureId) {
    const targets = allDocuments.filter((document) => document.type === policy.targetStep && document.valid);
    const latestTarget = selectLatestRun(targets);
    if (latestTarget?.id === undefined)
        return emptyResult();
    const errors = unknownTargets(audits, targets, policy.targetDocumentField, stepId);
    const applicable = audits.filter((audit) => {
        const auditedId = stringField(audit.content, policy.targetDocumentField);
        return auditedId === latestTarget.id || (audit.id !== undefined && isAncestor(audit.id, latestTarget, allDocuments));
    });
    const selected = selectLatestRun(applicable);
    if (selected === undefined) {
        return {
            status: "not_started",
            action: createGuidedAction("run_audit", stepId, `Le dernier ${policy.targetStep} livré doit être audité.`, featureId, latestTarget.id),
            errors,
            warnings: [],
        };
    }
    const verdict = stringField(selected.content, policy.verdictField);
    if (verdict !== undefined && policy.passValues.includes(verdict))
        return { status: "passed", selected, errors, warnings: [] };
    if (verdict === "corrections_requises") {
        const required = requiredFindingIds(selected.content);
        const closures = correctionsFor(latestTarget.content, selected.id);
        const missing = required.filter((id) => !closures.has(id));
        const dependsOnAudit = selected.id !== undefined && latestTarget.id !== stringField(selected.content, policy.targetDocumentField)
            && isAncestor(selected.id, latestTarget, allDocuments);
        if (dependsOnAudit && missing.length === 0)
            return { status: "passed", selected, errors, warnings: [] };
        const reason = !dependsOnAudit
            ? `Un nouveau ${policy.targetStep} livré doit dépendre de l'audit ${selected.id ?? "courant"}.`
            : `Le CR correctif ne ferme pas les constats obligatoires : ${missing.join(", ")}.`;
        return {
            status: "failed", selected,
            action: createGuidedAction("return_to_development", policy.retryStep, reason, featureId, selected.id),
            errors, warnings: [],
        };
    }
    if (verdict !== undefined && policy.failValues.includes(verdict)) {
        return {
            status: "failed", selected,
            action: createGuidedAction("return_to_development", policy.retryStep, `${stepId} bloque la livraison.`, featureId, selected.id),
            errors, warnings: [],
        };
    }
    return { status: "blocked", selected, errors, warnings: [] };
}
function unknownTargets(documents, targets, targetField, stepId) {
    const known = new Set(targets.map((target) => target.id).filter((id) => id !== undefined));
    return documents.flatMap((document) => {
        const target = stringField(document.content, targetField);
        return target !== undefined && !known.has(target) ? [`${stepId} references unknown target: ${target}.`] : [];
    });
}
function requiredFindingIds(content) {
    const findings = content["constats"];
    if (!Array.isArray(findings))
        return [];
    return findings.flatMap((finding) => {
        if (!isRecord(finding) || finding["decision"] !== "corriger" || typeof finding["id"] !== "string")
            return [];
        return [finding["id"]];
    });
}
function correctionsFor(content, sourceId) {
    const corrections = content["corrections_apportees"];
    if (!Array.isArray(corrections) || sourceId === undefined)
        return new Set();
    return new Set(corrections.flatMap((correction) => {
        if (!isRecord(correction) || correction["source_document_id"] !== sourceId || typeof correction["constat_id"] !== "string")
            return [];
        return [correction["constat_id"]];
    }));
}
function isAncestor(ancestorId, document, allDocuments) {
    const byId = new Map(allDocuments.flatMap((candidate) => candidate.id === undefined ? [] : [[candidate.id, candidate]]));
    const pending = [...document.dependencyDocumentIds];
    const visited = new Set();
    while (pending.length > 0) {
        const current = pending.pop();
        if (current === ancestorId)
            return true;
        if (visited.has(current))
            continue;
        visited.add(current);
        pending.push(...(byId.get(current)?.dependencyDocumentIds ?? []));
    }
    return false;
}
export function createGuidedAction(kind, stepId, reason, featureId, relatedDocumentId) {
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
function phaseFor(stepId) {
    if (stepId === "cadrage_rework")
        return "Cadrage";
    if (stepId === "cr_dev")
        return "Développement";
    if (stepId === "audit_rework")
        return "Audit";
    if (stepId === "validation_fastdev")
        return "Validation";
    if (stepId === "recette_qa")
        return "Recette QA";
    return stepId;
}
function instructionsFor(stepId) {
    if (stepId === "cadrage_rework")
        return ["Borner le problème et les exclusions.", "Définir des critères code, fonctionnels, UX et sécurité."];
    if (stepId === "cr_dev")
        return ["Livrer un lot borné avec ses tests.", "Référencer et fermer chaque constat obligatoire lors d'une correction."];
    if (stepId === "audit_rework")
        return ["Auditer le dernier CR et son commit exact.", "Fournir une preuve pour chaque constat."];
    if (stepId === "validation_fastdev")
        return ["Contrôler le dernier CR uniquement.", "Vérifier critères, corrections, gates et preuves UX/fonctionnelles."];
    return ["Produire le document attendu avec des preuves reproductibles."];
}
function result(status, selected, action) {
    return { status, ...(selected === undefined ? {} : { selected }), ...(action === undefined ? {} : { action }), errors: [], warnings: [] };
}
function emptyResult() {
    return { status: "not_started", errors: [], warnings: [] };
}
function stringField(content, field) {
    const value = content[field];
    return typeof value === "string" ? value : undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=evaluate-business-policy.js.map