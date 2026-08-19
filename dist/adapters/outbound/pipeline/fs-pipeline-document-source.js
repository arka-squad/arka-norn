import * as fs from "node:fs/promises";
import { dirname, resolve } from "node:path";
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
    async loadDefinition() {
        const content = await readJsonObject(resolve(this.frameworkRoot, "pipeline.json"));
        if (content === undefined)
            throw new Error("pipeline.json must contain a JSON object.");
        const rawSteps = content["steps"];
        if (!Array.isArray(rawSteps))
            throw new Error("pipeline.json steps must be an array.");
        return createPipelineDefinition({
            schemaVersion: requirePositiveInteger(content["schemaVersion"], "pipeline.schemaVersion"),
            pipelineId: requireString(content["pipelineId"], "pipeline.pipelineId"),
            steps: rawSteps.map((value, index) => parseStep(value, index)),
            transversalDocuments: parseTransversalDocuments(content["transversal"]),
        });
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
    };
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