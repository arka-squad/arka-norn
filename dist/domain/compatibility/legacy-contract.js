/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import legacy from "./legacy-fr-contract.json" with { type: "json" };
export const LEGACY_PIPELINE_IDS = legacy.pipelineIds;
export const LEGACY_DOCUMENT_TYPES = legacy.documentTypes;
export const LEGACY_FIELDS = legacy.fields;
export const LEGACY_ENUM_VALUES = legacy.enumValues;
export const LEGACY_SCAFFOLD_SENTINELS = legacy.scaffoldSentinels;
export const LEGACY_EXAMPLE_ID_ALIASES = legacy.exampleIdAliases;
export function canonicalPipelineId(value) {
    return LEGACY_PIPELINE_IDS[value] ?? value;
}
export function canonicalDocumentType(value) {
    return LEGACY_DOCUMENT_TYPES[value] ?? value;
}
export function documentTypeCandidates(canonicalType) {
    return [...new Set([canonicalType, ...Object.entries(LEGACY_DOCUMENT_TYPES)
                .filter(([, target]) => target === canonicalType)
                .map(([source]) => source)])];
}
export function isDocumentType(value, canonicalType) {
    return canonicalDocumentType(value) === canonicalType;
}
export function canonicalEnumValue(value) {
    return LEGACY_ENUM_VALUES[value] ?? value;
}
export function compatibleFieldValue(content, canonicalField) {
    if (canonicalField in content)
        return content[canonicalField];
    const legacyField = Object.entries(LEGACY_FIELDS).find(([, target]) => target === canonicalField)?.[0];
    return legacyField === undefined ? undefined : content[legacyField];
}
export function isLegacyScaffoldSentinel(value) {
    return value === LEGACY_SCAFFOLD_SENTINELS.fill
        || value.startsWith(LEGACY_SCAFFOLD_SENTINELS.choosePrefix);
}
//# sourceMappingURL=legacy-contract.js.map