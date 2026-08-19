import { evaluatePipeline } from "../../domain/pipeline/evaluate-pipeline.js";
import type { EvaluatedDocument, PipelineReport } from "../../domain/pipeline/pipeline-report.js";
import type { ForPipeline, InspectPipelineInput } from "../../ports/inbound/for-pipeline.js";
import type { DocumentValidator } from "../../ports/outbound/document-validator.js";
import type { PipelineDocumentSource } from "../../ports/outbound/pipeline-document-source.js";

export interface InspectPipelineDeps {
  readonly source: PipelineDocumentSource;
  readonly validator: DocumentValidator;
}

export function inspectPipelineUseCaseFactory(deps: InspectPipelineDeps): ForPipeline["inspect"] {
  return async (input: InspectPipelineInput): Promise<PipelineReport> => {
    const definition = await deps.source.loadDefinition();
    const candidates = await deps.source.list(input.featureRoot);
    const knownSchemas = new Map([
      ...definition.steps.map((step) => [step.id, step.schemaPath] as const),
      ...definition.transversalDocuments.map((document) => [document.type, document.schemaPath] as const),
    ]);
    const documents: EvaluatedDocument[] = [];
    const sourceErrors: string[] = [];

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
      const schemaPath = knownSchemas.get(type);
      const validation = schemaPath === undefined
        ? { valid: false, errors: [`Unknown pipeline document type: ${type}.`] as readonly string[] }
        : await deps.validator.validate(schemaPath, candidate.content);
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

function toEvaluatedDocument(
  filePath: string,
  content: Readonly<Record<string, unknown>>,
  type: string,
  validation: { readonly valid: boolean; readonly errors: readonly string[] },
): EvaluatedDocument {
  const id = stringField(content, "id");
  const featureId = stringField(content, "feature_id");
  const createdAt = stringField(content, "created_at") ?? stringField(content, "date");
  const sequence = numberField(content, "sequence");
  const crDevId = stringField(content, "cr_dev_id");
  const businessVerdict = type === "recette_qa" ? stringField(content, "statut_global") : type === "cr_dev" ? stringField(content, "statut") : undefined;
  const dependencyDocumentIds = stringArrayField(content, "depends_on_document_ids");
  return {
    filePath,
    type,
    valid: validation.valid,
    errors: validation.errors,
    dependencyDocumentIds,
    content,
    ...(id !== undefined ? { id } : {}),
    ...(featureId !== undefined ? { featureId } : {}),
    ...(createdAt !== undefined ? { createdAt } : {}),
    ...(sequence !== undefined ? { sequence } : {}),
    ...(crDevId !== undefined ? { crDevId } : {}),
    ...(businessVerdict !== undefined ? { businessVerdict } : {}),
  };
}

function stringArrayField(content: Readonly<Record<string, unknown>>, field: string): readonly string[] {
  const value = content[field];
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}

function stringField(content: Readonly<Record<string, unknown>>, field: string): string | undefined {
  const value = content[field];
  return typeof value === "string" ? value : undefined;
}

function numberField(content: Readonly<Record<string, unknown>>, field: string): number | undefined {
  const value = content[field];
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
