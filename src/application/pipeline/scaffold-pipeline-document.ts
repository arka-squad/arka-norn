import { findScaffoldSentinels, scaffoldFromSchema } from "../../domain/pipeline/scaffold-schema.js";
import type { PipelineScaffoldResult } from "../../ports/inbound/for-pipeline.js";
import type { PipelineDocumentSource } from "../../ports/outbound/pipeline-document-source.js";

export function scaffoldPipelineDocumentUseCaseFactory(deps: { readonly source: PipelineDocumentSource }) {
  return async (input: { readonly stepId: string; readonly outputPath: string; readonly force?: boolean; readonly allowedRoot?: string }): Promise<PipelineScaffoldResult> => {
    const definition = await deps.source.loadDefinition();
    const schemaPath = definition.steps.find((step) => step.id === input.stepId)?.schemaPath
      ?? definition.transversalDocuments.find((document) => document.type === input.stepId)?.schemaPath;
    if (schemaPath === undefined) throw new Error(`Unknown pipeline step: ${input.stepId}.`);
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

function mergeObjectSchemas(
  envelope: Readonly<Record<string, unknown>>,
  document: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const envelopeProperties = recordField(envelope, "properties");
  const documentProperties = recordField(document, "properties");
  return {
    type: "object",
    required: [...stringArrayField(envelope, "required"), ...stringArrayField(document, "required")].filter((value, index, values) => values.indexOf(value) === index),
    properties: { ...envelopeProperties, ...documentProperties },
  };
}

function recordField(value: Readonly<Record<string, unknown>>, key: string): Readonly<Record<string, unknown>> {
  const field = value[key];
  return typeof field === "object" && field !== null && !Array.isArray(field) ? field as Readonly<Record<string, unknown>> : {};
}

function stringArrayField(value: Readonly<Record<string, unknown>>, key: string): readonly string[] {
  const field = value[key];
  return Array.isArray(field) && field.every((item) => typeof item === "string") ? field : [];
}
