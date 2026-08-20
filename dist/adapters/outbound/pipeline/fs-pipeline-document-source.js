import * as fs from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { createPipelineCatalog, resolvePipelineEntry } from "../../../domain/pipeline/pipeline-catalog.js";
import { createPipelineDefinition } from "../../../domain/pipeline/pipeline-definition.js";
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
        return createPipelineCatalog({
            schemaVersion: requirePositiveInteger(content["schemaVersion"], "catalog.schemaVersion"),
            defaultPipelineId: requireString(content["defaultPipelineId"], "catalog.defaultPipelineId"),
            pipelines: rawEntries.map((value, index) => parseCatalogEntry(value, index)),
        });
    }
    async loadDefinition(pipelineId) {
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
        await writeFileAtomic(safePath, `${JSON.stringify(content, null, 2)}\n`, { mode: 0o644, exclusive: options.force !== true });
    }
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
    const dependencies = step["depend_de"];
    if (!Array.isArray(dependencies) || !dependencies.every((item) => typeof item === "string")) {
        throw new Error(`pipeline.steps[${index}].depend_de must be a string array.`);
    }
    const loopTo = step["peut_boucler_vers"];
    return {
        id: requireString(step["id"], `pipeline.steps[${index}].id`),
        order: requirePositiveInteger(step["ordre"], `pipeline.steps[${index}].ordre`),
        schemaPath: requireString(step["schema"], `pipeline.steps[${index}].schema`),
        required: requireBoolean(step["obligatoire"], `pipeline.steps[${index}].obligatoire`),
        multiple: requireBoolean(step["multiple"], `pipeline.steps[${index}].multiple`),
        dependsOn: dependencies,
        ...(typeof loopTo === "string" ? { loopTo } : {}),
        ...(step["business_policy"] === undefined ? {} : { businessPolicy: parseBusinessPolicy(step["business_policy"], index) }),
    };
}
function parseCatalogEntry(value, index) {
    const entry = requireRecord(value, `catalog.pipelines[${index}]`);
    const aliases = entry["aliases"];
    if (!Array.isArray(aliases) || !aliases.every((alias) => typeof alias === "string")) {
        throw new Error(`catalog.pipelines[${index}].aliases must be a string array.`);
    }
    return {
        id: requireString(entry["id"], `catalog.pipelines[${index}].id`),
        aliases,
        name: requireString(entry["name"], `catalog.pipelines[${index}].name`),
        description: requireString(entry["description"], `catalog.pipelines[${index}].description`),
        definitionPath: requireString(entry["definition"], `catalog.pipelines[${index}].definition`),
    };
}
function parseBusinessPolicy(value, index) {
    const policy = requireRecord(value, `pipeline.steps[${index}].business_policy`);
    const type = requireString(policy["type"], `pipeline.steps[${index}].business_policy.type`);
    if (type === "presence")
        return { type };
    if (type === "delivery") {
        return {
            type,
            verdictField: requireString(policy["verdict_field"], policyField(index, "verdict_field")),
            passValues: requireStringArray(policy["pass_values"], policyField(index, "pass_values")),
            inProgressValues: requireStringArray(policy["in_progress_values"], policyField(index, "in_progress_values")),
        };
    }
    if (type === "audit_then_fix" || type === "review_latest") {
        const common = {
            targetStep: requireString(policy["target_step"], policyField(index, "target_step")),
            targetDocumentField: requireString(policy["target_document_field"], policyField(index, "target_document_field")),
            verdictField: requireString(policy["verdict_field"], policyField(index, "verdict_field")),
            passValues: requireStringArray(policy["pass_values"], policyField(index, "pass_values")),
            failValues: requireStringArray(policy["fail_values"], policyField(index, "fail_values")),
            retryStep: requireString(policy["retry_step"], policyField(index, "retry_step")),
        };
        if (type === "review_latest") {
            return { ...common, type: "review_latest", inProgressValues: requireStringArray(policy["in_progress_values"], policyField(index, "in_progress_values")) };
        }
        return { ...common, type: "audit_then_fix" };
    }
    throw new Error(`Unsupported business policy type for pipeline.steps[${index}]: ${type}.`);
}
function policyField(index, field) {
    return `pipeline.steps[${index}].business_policy.${field}`;
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