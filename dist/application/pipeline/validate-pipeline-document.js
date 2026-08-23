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
        let schemaPath = schemaFor(definition, type);
        if (schemaPath === undefined && input.pipelineId === undefined) {
            const catalog = await deps.source.loadCatalog();
            for (const entry of catalog.pipelines) {
                const candidate = await deps.source.loadDefinition(entry.id);
                schemaPath = schemaFor(candidate, type);
                if (schemaPath !== undefined)
                    break;
            }
        }
        if (schemaPath === undefined)
            return { valid: false, type, errors: [`unknown pipeline document type: ${type}`] };
        const schemaResult = await deps.validator.validate(schemaPath, candidate.content);
        const sentinels = findScaffoldSentinels(candidate.content);
        const errors = [...schemaResult.errors, ...sentinels.map((path) => `${path} contains an unresolved scaffold sentinel`)];
        return { valid: errors.length === 0, type, schemaPath, errors };
    };
}
function schemaFor(definition, type) {
    return definition.steps.find((step) => step.id === type)?.schemaPath
        ?? definition.transversalDocuments.find((document) => document.type === type)?.schemaPath;
}
//# sourceMappingURL=validate-pipeline-document.js.map