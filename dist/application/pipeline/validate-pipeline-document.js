import { findScaffoldSentinels } from "../../domain/pipeline/scaffold-schema.js";
export function validatePipelineDocumentUseCaseFactory(deps) {
    return async (input) => {
        const candidate = await deps.source.read(input.filePath);
        if (candidate.content === undefined)
            return { valid: false, errors: candidate.readErrors };
        const type = candidate.content["type"];
        if (typeof type !== "string")
            return { valid: false, errors: ['missing string field "type"'] };
        const definition = await deps.source.loadDefinition(input.pipelineId);
        const schemaPath = definition.steps.find((step) => step.id === type)?.schemaPath
            ?? definition.transversalDocuments.find((document) => document.type === type)?.schemaPath;
        if (schemaPath === undefined)
            return { valid: false, type, errors: [`unknown pipeline document type: ${type}`] };
        const schemaResult = await deps.validator.validate(schemaPath, candidate.content);
        const sentinels = findScaffoldSentinels(candidate.content);
        const errors = [...schemaResult.errors, ...sentinels.map((path) => `${path} contains an unresolved scaffold sentinel`)];
        return { valid: errors.length === 0, type, schemaPath, errors };
    };
}
//# sourceMappingURL=validate-pipeline-document.js.map