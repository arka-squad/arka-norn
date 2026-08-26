/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { homedir } from "node:os";
import { AjvDocumentValidator } from "../adapters/outbound/pipeline/ajv-document-validator.js";
import { FsPipelineDocumentSource } from "../adapters/outbound/pipeline/fs-pipeline-document-source.js";
import { FsAuditTrail } from "../adapters/outbound/filesystem/fs-audit-trail.js";
import { SystemClock } from "../adapters/outbound/system/system-clock.js";
import { inspectPipelineUseCaseFactory } from "../application/pipeline/inspect-pipeline.js";
import { scaffoldPipelineDocumentUseCaseFactory } from "../application/pipeline/scaffold-pipeline-document.js";
import { validatePipelineDocumentUseCaseFactory } from "../application/pipeline/validate-pipeline-document.js";
import { AuditUnavailableError } from "../domain/errors.js";
import { isPipelineCatalogV3, resolvePipelineEntry, workflowFrom } from "../domain/pipeline/pipeline-catalog.js";
export function createPipelineRuntime(frameworkRoot, options = {}) {
    const source = new FsPipelineDocumentSource(frameworkRoot);
    const validator = new AjvDocumentValidator(frameworkRoot);
    const audit = options.auditTrail ?? new FsAuditTrail(options.homeDir ?? process.env["ARKA_NORN_HOME"] ?? homedir());
    const clock = options.clock ?? new SystemClock();
    const scaffold = scaffoldPipelineDocumentUseCaseFactory({ source });
    return {
        inspect: inspectPipelineUseCaseFactory({
            source,
            validator,
        }),
        validate: validatePipelineDocumentUseCaseFactory({ source, validator }),
        scaffold: async (input) => auditedScaffold(audit, clock, input, scaffold),
        async listSteps(pipelineId, documentContractVersion) {
            const definition = await source.loadDefinition(pipelineId, documentContractVersion);
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
            const entry = resolvePipelineEntry(catalog, pipelineId);
            const definition = await source.loadDefinition(entry.id);
            return workflowFrom(entry, definition);
        },
        async defaultWorkflowId() {
            const catalog = await source.loadCatalog();
            return isPipelineCatalogV3(catalog) ? catalog.compatibilityFallbackPipelineId : catalog.defaultPipelineId;
        },
    };
}
async function auditedScaffold(audit, clock, input, scaffold) {
    const event = scaffoldEvent(input);
    await appendRequired(audit, { ...event, occurredAt: clock.now(), outcome: "intent" });
    try {
        const result = await scaffold(input);
        await appendRequired(audit, { ...event, occurredAt: clock.now(), outcome: "success" });
        return result;
    }
    catch (error) {
        await audit.append({
            ...event,
            occurredAt: clock.now(),
            outcome: "failure",
            details: { ...event.details, error: error instanceof Error ? error.message : String(error) },
        }).catch(() => undefined);
        throw error;
    }
}
function scaffoldEvent(input) {
    const entityType = input.projectId === undefined ? input.featureId === undefined ? "system" : "feature" : "project";
    const entityId = input.projectId ?? input.featureId;
    return {
        action: "pipeline.scaffold",
        entityType,
        ...(entityId === undefined ? {} : { entityId }),
        ...(input.allowedRoot === undefined ? {} : { root: input.allowedRoot }),
        details: {
            stepId: input.stepId,
            outputPath: input.outputPath,
            ...(input.pipelineId === undefined ? {} : { pipelineId: input.pipelineId }),
        },
    };
}
async function appendRequired(audit, event) {
    try {
        await audit.append(event);
    }
    catch (error) {
        throw new AuditUnavailableError(event.action, error instanceof Error ? error.message : String(error));
    }
}
//# sourceMappingURL=pipeline-runtime.js.map