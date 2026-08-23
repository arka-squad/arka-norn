/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { LEGACY_EXAMPLE_ID_ALIASES, normalizeLegacyDocument } from "../dist/application/compatibility/legacy-french-contract.js";

const root = resolve(import.meta.dirname, "..");
const fixtureRoot = resolve(root, "tests", "fixtures", "legacy", "fr", "examples");
const examplesRoot = resolve(root, "examples");
const canonicalEnumValues = readCanonicalEnumValues(resolve(root, "schemas"));

const exampleSets = [
  ["feature-complete", "feature-complete"],
  ["feature-essential", "feature-essential"],
  ["feature-fastdev", "feature-fastdev"],
  ["project-audit-v4", "project-audit-v5"],
];

rmSync(examplesRoot, { recursive: true, force: true });
mkdirSync(examplesRoot, { recursive: true });

for (const [sourceName, targetName] of exampleSets) {
  const sourceDirectory = resolve(fixtureRoot, sourceName);
  const targetDirectory = resolve(examplesRoot, targetName);
  mkdirSync(targetDirectory, { recursive: true });
  for (const entry of readdirSync(sourceDirectory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const source = JSON.parse(readFileSync(resolve(sourceDirectory, entry.name), "utf8"));
    const normalized = normalizeLegacyDocument(source);
    const canonical = englishExample(normalized, targetName);
    const outputName = canonicalFileName(entry.name, String(canonical.type));
    writeFileSync(resolve(targetDirectory, outputName), `${JSON.stringify(canonical, null, 2)}\n`, "utf8");
  }
}

function englishExample(source, exampleSet) {
  const document = { ...source };
  delete document.migration;
  const canonical = sanitizeRecord({ ...document, content_locale: "en" });
  if (exampleSet === "feature-complete" && canonical.type === "qa_review") canonical.overall_status = "pass";
  return canonical;
}

function sanitizeRecord(source) {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, sanitizeValue(key, value)]));
}

function sanitizeValue(key, value) {
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(key, item));
  if (value !== null && typeof value === "object") return sanitizeRecord(value);
  if (typeof value !== "string") return value;
  if (key === "id" && LEGACY_EXAMPLE_ID_ALIASES[value] !== undefined) return LEGACY_EXAMPLE_ID_ALIASES[value];
  if (preserveMachineValue(key, value)) return value;
  return `Documented ${key.replaceAll("_", " ")} for the canonical English example.`;
}

function preserveMachineValue(key, value) {
  if (canonicalEnumValues.has(value)) return true;
  if ((key === "id" || key.endsWith("_id") || key.endsWith("_ids")) && /^[A-Za-z0-9_.:-]+$/u.test(value)) return true;
  if ((key.startsWith("depends_") || key === "depends_on") && /^[A-Za-z0-9_.:-]+$/u.test(value)) return true;
  if ([
    "type", "schema_version", "content_locale", "created_at", "date", "sequence",
    "status", "overall_status", "verdict", "dimension", "severity", "priority",
    "kind", "level", "result", "outcome",
    "commit_sha", "commit", "test_type", "category", "state",
  ].includes(key)) return true;
  if (key.includes("file") || key.includes("path") || key.includes("command")) return true;
  return /^(?:https?:\/\/|[A-Za-z0-9_.-]+\.(?:ts|js|json|md|mjs|tsx)|[0-9a-f]{7,64}$)/u.test(value);
}

function readCanonicalEnumValues(directory) {
  const values = new Set();
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".schema.json")) continue;
    collectSchemaValues(JSON.parse(readFileSync(resolve(directory, entry.name), "utf8")), values);
  }
  return values;
}

function collectSchemaValues(value, target) {
  if (Array.isArray(value)) {
    for (const item of value) collectSchemaValues(item, target);
    return;
  }
  if (value === null || typeof value !== "object") return;
  if (typeof value.const === "string") target.add(value.const);
  if (Array.isArray(value.enum)) for (const item of value.enum) if (typeof item === "string") target.add(item);
  for (const nested of Object.values(value)) collectSchemaValues(nested, target);
}

function canonicalFileName(sourceName, type) {
  const prefix = sourceName.match(/^\d+/u)?.[0] ?? "01";
  return `${prefix}-${type.replaceAll("_", "-")}.json`;
}
