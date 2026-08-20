import { AjvDocumentValidator } from "../adapters/outbound/pipeline/ajv-document-validator.js";
import { FsPipelineDocumentSource } from "../adapters/outbound/pipeline/fs-pipeline-document-source.js";
import { inspectPipelineUseCaseFactory } from "../application/pipeline/inspect-pipeline.js";
import { scaffoldPipelineDocumentUseCaseFactory } from "../application/pipeline/scaffold-pipeline-document.js";
import { validatePipelineDocumentUseCaseFactory } from "../application/pipeline/validate-pipeline-document.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import { workflowFrom } from "../domain/pipeline/pipeline-catalog.js";

export function createPipelineRuntime(frameworkRoot: string): ForPipeline {
  const source = new FsPipelineDocumentSource(frameworkRoot);
  const validator = new AjvDocumentValidator(frameworkRoot);
  return {
    inspect: inspectPipelineUseCaseFactory({
      source,
      validator,
    }),
    validate: validatePipelineDocumentUseCaseFactory({ source, validator }),
    scaffold: scaffoldPipelineDocumentUseCaseFactory({ source }),
    async listSteps(pipelineId) {
      const definition = await source.loadDefinition(pipelineId);
      return [
        ...definition.steps.map((step) => ({ id: step.id, required: step.required, transversal: false })),
        ...definition.transversalDocuments.map((document) => ({ id: document.type, required: false, transversal: true })),
      ];
    },
    async listWorkflows() {
      const catalog = await source.loadCatalog();
      return Promise.all(catalog.pipelines.map(async (entry) => workflowFrom(entry, await source.loadDefinition(entry.id))));
    },
    async showWorkflow(pipelineId) {
      const catalog = await source.loadCatalog();
      const definition = await source.loadDefinition(pipelineId);
      const entry = catalog.pipelines.find((candidate) => candidate.id === definition.pipelineId);
      if (entry === undefined) throw new Error(`Pipeline ${definition.pipelineId} is absent from the catalog.`);
      return workflowFrom(entry, definition);
    },
  };
}
