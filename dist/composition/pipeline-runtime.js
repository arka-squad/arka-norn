import { AjvDocumentValidator } from "../adapters/outbound/pipeline/ajv-document-validator.js";
import { FsPipelineDocumentSource } from "../adapters/outbound/pipeline/fs-pipeline-document-source.js";
import { inspectPipelineUseCaseFactory } from "../application/pipeline/inspect-pipeline.js";
import { scaffoldPipelineDocumentUseCaseFactory } from "../application/pipeline/scaffold-pipeline-document.js";
import { validatePipelineDocumentUseCaseFactory } from "../application/pipeline/validate-pipeline-document.js";
export function createPipelineRuntime(frameworkRoot) {
    const source = new FsPipelineDocumentSource(frameworkRoot);
    const validator = new AjvDocumentValidator(frameworkRoot);
    return {
        inspect: inspectPipelineUseCaseFactory({
            source,
            validator,
        }),
        validate: validatePipelineDocumentUseCaseFactory({ source, validator }),
        scaffold: scaffoldPipelineDocumentUseCaseFactory({ source }),
        async listSteps() {
            const definition = await source.loadDefinition();
            return [
                ...definition.steps.map((step) => ({ id: step.id, required: step.required, transversal: false })),
                ...definition.transversalDocuments.map((document) => ({ id: document.type, required: false, transversal: true })),
            ];
        },
    };
}
//# sourceMappingURL=pipeline-runtime.js.map