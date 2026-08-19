import * as fs from "node:fs/promises";
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
export class AjvDocumentValidator {
    ajv;
    cache = new Map();
    frameworkRoot;
    constructor(frameworkRoot) {
        this.frameworkRoot = frameworkRoot;
        this.ajv = new Ajv2020({ allErrors: true, strict: true });
        this.ajv.addFormat("date", { type: "string", validate: isDate });
        this.ajv.addFormat("date-time", { type: "string", validate: isDateTime });
    }
    async validate(schemaPath, content) {
        const validate = await this.validator(schemaPath);
        const valid = validate(content);
        return {
            valid,
            errors: valid ? [] : (validate.errors ?? []).map((error) => `${error.instancePath || "(root)"} ${error.message ?? "invalid"}`),
        };
    }
    async validator(schemaPath) {
        const cached = this.cache.get(schemaPath);
        if (cached !== undefined)
            return cached;
        const raw = await fs.readFile(resolve(this.frameworkRoot, schemaPath), "utf8");
        const schema = JSON.parse(raw);
        const validate = this.ajv.compile(schema);
        this.cache.set(schemaPath, validate);
        return validate;
    }
}
function isDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (match === null)
        return false;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
function isDateTime(value) {
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
}
//# sourceMappingURL=ajv-document-validator.js.map