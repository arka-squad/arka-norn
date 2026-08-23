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
import { resolve } from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
export class AjvDocumentValidator {
    canonicalAjv;
    legacyAjv;
    cache = new Map();
    frameworkRoot;
    envelopesLoaded = new Set();
    constructor(frameworkRoot) {
        this.frameworkRoot = frameworkRoot;
        this.canonicalAjv = createAjv();
        this.legacyAjv = createAjv();
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
        const contract = schemaPath.includes("/legacy/fr/") ? "legacy" : "canonical";
        const ajv = contract === "legacy" ? this.legacyAjv : this.canonicalAjv;
        await this.loadEnvelopes(contract, ajv);
        const raw = await fs.readFile(resolve(this.frameworkRoot, schemaPath), "utf8");
        const schema = JSON.parse(raw);
        const validate = ajv.compile(schema);
        this.cache.set(schemaPath, validate);
        return validate;
    }
    async loadEnvelopes(contract, ajv) {
        if (this.envelopesLoaded.has(contract))
            return;
        const base = contract === "legacy" ? resolve(this.frameworkRoot, "schemas", "legacy", "fr") : resolve(this.frameworkRoot, "schemas");
        const schemas = await Promise.all([
            fs.readFile(resolve(base, "document-envelope.schema.json"), "utf8"),
            fs.readFile(resolve(base, "project-audit-envelope.schema.json"), "utf8"),
        ]);
        for (const raw of schemas)
            ajv.addSchema(JSON.parse(raw));
        this.envelopesLoaded.add(contract);
    }
}
function createAjv() {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    ajv.addFormat("date", { type: "string", validate: isDate });
    ajv.addFormat("date-time", { type: "string", validate: isDateTime });
    return ajv;
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