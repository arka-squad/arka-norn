import { findScaffoldSentinels, scaffoldFromSchema } from "../../domain/pipeline/scaffold-schema.js";
export function scaffoldPipelineDocumentUseCaseFactory(deps) {
    return async (input) => {
        const definition = await deps.source.loadDefinition();
        const schemaPath = definition.steps.find((step) => step.id === input.stepId)?.schemaPath
            ?? definition.transversalDocuments.find((document) => document.type === input.stepId)?.schemaPath;
        if (schemaPath === undefined)
            throw new Error(`Unknown pipeline step: ${input.stepId}.`);
        const [schema, envelope] = await Promise.all([
            deps.source.loadSchema(schemaPath),
            deps.source.loadSchema("schemas/document-envelope.schema.json"),
        ]);
        const scaffold = scaffoldFromSchema(mergeObjectSchemas(envelope, schema), input.stepId);
        await deps.source.write(input.outputPath, scaffold, {
            ...(input.force === undefined ? {} : { force: input.force }),
            ...(input.allowedRoot === undefined ? {} : { allowedRoot: input.allowedRoot }),
        });
        return { stepId: input.stepId, outputPath: input.outputPath, sentinelPaths: findScaffoldSentinels(scaffold) };
    };
}
function mergeObjectSchemas(envelope, document) {
    const envelopeProperties = recordField(envelope, "properties");
    const documentProperties = recordField(document, "properties");
    return {
        type: "object",
        required: [...stringArrayField(envelope, "required"), ...stringArrayField(document, "required")].filter((value, index, values) => values.indexOf(value) === index),
        properties: { ...envelopeProperties, ...documentProperties },
    };
}
function recordField(value, key) {
    const field = value[key];
    return typeof field === "object" && field !== null && !Array.isArray(field) ? field : {};
}
function stringArrayField(value, key) {
    const field = value[key];
    return Array.isArray(field) && field.every((item) => typeof item === "string") ? field : [];
}
//# sourceMappingURL=scaffold-pipeline-document.js.map