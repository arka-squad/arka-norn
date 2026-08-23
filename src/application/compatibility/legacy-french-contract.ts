/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { createHash } from "node:crypto";

import {
  canonicalDocumentType,
  LEGACY_DOCUMENT_TYPES,
  LEGACY_ENUM_VALUES,
  LEGACY_FIELDS,
} from "../../domain/compatibility/legacy-contract.js";

export * from "../../domain/compatibility/legacy-contract.js";

export function normalizeLegacyDocument(source: Readonly<Record<string, unknown>>, options: {
  readonly migratedAt?: string;
  readonly sourceSha256?: string;
} = {}): Readonly<Record<string, unknown>> {
  const sourceVersion = typeof source["schema_version"] === "number" ? source["schema_version"] : 1;
  if (sourceVersion === 5) return source;
  const normalized = normalizeRecord(source);
  const sourceType = typeof source["type"] === "string" ? source["type"] : "unknown";
  return {
    ...normalized,
    schema_version: 5,
    content_locale: "fr",
    type: canonicalDocumentType(sourceType),
    migration: {
      source_schema_version: sourceVersion,
      source_document_type: sourceType,
      migrated_at: options.migratedAt ?? "1970-01-01T00:00:00.000Z",
      source_sha256: options.sourceSha256 ?? createHash("sha256").update(`${JSON.stringify(source)}\n`, "utf8").digest("hex"),
    },
  };
}

function normalizeRecord(source: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const target: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    const canonicalKey = LEGACY_FIELDS[key] ?? key;
    if (target[canonicalKey] !== undefined && JSON.stringify(target[canonicalKey]) !== JSON.stringify(normalizeValue(value))) {
      throw new Error(`Ambiguous legacy fields normalize to ${canonicalKey}.`);
    }
    target[canonicalKey] = normalizeValue(value);
  }
  return target;
}

function normalizeValue(value: unknown): unknown {
  if (typeof value === "string") return LEGACY_ENUM_VALUES[value] ?? LEGACY_DOCUMENT_TYPES[value] ?? value;
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (typeof value === "object" && value !== null) return normalizeRecord(value as Readonly<Record<string, unknown>>);
  return value;
}
