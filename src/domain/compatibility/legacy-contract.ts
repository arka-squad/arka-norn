/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import legacy from "./legacy-fr-contract.json" with { type: "json" };

export type LegacyStringMap = Readonly<Record<string, string>>;

export const LEGACY_PIPELINE_IDS: LegacyStringMap = legacy.pipelineIds;
export const LEGACY_DOCUMENT_TYPES: LegacyStringMap = legacy.documentTypes;
export const LEGACY_FIELDS: LegacyStringMap = legacy.fields;
export const LEGACY_ENUM_VALUES: LegacyStringMap = legacy.enumValues;
export const LEGACY_SCAFFOLD_SENTINELS = legacy.scaffoldSentinels;
export const LEGACY_EXAMPLE_ID_ALIASES: LegacyStringMap = legacy.exampleIdAliases;

export function canonicalPipelineId(value: string): string {
  return LEGACY_PIPELINE_IDS[value] ?? value;
}

export function canonicalDocumentType(value: string): string {
  return LEGACY_DOCUMENT_TYPES[value] ?? value;
}

export function documentTypeCandidates(canonicalType: string): readonly string[] {
  return [...new Set([canonicalType, ...Object.entries(LEGACY_DOCUMENT_TYPES)
    .filter(([, target]) => target === canonicalType)
    .map(([source]) => source)])];
}

export function isDocumentType(value: string, canonicalType: string): boolean {
  return canonicalDocumentType(value) === canonicalType;
}

export function canonicalEnumValue(value: string): string {
  return LEGACY_ENUM_VALUES[value] ?? value;
}

export function compatibleFieldValue(content: Readonly<Record<string, unknown>>, canonicalField: string): unknown {
  if (canonicalField in content) return content[canonicalField];
  const legacyField = Object.entries(LEGACY_FIELDS).find(([, target]) => target === canonicalField)?.[0];
  return legacyField === undefined ? undefined : content[legacyField];
}

export function isLegacyScaffoldSentinel(value: string): boolean {
  return value === LEGACY_SCAFFOLD_SENTINELS.fill
    || value.startsWith(LEGACY_SCAFFOLD_SENTINELS.choosePrefix);
}
