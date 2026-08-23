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
import { DomainError } from "../errors.js";
import { isProjectOrchestrationMode } from "../project/project.js";
import { canonicalPipelineId } from "../compatibility/legacy-contract.js";
export const CURRENT_PROJECT_MARKER_SCHEMA_VERSION = 4;
export const CURRENT_FEATURE_MARKER_SCHEMA_VERSION = 4;
export const DEFAULT_PIPELINE_ID = "arka-norn-default";
export function planProjectMarkerMigration(value) {
    if (isProjectMarkerV4(value)) {
        return unchanged("project", CURRENT_PROJECT_MARKER_SCHEMA_VERSION, value);
    }
    if (isProjectMarkerV3(value)) {
        return {
            kind: "project",
            fromVersion: 3,
            toVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
            changed: true,
            output: withManualProjectOrchestration(value),
            warnings: ["Orchestration mode was absent; defaulted to manual."],
        };
    }
    if (isProjectMarkerV2(value)) {
        return {
            kind: "project",
            fromVersion: 2,
            toVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
            changed: true,
            output: withoutProjectRoot(value),
            warnings: ["The absolute v2 root was removed; runtime root is now derived from marker location.", "Orchestration mode was absent; defaulted to manual."],
        };
    }
    if (!isLegacyMarkerV1(value))
        throw unsupportedMarker("Project", value);
    const timestamp = requireTimestamp(value.lastUsedAt, "lastUsedAt");
    requireAbsoluteRoot(value.root);
    return {
        kind: "project",
        fromVersion: 1,
        toVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
        changed: true,
        output: {
            schemaVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
            id: requireId(value.id, "id"),
            name: requireName(value.name),
            orchestrationMode: "manual",
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        warnings: ["Legacy lastUsedAt is used for both createdAt and updatedAt.", "The absolute v1 root was removed; runtime root is now derived from marker location.", "Orchestration mode was absent; defaulted to manual."],
    };
}
export function planFeatureMarkerMigration(value, context = {}) {
    if (isFeatureMarkerV4(value)) {
        return unchanged("feature", CURRENT_FEATURE_MARKER_SCHEMA_VERSION, value);
    }
    if (isFeatureMarkerV3(value)) {
        return {
            kind: "feature",
            fromVersion: 3,
            toVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
            changed: true,
            output: upgradeFeatureMarker(value),
            warnings: ["The pipeline identifier and document contract were upgraded to canonical v5."],
        };
    }
    if (isFeatureMarkerV2(value)) {
        return {
            kind: "feature",
            fromVersion: 2,
            toVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
            changed: true,
            output: withoutFeatureRoot(value),
            warnings: ["The absolute v2 root was removed; runtime root is now derived from marker location."],
        };
    }
    if (!isLegacyMarkerV1(value))
        throw unsupportedMarker("Feature", value);
    if (context.projectId === undefined) {
        throw new DomainError("MIGRATION_CONTEXT_REQUIRED", "Feature marker v1 migration requires an explicit projectId.");
    }
    const timestamp = requireTimestamp(value.lastUsedAt, "lastUsedAt");
    requireAbsoluteRoot(value.root);
    return {
        kind: "feature",
        fromVersion: 1,
        toVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
        changed: true,
        output: {
            schemaVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
            id: requireId(value.id, "id"),
            projectId: requireId(context.projectId, "projectId"),
            name: requireName(value.name),
            pipelineId: canonicalPipelineId(DEFAULT_PIPELINE_ID),
            documentContractVersion: 5,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        warnings: ["Legacy lastUsedAt is used for both createdAt and updatedAt.", "The owning projectId was supplied by migration context.", "The absolute v1 root was removed; runtime root is now derived from marker location."],
    };
}
export function isProjectMarkerV2(value) {
    if (!isRecord(value) || value.schemaVersion !== 2)
        return false;
    return hasCommonV2Fields(value) && hasOnlyKeys(value, ["schemaVersion", "id", "name", "root", "createdAt", "updatedAt"]);
}
export function isFeatureMarkerV2(value) {
    if (!isRecord(value) || value.schemaVersion !== 2)
        return false;
    return (hasCommonV2Fields(value) &&
        isValidId(value.projectId) &&
        typeof value.pipelineId === "string" &&
        /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.pipelineId) &&
        hasOnlyKeys(value, ["schemaVersion", "id", "projectId", "name", "root", "pipelineId", "createdAt", "updatedAt"]));
}
export function isProjectMarkerV3(value) {
    return isRecord(value)
        && value.schemaVersion === 3
        && hasCommonPortableFields(value)
        && hasOnlyKeys(value, ["schemaVersion", "id", "name", "createdAt", "updatedAt"]);
}
export function isProjectMarkerV4(value) {
    return isRecord(value)
        && value.schemaVersion === CURRENT_PROJECT_MARKER_SCHEMA_VERSION
        && hasCommonPortableFields(value)
        && isProjectOrchestrationMode(value.orchestrationMode)
        && hasOnlyKeys(value, ["schemaVersion", "id", "name", "orchestrationMode", "createdAt", "updatedAt"]);
}
export function isFeatureMarkerV3(value) {
    return isRecord(value)
        && value.schemaVersion === 3
        && hasCommonPortableFields(value)
        && isValidId(value.projectId)
        && typeof value.pipelineId === "string"
        && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.pipelineId)
        && hasOnlyKeys(value, ["schemaVersion", "id", "projectId", "name", "pipelineId", "createdAt", "updatedAt"]);
}
export function isFeatureMarkerV4(value) {
    return isRecord(value)
        && value.schemaVersion === CURRENT_FEATURE_MARKER_SCHEMA_VERSION
        && hasCommonPortableFields(value)
        && isValidId(value.projectId)
        && typeof value.pipelineId === "string"
        && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.pipelineId)
        && value.documentContractVersion === 5
        && hasOnlyKeys(value, ["schemaVersion", "id", "projectId", "name", "pipelineId", "documentContractVersion", "createdAt", "updatedAt"]);
}
function unchanged(kind, version, output) {
    return { kind, fromVersion: version, toVersion: version, changed: false, output, warnings: [] };
}
function hasCommonV2Fields(value) {
    return (isValidId(value.id) &&
        typeof value.name === "string" &&
        value.name.trim().length > 0 &&
        value.name.length <= 256 &&
        isAbsoluteRoot(value.root) &&
        isTimestamp(value.createdAt) &&
        isTimestamp(value.updatedAt));
}
function hasCommonPortableFields(value) {
    return isValidId(value.id)
        && typeof value.name === "string"
        && value.name.trim().length > 0
        && value.name.length <= 256
        && isTimestamp(value.createdAt)
        && isTimestamp(value.updatedAt);
}
function withoutProjectRoot(value) {
    return {
        schemaVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
        id: value.id,
        name: value.name,
        orchestrationMode: "manual",
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    };
}
function withManualProjectOrchestration(value) {
    return {
        schemaVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
        id: value.id,
        name: value.name,
        orchestrationMode: "manual",
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    };
}
function withoutFeatureRoot(value) {
    return {
        schemaVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
        id: value.id,
        projectId: value.projectId,
        name: value.name,
        pipelineId: canonicalPipelineId(value.pipelineId),
        documentContractVersion: 5,
        createdAt: value.createdAt,
        updatedAt: value.updatedAt,
    };
}
function upgradeFeatureMarker(value) {
    return {
        ...value,
        schemaVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
        pipelineId: canonicalPipelineId(value.pipelineId),
        documentContractVersion: 5,
    };
}
function isLegacyMarkerV1(value) {
    return isRecord(value) && value.version === 1 && hasOnlyKeys(value, ["version", "id", "name", "root", "lastUsedAt"]);
}
function hasOnlyKeys(value, keys) {
    const expected = new Set(keys);
    return Object.keys(value).every((key) => expected.has(key)) && Object.keys(value).length === keys.length;
}
function requireId(value, field) {
    if (!isValidId(value))
        throw markerError(`${field} must be a valid kebab-case identifier.`);
    return value;
}
function requireName(value) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
        throw markerError("name must contain between 1 and 256 characters.");
    }
    return value;
}
function requireAbsoluteRoot(value) {
    if (!isAbsoluteRoot(value))
        throw markerError("root must be an absolute POSIX or Windows path.");
    return value;
}
function requireTimestamp(value, field) {
    if (!isTimestamp(value))
        throw markerError(`${field} must be an ISO date-time.`);
    return value;
}
function isValidId(value) {
    return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}
function isAbsoluteRoot(value) {
    return typeof value === "string" && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value));
}
function isTimestamp(value) {
    return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function markerError(message) {
    return new DomainError("INVALID_MARKER", message);
}
function unsupportedMarker(kind, value) {
    const currentVersion = kind === "Project" ? CURRENT_PROJECT_MARKER_SCHEMA_VERSION : CURRENT_FEATURE_MARKER_SCHEMA_VERSION;
    if (isRecord(value) && typeof value.schemaVersion === "number" && value.schemaVersion > currentVersion) {
        return new DomainError("UNSUPPORTED_SCHEMA_VERSION", `${kind} marker schemaVersion ${value.schemaVersion} is newer than supported version ${currentVersion}.`);
    }
    const supportedVersions = kind === "Project" ? "v1, v2, v3 or v4" : "v1, v2, v3 or v4";
    return markerError(`${kind} marker is not a valid supported ${supportedVersions} marker.`);
}
//# sourceMappingURL=marker-formats.js.map