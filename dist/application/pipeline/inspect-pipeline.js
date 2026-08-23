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
import { evaluatePipeline } from "../../domain/pipeline/evaluate-pipeline.js";
import { canonicalDocumentType, canonicalEnumValue, compatibleFieldValue, isDocumentType, normalizeLegacyDocument, } from "../compatibility/legacy-french-contract.js";
export function inspectPipelineUseCaseFactory(deps) {
    return async (input) => {
        const candidates = await deps.source.list(input.featureRoot);
        const detectedContracts = new Set(candidates.flatMap((candidate) => {
            const version = candidate.content?.["schema_version"];
            return typeof version === "number" ? [version === 5 ? 5 : 3] : [];
        }));
        const contractVersion = input.documentContractVersion ?? (detectedContracts.has(3) ? 3 : 5);
        const definition = await deps.source.loadDefinition(input.pipelineId, contractVersion);
        const knownSchemas = new Map([
            ...definition.steps.map((step) => [step.id, step.schemaPath]),
            ...definition.transversalDocuments.map((document) => [document.type, document.schemaPath]),
        ]);
        const documents = [];
        const sourceErrors = [];
        for (const candidate of candidates) {
            if (candidate.content === undefined) {
                sourceErrors.push(...candidate.readErrors.map((error) => `${candidate.filePath}: ${error}`));
                continue;
            }
            const sourceType = stringField(candidate.content, "type");
            if (sourceType === undefined) {
                sourceErrors.push(`${candidate.filePath}: missing string field "type".`);
                continue;
            }
            const sourceContractVersion = candidate.content["schema_version"] === 5 ? 5 : 3;
            const type = contractVersion === 3 ? sourceType : canonicalDocumentType(sourceType);
            const content = contractVersion === 3 || candidate.content["schema_version"] === 5 ? candidate.content : normalizeLegacyDocument(candidate.content);
            const schemaPath = knownSchemas.get(type);
            if (schemaPath !== undefined && sourceContractVersion !== contractVersion) {
                sourceErrors.push(`${candidate.filePath}: mixed legacy and v5 document contracts are forbidden; run migrate for the whole Feature.`);
            }
            const validation = schemaPath === undefined
                ? { valid: false, errors: [`Unknown pipeline document type: ${type}.`] }
                : await deps.validator.validate(schemaPath, content);
            documents.push(toEvaluatedDocument(candidate.filePath, content, type, validation));
        }
        return evaluatePipeline({
            pipelineId: definition.pipelineId,
            featureRoot: input.featureRoot,
            ...(input.featureId !== undefined ? { featureId: input.featureId } : {}),
            steps: definition.steps,
            documents,
            sourceErrors,
            transversalDocumentTypes: definition.transversalDocuments.map((document) => document.type),
            ...(input.authorRegistry === undefined ? {} : { authorRegistry: input.authorRegistry }),
        });
    };
}
function toEvaluatedDocument(filePath, content, type, validation) {
    const id = stringField(content, "id");
    const featureId = stringField(content, "feature_id");
    const createdAt = stringField(content, "created_at") ?? stringField(content, "date");
    const sequence = numberField(content, "sequence");
    const crDevId = stringField(content, "development_report_id");
    const businessVerdict = isDocumentType(type, "qa_review") ? stringField(content, "overall_status")
        : isDocumentType(type, "development_report") ? stringField(content, "status")
            : isDocumentType(type, "delivery_audit") || isDocumentType(type, "delivery_validation") ? stringField(content, "verdict") : undefined;
    const dependencyDocumentIds = stringArrayField(content, "depends_on_document_ids");
    const findings = recordArrayField(content, "findings");
    const corrections = recordArrayField(content, "corrections_applied");
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
        ...(stringField(content, "author_agent_id") === undefined ? {} : { authorAgentId: stringField(content, "author_agent_id") }),
        ...(stringField(content, "exact_commit") === undefined ? {} : { exactCommit: stringField(content, "exact_commit") }),
        ...(findings === undefined ? {} : {
            findingCount: findings.length,
            openFindingCount: findings.filter((finding) => typeof finding["decision"] === "string" && canonicalEnumValue(finding["decision"]) === "fix").length,
        }),
        ...(corrections === undefined ? {} : { correctionCount: corrections.length }),
    };
}
function recordArrayField(content, field) {
    const value = compatibleFieldValue(content, field);
    return Array.isArray(value) && value.every((item) => typeof item === "object" && item !== null && !Array.isArray(item))
        ? value
        : undefined;
}
function stringArrayField(content, field) {
    const value = content[field];
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
}
function stringField(content, field) {
    const value = compatibleFieldValue(content, field);
    return typeof value === "string" ? value : undefined;
}
function numberField(content, field) {
    const value = content[field];
    return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}
//# sourceMappingURL=inspect-pipeline.js.map