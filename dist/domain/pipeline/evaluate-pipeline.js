export function evaluatePipeline(input) {
    const stepTypes = new Set(input.steps.map((step) => step.id));
    const knownTypes = new Set([...stepTypes, ...(input.transversalDocumentTypes ?? [])]);
    const knownDocuments = input.documents.filter((document) => document.type !== undefined && knownTypes.has(document.type));
    const unknownFiles = [
        ...(input.unknownFiles ?? []),
        ...input.documents.filter((document) => document.type === undefined || !knownTypes.has(document.type)).map((document) => document.filePath),
    ].sort();
    const warnings = unknownFiles.map((file) => `Unknown pipeline document: ${file}`);
    const errors = [...(input.sourceErrors ?? [])];
    const transversalTypes = new Set(input.transversalDocumentTypes ?? []);
    for (const document of knownDocuments.filter((candidate) => candidate.type !== undefined && transversalTypes.has(candidate.type) && !candidate.valid)) {
        errors.push(...document.errors.map((error) => `${document.filePath}: ${error}`));
    }
    validateDocumentGraph(input, knownDocuments, errors);
    for (const document of knownDocuments) {
        if (input.featureId !== undefined && document.featureId !== input.featureId) {
            errors.push(document.featureId === undefined
                ? `Document ${document.filePath} has no feature_id; expected ${input.featureId}.`
                : `Document ${document.filePath} belongs to feature ${document.featureId}, expected ${input.featureId}.`);
        }
    }
    const crDocuments = validDocuments(knownDocuments, "cr_dev");
    const latestCr = selectLatestRun(crDocuments);
    const qaDocuments = validDocuments(knownDocuments, "recette_qa");
    const qaForLatestCr = latestCr === undefined ? [] : qaDocuments.filter((document) => document.crDevId === latestCr.id);
    const selectedQa = selectLatestRun(qaForLatestCr);
    const referencedCrIds = new Set(qaDocuments.map((document) => document.crDevId).filter((value) => value !== undefined));
    const knownCrIds = new Set(crDocuments.map((document) => document.id).filter((value) => value !== undefined));
    for (const crDevId of referencedCrIds) {
        if (!knownCrIds.has(crDevId))
            errors.push(`QA references unknown CR Dev: ${crDevId}.`);
    }
    if (latestCr !== undefined && qaDocuments.some((document) => document.crDevId !== latestCr.id && document.businessVerdict === "pass")) {
        warnings.push(`A passing QA exists for an older CR Dev; latest CR Dev is ${latestCr.id ?? "unknown"}.`);
    }
    const states = new Map();
    for (const definition of [...input.steps].sort((a, b) => a.order - b.order)) {
        const documents = knownDocuments.filter((document) => document.type === definition.id);
        if (!definition.multiple && documents.length > 1) {
            errors.push(`Step ${definition.id} allows one document, found ${documents.length}.`);
        }
        const dependencyStatus = definition.dependsOn.every((dependency) => states.get(dependency)?.completionStatus === "completed")
            ? "satisfied"
            : "unsatisfied";
        const presenceStatus = documents.length === 0 ? "absent" : "present";
        const schemaStatus = documents.every((document) => document.valid) ? "valid" : "invalid";
        const selected = definition.id === "cr_dev" ? latestCr : definition.id === "recette_qa" ? selectedQa : selectLatestRun(documents.filter((document) => document.valid));
        const businessStatus = businessStatusFor(definition.id, presenceStatus, schemaStatus, selected);
        const completionStatus = completionFor({ required: definition.required, presenceStatus, schemaStatus, dependencyStatus, businessStatus });
        const nextActions = actionsFor({ stepId: definition.id, required: definition.required, presenceStatus, schemaStatus, dependencyStatus, businessStatus, selected, latestCr });
        states.set(definition.id, {
            id: definition.id,
            order: definition.order,
            required: definition.required,
            multiple: definition.multiple,
            presenceStatus,
            schemaStatus,
            businessStatus,
            dependencyStatus,
            completionStatus,
            documents: documents.map(withoutContent),
            ...(selected?.id !== undefined ? { selectedDocumentId: selected.id } : {}),
            nextActions,
        });
    }
    const steps = [...states.values()];
    const transversalDocuments = [...transversalTypes].sort().map((type) => ({
        type,
        documents: knownDocuments.filter((document) => document.type === type).map(withoutContent),
    }));
    const nextActions = steps.flatMap((step) => step.nextActions).slice(0, 1);
    const overallStatus = overallStatusFor(steps, errors);
    return {
        schemaVersion: 1,
        pipelineId: input.pipelineId,
        featureRoot: input.featureRoot,
        ...(input.featureId !== undefined ? { featureId: input.featureId } : {}),
        overallStatus,
        ...(latestCr?.id !== undefined ? { latestCrDevId: latestCr.id } : {}),
        ...(selectedQa?.id !== undefined ? { selectedQaId: selectedQa.id } : {}),
        steps,
        transversalDocuments,
        nextActions,
        errors,
        warnings,
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
                if (!referencedTypes.has(dependencyType)) {
                    errors.push(`Document ${document.filePath} must reference a ${dependencyType} document.`);
                }
            }
            if (document.type === "recette_qa" && document.crDevId !== undefined && !document.dependencyDocumentIds.includes(document.crDevId)) {
                errors.push(`QA ${document.filePath} must include cr_dev_id ${document.crDevId} in depends_on_document_ids.`);
            }
        }
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
        for (const dependencyId of byId.get(id)?.dependencyDocumentIds ?? []) {
            if (byId.has(dependencyId))
                visit(dependencyId);
        }
        visiting.delete(id);
        visited.add(id);
    };
    for (const id of byId.keys())
        visit(id);
}
export function selectLatestRun(documents) {
    return [...documents].sort((left, right) => {
        const bySequence = (right.sequence ?? -1) - (left.sequence ?? -1);
        if (bySequence !== 0)
            return bySequence;
        const byDate = timestamp(right.createdAt) - timestamp(left.createdAt);
        if (byDate !== 0)
            return byDate;
        return (right.id ?? "").localeCompare(left.id ?? "");
    })[0];
}
function validDocuments(documents, type) {
    return documents.filter((document) => document.type === type && document.valid);
}
function businessStatusFor(stepId, presenceStatus, schemaStatus, selected) {
    if (presenceStatus === "absent")
        return "not_started";
    if (schemaStatus === "invalid")
        return "blocked";
    if (stepId === "cr_dev") {
        if (selected?.businessVerdict === "livre")
            return "passed";
        if (selected?.businessVerdict === "partiel")
            return "in_progress";
        return "blocked";
    }
    if (stepId === "recette_qa") {
        if (selected === undefined)
            return "not_started";
        if (selected.businessVerdict === "pass")
            return "passed";
        if (selected.businessVerdict === "fail")
            return "failed";
        if (selected.businessVerdict === "partial")
            return "in_progress";
        return "blocked";
    }
    return "passed";
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
        return [{ kind: "fix_document", stepId: input.stepId, reason: "At least one document fails schema validation." }];
    }
    if (input.dependencyStatus === "unsatisfied")
        return [];
    if (input.presenceStatus === "absent" && input.required) {
        return [{ kind: "create_document", stepId: input.stepId, reason: "Required pipeline step is absent." }];
    }
    if (input.stepId === "cr_dev" && input.businessStatus !== "passed") {
        return [{ kind: "continue_development", stepId: "cr_dev", reason: "Latest development run is not delivered.", ...(input.selected?.id !== undefined ? { relatedDocumentId: input.selected.id } : {}) }];
    }
    if (input.stepId === "recette_qa") {
        if (input.businessStatus === "failed") {
            return [{ kind: "return_to_development", stepId: "cr_dev", reason: "QA failed for the latest development run.", ...(input.latestCr?.id !== undefined ? { relatedDocumentId: input.latestCr.id } : {}) }];
        }
        if (input.businessStatus === "in_progress") {
            return [{ kind: "resolve_qa", stepId: "recette_qa", reason: "QA is partial and does not complete the pipeline.", ...(input.latestCr?.id !== undefined ? { relatedDocumentId: input.latestCr.id } : {}) }];
        }
        if (input.businessStatus !== "passed" && input.latestCr !== undefined) {
            return [{ kind: "run_qa", stepId: "recette_qa", reason: "No passing QA references the latest development run.", ...(input.latestCr.id !== undefined ? { relatedDocumentId: input.latestCr.id } : {}) }];
        }
    }
    return [];
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
    const { content: _content, ...summary } = document;
    return summary;
}
function timestamp(value) {
    if (value === undefined)
        return -1;
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? -1 : parsed;
}
//# sourceMappingURL=evaluate-pipeline.js.map