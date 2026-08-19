import { findScaffoldSentinels, scaffoldFromSchema } from "../../domain/pipeline/scaffold-schema.js";
import type { PipelineScaffoldResult } from "../../ports/inbound/for-pipeline.js";
import type { PipelineDocumentSource } from "../../ports/outbound/pipeline-document-source.js";

export function scaffoldPipelineDocumentUseCaseFactory(deps: { readonly source: PipelineDocumentSource }) {
  return async (input: { readonly stepId: string; readonly outputPath: string; readonly force?: boolean; readonly allowedRoot?: string }): Promise<PipelineScaffoldResult> => {
    const definition = await deps.source.loadDefinition();
    const schemaPath = definition.steps.find((step) => step.id === input.stepId)?.schemaPath
      ?? definition.transversalDocuments.find((document) => document.type === input.stepId)?.schemaPath;
    if (schemaPath === undefined) throw new Error(`Unknown pipeline step: ${input.stepId}.`);
    const schema = await deps.source.loadSchema(schemaPath);
    const scaffold = scaffoldFromSchema(schema, input.stepId);
    await deps.source.write(input.outputPath, scaffold, {
      ...(input.force === undefined ? {} : { force: input.force }),
      ...(input.allowedRoot === undefined ? {} : { allowedRoot: input.allowedRoot }),
    });
    return { stepId: input.stepId, outputPath: input.outputPath, sentinelPaths: findScaffoldSentinels(scaffold) };
  };
}
