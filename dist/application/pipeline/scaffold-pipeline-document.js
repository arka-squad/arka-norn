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
import { findScaffoldSentinels, scaffoldFromSchema } from "../../domain/pipeline/scaffold-schema.js";
import { AgentId } from "../../domain/agent/agent-id.js";
import { ProjectId } from "../../domain/project/project-id.js";
export function scaffoldPipelineDocumentUseCaseFactory(deps) {
    return async (input) => {
        const authorAgentId = AgentId.of(input.authorAgentId).value;
        if (input.projectId !== undefined && input.featureId !== undefined) {
            throw new Error("A scaffold cannot target both a Project and a Feature.");
        }
        if (input.projectId !== undefined && input.stepId !== "audit_etat_reel") {
            throw new Error("Project-scoped scaffolds are supported only for audit_etat_reel.");
        }
        const definition = await deps.source.loadDefinition(input.pipelineId);
        const schemaPath = definition.steps.find((step) => step.id === input.stepId)?.schemaPath
            ?? definition.transversalDocuments.find((document) => document.type === input.stepId)?.schemaPath;
        if (schemaPath === undefined)
            throw new Error(`Unknown pipeline step: ${input.stepId}.`);
        const [schema, envelope] = await Promise.all([
            deps.source.loadSchema(schemaPath),
            deps.source.loadSchema(input.projectId === undefined
                ? "schemas/document-envelope.schema.json"
                : "schemas/project-audit-envelope.schema.json"),
        ]);
        const generated = scaffoldFromSchema(mergeObjectSchemas(envelope, schema), input.stepId);
        const scaffold = {
            ...generated,
            schema_version: input.projectId === undefined ? 3 : 4,
            author_agent_id: authorAgentId,
            ...(input.featureId === undefined ? {} : { feature_id: input.featureId }),
            ...(input.projectId === undefined ? {} : { project_id: ProjectId.of(input.projectId).value }),
        };
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