import { createGuidedAction, evaluateBusinessPolicy } from "./evaluate-business-policy.js";
import { selectLatestRun } from "./select-latest-run.js";
export { selectLatestRun } from "./select-latest-run.js";
export function evaluatePipeline(input) {
    const stepTypes = new Set(input.steps.map((step) => step.id));
    const transversalTypes = new Set(input.transversalDocumentTypes ?? []);
    const knownTypes = new Set([...stepTypes, ...transversalTypes]);
    const knownDocuments = input.documents.filter((document) => document.type !== undefined && knownTypes.has(document.type));
    const unknownFiles = [
        ...(input.unknownFiles ?? []),
        ...input.documents.filter((document) => document.type === undefined || !knownTypes.has(document.type)).map((document) => document.filePath),
    ].sort();
    const warnings = unknownFiles.map((file) => `Unknown pipeline document: ${file}`);
    const errors = [...(input.sourceErrors ?? [])];
    for (const document of knownDocuments.filter((candidate) => candidate.type !== undefined && transversalTypes.has(candidate.type) && !candidate.valid)) {
        errors.push(...document.errors.map((error) => `${document.filePath}: ${error}`));
    }
    validateDocumentGraph(input, knownDocuments, errors);
    validateFeatureAndAuthors(input, knownDocuments, errors);
    const states = new Map();
    for (const definition of [...input.steps].sort((left, right) => left.order - right.order)) {
        const documents = knownDocuments.filter((document) => document.type === definition.id);
        if (!definition.multiple && documents.length > 1)
            errors.push(`Step ${definition.id} allows one document, found ${documents.length}.`);
        const dependencyStatus = definition.dependsOn.every((dependency) => states.get(dependency)?.completionStatus === "completed")
            ? "satisfied"
            : "unsatisfied";
        const presenceStatus = documents.length === 0 ? "absent" : "present";
        const schemaStatus = documents.every((document) => document.valid) ? "valid" : "invalid";
        const policy = evaluateBusinessPolicy({
            step: definition,
            documents,
            allDocuments: knownDocuments,
            ...(input.featureId === undefined ? {} : { featureId: input.featureId }),
        });
        errors.push(...policy.errors);
        warnings.push(...policy.warnings);
        const completionStatus = completionFor({ required: definition.required, presenceStatus, schemaStatus, dependencyStatus, businessStatus: policy.status });
        const nextActions = actionsFor({
            stepId: definition.id,
            required: definition.required,
            presenceStatus,
            schemaStatus,
            dependencyStatus,
            ...(policy.action === undefined ? {} : { policyAction: policy.action }),
            ...(input.featureId === undefined ? {} : { featureId: input.featureId }),
        });
        states.set(definition.id, {
            id: definition.id,
            order: definition.order,
            required: definition.required,
            multiple: definition.multiple,
            presenceStatus,
            schemaStatus,
            businessStatus: policy.status,
            dependencyStatus,
            completionStatus,
            documents: documents.map(withoutContent),
            ...(policy.selected?.id === undefined ? {} : { selectedDocumentId: policy.selected.id }),
            nextActions,
        });
    }
    const steps = [...states.values()];
    const transversalDocuments = [...transversalTypes].sort().map((type) => ({
        type,
        documents: knownDocuments.filter((document) => document.type === type).map(withoutContent),
    }));
    const latestCr = selectedFor("cr_dev", states, knownDocuments);
    const selectedQa = selectedFor("recette_qa", states, knownDocuments);
    const selectedAudit = selectedFor("audit_rework", states, knownDocuments);
    const selectedValidation = selectedFor("validation_fastdev", states, knownDocuments);
    const overallStatus = overallStatusFor(steps, errors);
    return {
        schemaVersion: 1,
        pipelineId: input.pipelineId,
        featureRoot: input.featureRoot,
        ...(input.featureId === undefined ? {} : { featureId: input.featureId }),
        overallStatus,
        ...(latestCr?.id === undefined ? {} : { latestCrDevId: latestCr.id }),
        ...(selectedQa?.id === undefined ? {} : { selectedQaId: selectedQa.id }),
        ...(selectedAudit?.id === undefined ? {} : { selectedAuditId: selectedAudit.id }),
        ...(selectedValidation?.id === undefined ? {} : { selectedValidationId: selectedValidation.id }),
        steps,
        transversalDocuments,
        nextActions: steps.flatMap((step) => step.nextActions).slice(0, 1),
        errors: unique(errors),
        warnings: unique(warnings),
        unknownFiles,
    };
}
function validateDocumentGraph(input, documents, errors) {
    const byId = new Map();
    for (const document of documents) {
        if (document.id === undefined) {
            errors.push(`Document ${document.filePath} has no id.`);
            continue;
        }
        const previous = byId.get(document.id);
        if (previous !== undefined)
            errors.push(`Duplicate document id ${document.id}: ${previous.filePath} and ${document.filePath}.`);
        else
            byId.set(document.id, document);
    }
    for (const document of documents) {
        for (const dependencyId of document.dependencyDocumentIds) {
            if (dependencyId === document.id)
                errors.push(`Document ${document.filePath} depends on itself.`);
            else if (!byId.has(dependencyId))
                errors.push(`Document ${document.filePath} references unknown document ${dependencyId}.`);
        }
    }
    validateRequiredStepRelations(input, documents, byId, errors);
    validateAcyclicGraph(byId, errors);
}
function validateRequiredStepRelations(input, documents, byId, errors) {
    for (const step of input.steps) {
        for (const document of documents.filter((candidate) => candidate.type === step.id)) {
            const referencedTypes = new Set(document.dependencyDocumentIds.map((id) => byId.get(id)?.type).filter((type) => type !== undefined));
            for (const dependencyType of step.dependsOn) {
                if (!referencedTypes.has(dependencyType))
                    errors.push(`Document ${document.filePath} must reference a ${dependencyType} document.`);
            }
            const policy = step.businessPolicy;
            if (policy !== undefined && (policy.type === "audit_then_fix" || policy.type === "review_latest")) {
                const targetId = stringField(document.content, policy.targetDocumentField);
                if (targetId !== undefined && !document.dependencyDocumentIds.includes(targetId)) {
                    errors.push(`${step.id} ${document.filePath} must include ${policy.targetDocumentField} ${targetId} in depends_on_document_ids.`);
                }
            }
            const auditId = stringField(document.content, "audit_rework_id");
            if (auditId !== undefined && !document.dependencyDocumentIds.includes(auditId)) {
                errors.push(`${step.id} ${document.filePath} must include audit_rework_id ${auditId} in depends_on_document_ids.`);
            }
        }
    }
}
function validateFeatureAndAuthors(input, documents, errors) {
    const registry = input.authorRegistry === undefined ? undefined : new Map(input.authorRegistry.map((agent) => [agent.id, agent]));
    for (const document of documents) {
        if (input.featureId !== undefined && document.featureId !== input.featureId) {
            errors.push(document.featureId === undefined
                ? `Document ${document.filePath} has no feature_id; expected ${input.featureId}.`
                : `Document ${document.filePath} belongs to feature ${document.featureId}, expected ${input.featureId}.`);
        }
        if (registry === undefined || document.content["schema_version"] !== 3)
            continue;
        const authorId = stringField(document.content, "author_agent_id");
        const agent = authorId === undefined ? undefined : registry.get(authorId);
        if (authorId !== undefined && agent === undefined)
            errors.push(`Document ${document.filePath} author ${authorId} is absent from the Project registry.`);
        else if (agent !== undefined && !agent.authorized)
            errors.push(`Document ${document.filePath} author ${agent.id} is outside the Feature scope.`);
    }
}
function validateAcyclicGraph(byId, errors) {
    const visiting = new Set();
    const visited = new Set();
    const visit = (id) => {
        if (visited.has(id))
            return;
        if (visiting.has(id)) {
            errors.push(`Document dependency cycle detected at ${id}.`);
            return;
        }
        visiting.add(id);
        for (const dependencyId of byId.get(id)?.dependencyDocumentIds ?? [])
            if (byId.has(dependencyId))
                visit(dependencyId);
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of byId.keys())
        visit(id);
}
function completionFor(input) {
    if (input.presenceStatus === "absent")
        return input.required ? "not_started" : "completed";
    if (input.schemaStatus === "invalid" || input.dependencyStatus === "unsatisfied")
        return "blocked";
    if (input.businessStatus === "passed")
        return "completed";
    if (input.businessStatus === "failed")
        return "failed";
    if (input.businessStatus === "in_progress")
        return "in_progress";
    return "blocked";
}
function actionsFor(input) {
    if (input.schemaStatus === "invalid") {
        return [createGuidedAction("fix_document", input.stepId, "Au moins un document ne valide pas son schéma.", input.featureId)];
    }
    if (input.dependencyStatus === "unsatisfied")
        return [];
    if (input.presenceStatus === "absent" && input.required) {
        return [createGuidedAction("create_document", input.stepId, "Cette étape obligatoire est absente.", input.featureId)];
    }
    return input.policyAction === undefined ? [] : [input.policyAction];
}
function selectedFor(type, states, documents) {
    const state = states.get(type);
    const selectedId = state?.selectedDocumentId;
    if (selectedId !== undefined)
        return documents.find((document) => document.id === selectedId);
    if (state !== undefined)
        return undefined;
    return selectLatestRun(documents.filter((document) => document.type === type && document.valid));
}
function overallStatusFor(steps, errors) {
    if (errors.length > 0 || steps.some((step) => step.schemaStatus === "invalid"))
        return "invalid";
    if (steps.some((step) => step.completionStatus === "failed"))
        return "failed";
    if (steps.filter((step) => step.required).every((step) => step.completionStatus === "completed"))
        return "completed";
    return "incomplete";
}
function withoutContent(document) {
    return {
        filePath: document.filePath,
        valid: document.valid,
        errors: document.errors,
        dependencyDocumentIds: document.dependencyDocumentIds,
        ...(document.id === undefined ? {} : { id: document.id }),
        ...(document.type === undefined ? {} : { type: document.type }),
        ...(document.sequence === undefined ? {} : { sequence: document.sequence }),
        ...(document.createdAt === undefined ? {} : { createdAt: document.createdAt }),
        ...(document.featureId === undefined ? {} : { featureId: document.featureId }),
        ...(document.crDevId === undefined ? {} : { crDevId: document.crDevId }),
        ...(document.businessVerdict === undefined ? {} : { businessVerdict: document.businessVerdict }),
        ...(document.authorAgentId === undefined ? {} : { authorAgentId: document.authorAgentId }),
        ...(document.exactCommit === undefined ? {} : { exactCommit: document.exactCommit }),
        ...(document.findingCount === undefined ? {} : { findingCount: document.findingCount }),
        ...(document.openFindingCount === undefined ? {} : { openFindingCount: document.openFindingCount }),
        ...(document.correctionCount === undefined ? {} : { correctionCount: document.correctionCount }),
    };
}
function stringField(content, field) {
    const value = content[field];
    return typeof value === "string" ? value : undefined;
}
function unique(values) {
    return [...new Set(values)];
}
//# sourceMappingURL=evaluate-pipeline.js.map