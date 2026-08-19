import { findScaffoldSentinels } from "../../domain/pipeline/scaffold-schema.js";
import type { PipelineDocumentValidation } from "../../ports/inbound/for-pipeline.js";
import type { DocumentValidator } from "../../ports/outbound/document-validator.js";
import type { PipelineDocumentSource } from "../../ports/outbound/pipeline-document-source.js";

export function validatePipelineDocumentUseCaseFactory(deps: { readonly source: PipelineDocumentSource; readonly validator: DocumentValidator }) {
  return async (input: { readonly filePath: string }): Promise<PipelineDocumentValidation> => {
    const candidate = await deps.source.read(input.filePath);
    if (candidate.content === undefined) return { valid: false, errors: candidate.readErrors };
    const type = candidate.content["type"];
    if (typeof type !== "string") return { valid: false, errors: ['missing string field "type"'] };
    const definition = await deps.source.loadDefinition();
    const schemaPath = definition.steps.find((step) => step.id === type)?.schemaPath
      ?? definition.transversalDocuments.find((document) => document.type === type)?.schemaPath;
    if (schemaPath === undefined) return { valid: false, type, errors: [`unknown pipeline document type: ${type}`] };
    const schemaResult = await deps.validator.validate(schemaPath, candidate.content);
    const sentinels = findScaffoldSentinels(candidate.content);
    const errors = [...schemaResult.errors, ...sentinels.map((path) => `${path} contains an unresolved scaffold sentinel`)];
    return { valid: errors.length === 0, type, schemaPath, errors };
  };
}
