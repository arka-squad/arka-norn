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
const SENTINEL_PATTERN = /^(À_REMPLIR|À_CHOISIR::)/;
export function scaffoldFromSchema(schema, fieldName = "document") {
    const value = scaffoldValue(schema, fieldName);
    if (!isRecord(value))
        throw new Error("Root scaffold schema must describe an object.");
    return value;
}
export function findScaffoldSentinels(value, path = "") {
    if (typeof value === "string")
        return SENTINEL_PATTERN.test(value) ? [path || "(root)"] : [];
    if (Array.isArray(value))
        return value.flatMap((item, index) => findScaffoldSentinels(item, `${path}[${index}]`));
    if (isRecord(value))
        return Object.entries(value).flatMap(([key, item]) => findScaffoldSentinels(item, `${path}.${key}`));
    return [];
}
function scaffoldValue(schema, fieldName) {
    if ("$ref" in schema)
        throw new Error(`Cannot scaffold unresolved $ref at ${fieldName}.`);
    if ("const" in schema)
        return schema["const"];
    if ("default" in schema)
        return schema["default"];
    const choices = schema["enum"];
    if (Array.isArray(choices) && choices.length > 0)
        return `À_CHOISIR::${choices.map(String).join("|")}`;
    const type = schema["type"];
    if (type === "string")
        return "À_REMPLIR";
    if (type === "integer" || type === "number")
        return typeof schema["minimum"] === "number" ? schema["minimum"] : 0;
    if (type === "boolean")
        return false;
    if (type === "array") {
        const minItems = typeof schema["minItems"] === "number" ? schema["minItems"] : 0;
        const items = schema["items"];
        if (minItems <= 0)
            return [];
        if (!isRecord(items))
            throw new Error(`Array items missing at ${fieldName}.`);
        return Array.from({ length: minItems }, (_, index) => scaffoldValue(items, `${fieldName}[${index}]`));
    }
    if (type === "object") {
        const properties = schema["properties"];
        if (!isRecord(properties))
            throw new Error(`Object properties missing at ${fieldName}.`);
        const requiredValue = schema["required"];
        const required = Array.isArray(requiredValue) ? requiredValue : Object.keys(properties);
        if (!required.every((item) => typeof item === "string"))
            throw new Error(`Invalid required list at ${fieldName}.`);
        const output = {};
        for (const key of required) {
            const child = properties[key];
            if (!isRecord(child))
                throw new Error(`Required property ${fieldName}.${key} has no schema.`);
            output[key] = scaffoldValue(child, `${fieldName}.${key}`);
        }
        return output;
    }
    throw new Error(`Unsupported schema type at ${fieldName}: ${String(type)}.`);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=scaffold-schema.js.map