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

import { isLegacyScaffoldSentinel, LEGACY_SCAFFOLD_SENTINELS } from "../compatibility/legacy-contract.js";

const SENTINEL_PATTERN = /^(TO_FILL|CHOOSE::)/;

export interface ScaffoldVocabulary {
  readonly fill: string;
  readonly choosePrefix: string;
}

const ENGLISH_VOCABULARY: ScaffoldVocabulary = { fill: "TO_FILL", choosePrefix: "CHOOSE::" };

export function scaffoldFromSchema(
  schema: Readonly<Record<string, unknown>>,
  fieldName = "document",
  vocabulary: ScaffoldVocabulary = ENGLISH_VOCABULARY,
): Readonly<Record<string, unknown>> {
  const value = scaffoldValue(schema, fieldName, schema, vocabulary);
  if (!isRecord(value)) throw new Error("Root scaffold schema must describe an object.");
  return value;
}

export function findScaffoldSentinels(value: unknown, path = ""): readonly string[] {
  if (typeof value === "string") return SENTINEL_PATTERN.test(value) || isLegacyScaffoldSentinel(value) ? [path || "(root)"] : [];
  if (Array.isArray(value)) return value.flatMap((item, index) => findScaffoldSentinels(item, `${path}[${index}]`));
  if (isRecord(value)) return Object.entries(value).flatMap(([key, item]) => findScaffoldSentinels(item, `${path}.${key}`));
  return [];
}

function scaffoldValue(schema: Readonly<Record<string, unknown>>, fieldName: string, root: Readonly<Record<string, unknown>>, vocabulary: ScaffoldVocabulary): unknown {
  if ("$ref" in schema) return scaffoldValue(resolveRef(schema["$ref"], root, fieldName), fieldName, root, vocabulary);
  if ("const" in schema) return schema["const"];
  if ("default" in schema) return localizeDefault(schema["default"], vocabulary);
  const choices = schema["enum"];
  if (Array.isArray(choices) && choices.length > 0) return `${vocabulary.choosePrefix}${choices.map(String).join("|")}`;
  const type = schema["type"];
  if (type === "string") return vocabulary.fill;
  if (type === "integer" || type === "number") return typeof schema["minimum"] === "number" ? schema["minimum"] : 0;
  if (type === "boolean") return false;
  if (type === "array") {
    const minItems = typeof schema["minItems"] === "number" ? schema["minItems"] : 0;
    if (minItems <= 0) return [];
    const items = schema["items"];
    if (!isRecord(items)) throw new Error(`Array items missing at ${fieldName}.`);
    return Array.from({ length: minItems }, (_, index) => scaffoldValue(items, `${fieldName}[${index}]`, root, vocabulary));
  }
  if (type === "object") {
    const properties = schema["properties"];
    if (!isRecord(properties)) throw new Error(`Object properties missing at ${fieldName}.`);
    const requiredValue = schema["required"];
    const required = Array.isArray(requiredValue) ? requiredValue : Object.keys(properties);
    if (!required.every((item) => typeof item === "string")) throw new Error(`Invalid required list at ${fieldName}.`);
    const output: Record<string, unknown> = {};
    for (const key of required) {
      const child = properties[key];
      if (!isRecord(child)) throw new Error(`Required property ${fieldName}.${key} has no schema.`);
      output[key] = scaffoldValue(child, `${fieldName}.${key}`, root, vocabulary);
    }
    return output;
  }
  throw new Error(`Unsupported schema type at ${fieldName}: ${String(type)}.`);
}

function localizeDefault(value: unknown, vocabulary: ScaffoldVocabulary): unknown {
  if (value === "TO_FILL" || value === LEGACY_SCAFFOLD_SENTINELS.fill) return vocabulary.fill;
  if (Array.isArray(value)) return value.map((item) => localizeDefault(item, vocabulary));
  if (isRecord(value)) return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, localizeDefault(item, vocabulary)]));
  return value;
}

function resolveRef(ref: unknown, root: Readonly<Record<string, unknown>>, fieldName: string): Readonly<Record<string, unknown>> {
  const remainder = typeof ref === "string" && ref.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : undefined;
  if (remainder === undefined || remainder.length === 0 || remainder.includes("/")) {
    throw new Error(`Cannot scaffold unresolved $ref at ${fieldName}: ${String(ref)}`);
  }
  const defs = root["$defs"];
  const name = remainder;
  const definition = isRecord(defs) ? defs[name] : undefined;
  if (!isRecord(definition)) throw new Error(`Cannot scaffold unresolved $ref at ${fieldName}: ${String(ref)}`);
  return definition;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
