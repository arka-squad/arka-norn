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
import * as fs from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createPipelineCatalog, resolvePipelineEntry } from "../../../domain/pipeline/pipeline-catalog.js";
import { createPipelineDefinition } from "../../../domain/pipeline/pipeline-definition.js";
import { PathSecurityError } from "../../../domain/errors.js";
import { canonicalPipelineId } from "../../../domain/compatibility/legacy-contract.js";
import { DEFAULT_PIPELINE_ID } from "../../../domain/shared/marker-formats.js";
import { readRaw, writeFileAtomic } from "../filesystem/_shared/atomic-json.js";
import { FsPathPolicy } from "../filesystem/fs-path-policy.js";
const MAX_JSON_BYTES = 2 * 1024 * 1024;
export class FsPipelineDocumentSource {
    frameworkRoot;
    paths = new FsPathPolicy();
    constructor(frameworkRoot) {
        this.frameworkRoot = frameworkRoot;
    }
    async loadCatalog() {
        const content = await readJsonObject(resolve(this.frameworkRoot, "pipelines", "catalog.json"));
        if (content === undefined)
            throw new Error("pipelines/catalog.json must contain a JSON object.");
        const rawEntries = content["pipelines"];
        if (!Array.isArray(rawEntries))
            throw new Error("pipelines/catalog.json pipelines must be an array.");
        const version = requireCatalogVersion(content["schemaVersion"]);
        const entries = rawEntries.map((value, index) => parseCatalogEntry(value, index, version));
        if (version === 3) {
            return createPipelineCatalog({
                schemaVersion: 3,
                newFeatureEntry: requireEnum(content["newFeatureEntry"], "catalog.newFeatureEntry", ["framing_required"]),
                compatibilityFallbackPipelineId: requireString(content["compatibilityFallbackPipelineId"], "catalog.compatibilityFallbackPipelineId"),
                pipelines: entries,
            });
        }
        return createPipelineCatalog({
            schemaVersion: version,
            defaultPipelineId: requireString(content["defaultPipelineId"], "catalog.defaultPipelineId"),
            pipelines: entries,
        });
    }
    async loadDefinition(pipelineId, documentContractVersion = 5) {
        if (documentContractVersion === 3)
            return this.loadLegacyDefinition(pipelineId);
        const entry = resolvePipelineEntry(await this.loadCatalog(), pipelineId);
        const definitionPath = resolve(this.frameworkRoot, entry.definitionPath);
        const relation = relative(resolve(this.frameworkRoot), definitionPath);
        if (relation.startsWith("..") || isAbsolute(relation)) {
            throw new Error(`Pipeline definition escapes framework root: ${entry.definitionPath}.`);
        }
        const content = await readJsonObject(definitionPath);
        if (content === undefined)
            throw new Error(`${entry.definitionPath} must contain a JSON object.`);
        const rawSteps = content["steps"];
        if (!Array.isArray(rawSteps))
            throw new Error("pipeline.json steps must be an array.");
        const definition = createPipelineDefinition({
            schemaVersion: requirePositiveInteger(content["schemaVersion"], "pipeline.schemaVersion"),
            pipelineId: requireString(content["pipelineId"], "pipeline.pipelineId"),
            steps: rawSteps.map((value, index) => parseStep(value, index)),
            transversalDocuments: parseTransversalDocuments(content["transversal"]),
        });
        if (definition.pipelineId !== entry.id)
            throw new Error(`Pipeline catalog mismatch: ${entry.id} resolves to ${definition.pipelineId}.`);
        return definition;
    }
    async loadLegacyDefinition(pipelineId) {
        const canonicalId = canonicalPipelineId(pipelineId ?? DEFAULT_PIPELINE_ID);
        const name = canonicalId === "arka-norn-complete" ? "complete"
            : canonicalId === "arka-norn-essential" ? "essential"
                : canonicalId === "arka-norn-fastdev" ? "fastdev" : undefined;
        if (name === undefined)
            throw new Error(`Unknown legacy pipeline id: ${pipelineId}.`);
        const content = await readJsonObject(resolve(this.frameworkRoot, "pipelines", "legacy", "fr", `${name}.json`));
        if (content === undefined || !Array.isArray(content["steps"]))
            throw new Error(`Invalid legacy pipeline definition: ${name}.`);
        const definition = createPipelineDefinition({
            schemaVersion: requirePositiveInteger(content["schemaVersion"], "pipeline.schemaVersion"),
            pipelineId: requireString(content["pipelineId"], "pipeline.pipelineId"),
            steps: content["steps"].map((value, index) => withLegacySchema(parseStep(value, index))),
            transversalDocuments: parseTransversalDocuments(content["transversal"]).map(withLegacyTransversalSchema),
        });
        return definition;
    }
    async list(featureRoot) {
        const canonicalRoot = await this.paths.canonicalDirectory(featureRoot);
        const entries = await fs.readdir(canonicalRoot, { withFileTypes: true });
        const candidates = [];
        for (const entry of entries) {
            if (!entry.isFile() || !entry.name.endsWith(".json"))
                continue;
            const filePath = resolve(canonicalRoot, entry.name);
            candidates.push(await this.read(filePath));
        }
        return candidates.sort((left, right) => left.filePath.localeCompare(right.filePath));
    }
    async read(filePath) {
        try {
            const content = await readJsonObject(filePath);
            return content === undefined
                ? { filePath, readErrors: ["document must contain a JSON object"] }
                : { filePath, content, readErrors: [] };
        }
        catch (error) {
            return { filePath, readErrors: [error instanceof Error ? error.message : String(error)] };
        }
    }
    async loadSchema(schemaPath) {
        const schema = await readJsonObject(resolve(this.frameworkRoot, schemaPath));
        if (schema === undefined)
            throw new Error(`Schema ${schemaPath} must contain a JSON object.`);
        return schema;
    }
    async write(filePath, content, options = {}) {
        const safePath = await this.paths.assertWritableFile(resolve(filePath), options.allowedRoot ?? dirname(resolve(filePath)));
        if (safePath.split(/[\\/]/).some((segment) => segment.toLowerCase() === ".arka-norn")) {
            throw new PathSecurityError(safePath, "output cannot be written inside a reserved .arka-norn directory");
        }
        await writeFileAtomic(safePath, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o644, exclusive: options.force !== true });
    }
}
function withLegacySchema(step) {
    return { ...step, schemaPath: legacySchemaPath(step.schemaPath) };
}
function withLegacyTransversalSchema(document) {
    return { ...document, schemaPath: legacySchemaPath(document.schemaPath) };
}
function legacySchemaPath(path) {
    return path.startsWith("schemas/") ? `schemas/legacy/fr/${path.slice("schemas/".length)}` : path;
}
function parseTransversalDocuments(value) {
    if (value === undefined)
        return [];
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error("pipeline.transversal must be an object.");
    return Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(([type, definition]) => {
        if (typeof definition !== "object" || definition === null || Array.isArray(definition)) {
            throw new Error(`pipeline.transversal.${type} must be an object.`);
        }
        const fields = definition;
        return { type, schemaPath: requireString(fields["schema"], `pipeline.transversal.${type}.schema`) };
    });
}
async function readJsonObject(filePath) {
    const raw = await readRaw(filePath, MAX_JSON_BYTES);
    if (raw === undefined)
        throw new Error(`File not found: ${filePath}`);
    const value = JSON.parse(raw);
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : undefined;
}
function parseStep(value, index) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`pipeline.steps[${index}] must be an object.`);
    const step = value;
    const dependencies = step["dependsOn"] ?? step["depend_de"];
    if (!Array.isArray(dependencies) || !dependencies.every((item) => typeof item === "string")) {
        throw new Error(`pipeline.steps[${index}].dependsOn must be a string array.`);
    }
    const loopTo = step["loopTo"] ?? step["peut_boucler_vers"];
    return {
        id: requireString(step["id"], `pipeline.steps[${index}].id`),
        order: requirePositiveInteger(step["order"] ?? step["ordre"], `pipeline.steps[${index}].order`),
        schemaPath: requireString(step["schema"], `pipeline.steps[${index}].schema`),
        required: requireBoolean(step["required"] ?? step["obligatoire"], `pipeline.steps[${index}].required`),
        multiple: requireBoolean(step["multiple"], `pipeline.steps[${index}].multiple`),
        dependsOn: dependencies,
        decisionGate: parseDecisionGate(step["decisionGate"]),
        ...(typeof loopTo === "string" ? { loopTo } : {}),
        ...((step["businessPolicy"] ?? step["business_policy"]) === undefined ? {} : { businessPolicy: parseBusinessPolicy(step["businessPolicy"] ?? step["business_policy"], index) }),
    };
}
function parseDecisionGate(value) {
    return value === "continue" ? "continue" : "human_decision";
}
function parseCatalogEntry(value, index, version) {
    const entry = requireRecord(value, `catalog.pipelines[${index}]`);
    const aliases = entry["aliases"];
    if (!Array.isArray(aliases) || !aliases.every((alias) => typeof alias === "string")) {
        throw new Error(`catalog.pipelines[${index}].aliases must be a string array.`);
    }
    const id = requireString(entry["id"], `catalog.pipelines[${index}].id`);
    const generation = version === 3
        ? requireEnum(entry["generation"], `catalog.pipelines[${index}].generation`, ["2.3", "legacy"])
        : "legacy";
    const availability = version === 3
        ? requireEnum(entry["availability"], `catalog.pipelines[${index}].availability`, ["framing_calculated", "existing_only", "explicit_rework"])
        : legacyAvailability(id);
    return {
        id,
        aliases,
        name: requireString(entry["name"], `catalog.pipelines[${index}].name`),
        description: requireString(entry["description"], `catalog.pipelines[${index}].description`),
        definitionPath: requireString(entry["definition"], `catalog.pipelines[${index}].definition`),
        generation,
        availability,
    };
}
function legacyAvailability(id) {
    if (id === "arka-norn-fastdev")
        return "explicit_rework";
    return "existing_only";
}
function parseBusinessPolicy(value, index) {
    const policy = requireRecord(value, `pipeline.steps[${index}].businessPolicy`);
    const type = requireString(policy["type"], `pipeline.steps[${index}].businessPolicy.type`);
    if (type === "presence")
        return { type };
    if (type === "delivery") {
        return {
            type,
            verdictField: requireString(policy["verdictField"] ?? policy["verdict_field"], policyField(index, "verdictField")),
            passValues: requireStringArray(policy["passValues"] ?? policy["pass_values"], policyField(index, "passValues")),
            inProgressValues: requireStringArray(policy["inProgressValues"] ?? policy["in_progress_values"], policyField(index, "inProgressValues")),
        };
    }
    if (type === "audit_then_fix" || type === "review_latest") {
        const common = {
            targetStep: requireString(policy["targetStep"] ?? policy["target_step"], policyField(index, "targetStep")),
            targetDocumentField: requireString(policy["targetDocumentField"] ?? policy["target_document_field"], policyField(index, "targetDocumentField")),
            verdictField: requireString(policy["verdictField"] ?? policy["verdict_field"], policyField(index, "verdictField")),
            passValues: requireStringArray(policy["passValues"] ?? policy["pass_values"], policyField(index, "passValues")),
            failValues: requireStringArray(policy["failValues"] ?? policy["fail_values"], policyField(index, "failValues")),
            retryStep: requireString(policy["retryStep"] ?? policy["retry_step"], policyField(index, "retryStep")),
        };
        if (type === "review_latest") {
            return { ...common, type: "review_latest", inProgressValues: requireStringArray(policy["inProgressValues"] ?? policy["in_progress_values"], policyField(index, "inProgressValues")) };
        }
        return { ...common, type: "audit_then_fix" };
    }
    throw new Error(`Unsupported business policy type for pipeline.steps[${index}]: ${type}.`);
}
function policyField(index, field) {
    return `pipeline.steps[${index}].businessPolicy.${field}`;
}
function requireCatalogVersion(value) {
    const version = requirePositiveInteger(value, "catalog.schemaVersion");
    if (version !== 1 && version !== 2 && version !== 3)
        throw new Error(`Unsupported pipeline catalog schemaVersion: ${version}.`);
    return version;
}
function requireEnum(value, field, allowed) {
    const selected = requireString(value, field);
    if (!allowed.includes(selected))
        throw new Error(`${field} must be one of ${allowed.join(", ")}; got ${selected}.`);
    return selected;
}
function requireRecord(value, field) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        throw new Error(`${field} must be an object.`);
    return value;
}
function requireStringArray(value, field) {
    if (!Array.isArray(value) || value.length === 0 || !value.every((item) => typeof item === "string" && item.length > 0)) {
        throw new Error(`${field} must be a non-empty string array.`);
    }
    return value;
}
function requireString(value, field) {
    if (typeof value !== "string" || value.length === 0)
        throw new Error(`${field} must be a non-empty string.`);
    return value;
}
function requirePositiveInteger(value, field) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1)
        throw new Error(`${field} must be a positive integer.`);
    return value;
}
function requireBoolean(value, field) {
    if (typeof value !== "boolean")
        throw new Error(`${field} must be boolean.`);
    return value;
}
//# sourceMappingURL=fs-pipeline-document-source.js.map