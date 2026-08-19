import { evaluatePipeline } from "../../domain/pipeline/evaluate-pipeline.js";
export function inspectPipelineUseCaseFactory(deps) {
    return async (input) => {
        const definition = await deps.source.loadDefinition();
        const candidates = await deps.source.list(input.featureRoot);
        const knownSteps = new Map(definition.steps.map((step) => [step.id, step]));
        const documents = [];
        const sourceErrors = [];
        for (const candidate of candidates) {
            if (candidate.content === undefined) {
                sourceErrors.push(...candidate.readErrors.map((error) => `${candidate.filePath}: ${error}`));
                continue;
            }
            const type = stringField(candidate.content, "type");
            if (type === undefined) {
                sourceErrors.push(`${candidate.filePath}: missing string field "type".`);
                continue;
            }
            const step = knownSteps.get(type);
            const validation = step === undefined
                ? { valid: true, errors: [] }
                : await deps.validator.validate(step.schemaPath, candidate.content);
            documents.push(toEvaluatedDocument(candidate.filePath, candidate.content, type, validation));
        }
        return evaluatePipeline({
            pipelineId: definition.pipelineId,
            featureRoot: input.featureRoot,
            ...(input.featureId !== undefined ? { featureId: input.featureId } : {}),
            steps: definition.steps,
            documents,
            sourceErrors,
            transversalDocumentTypes: definition.transversalDocuments.map((document) => document.type),
        });
    };
}
function toEvaluatedDocument(filePath, content, type, validation) {
    const id = stringField(content, "id");
    const featureId = stringField(content, "feature_id");
    const createdAt = stringField(content, "created_at") ?? stringField(content, "date");
    const sequence = numberField(content, "sequence");
    const crDevId = stringField(content, "cr_dev_id");
    const businessVerdict = type === "recette_qa" ? stringField(content, "statut_global") : type === "cr_dev" ? stringField(content, "statut") : undefined;
    return {
        filePath,
        type,
        valid: validation.valid,
        errors: validation.errors,
        content,
        ...(id !== undefined ? { id } : {}),
        ...(featureId !== undefined ? { featureId } : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(sequence !== undefined ? { sequence } : {}),
        ...(crDevId !== undefined ? { crDevId } : {}),
        ...(businessVerdict !== undefined ? { businessVerdict } : {}),
    };
}
function stringField(content, field) {
    const value = content[field];
    return typeof value === "string" ? value : undefined;
}
function numberField(content, field) {
    const value = content[field];
    return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
//# sourceMappingURL=inspect-pipeline.js.map