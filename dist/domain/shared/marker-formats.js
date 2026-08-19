import { DomainError } from "../errors.js";
export const CURRENT_MARKER_SCHEMA_VERSION = 2;
export const DEFAULT_PIPELINE_ID = "arka-norn-default";
export function planProjectMarkerMigration(value) {
    if (isProjectMarkerV2(value)) {
        return unchanged("project", value);
    }
    if (!isLegacyMarkerV1(value)) {
        throw markerError("Project marker is neither a supported v1 marker nor a valid v2 marker.");
    }
    const timestamp = requireTimestamp(value.lastUsedAt, "lastUsedAt");
    return {
        kind: "project",
        fromVersion: 1,
        toVersion: CURRENT_MARKER_SCHEMA_VERSION,
        changed: true,
        output: {
            schemaVersion: CURRENT_MARKER_SCHEMA_VERSION,
            id: requireId(value.id, "id"),
            name: requireName(value.name),
            root: requireAbsoluteRoot(value.root),
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        warnings: ["Legacy lastUsedAt is used for both createdAt and updatedAt."],
    };
}
export function planFeatureMarkerMigration(value, context = {}) {
    if (isFeatureMarkerV2(value)) {
        return unchanged("feature", value);
    }
    if (!isLegacyMarkerV1(value)) {
        throw markerError("Feature marker is neither a supported v1 marker nor a valid v2 marker.");
    }
    if (context.projectId === undefined) {
        throw new DomainError("MIGRATION_CONTEXT_REQUIRED", "Feature marker v1 migration requires an explicit projectId.");
    }
    const timestamp = requireTimestamp(value.lastUsedAt, "lastUsedAt");
    return {
        kind: "feature",
        fromVersion: 1,
        toVersion: CURRENT_MARKER_SCHEMA_VERSION,
        changed: true,
        output: {
            schemaVersion: CURRENT_MARKER_SCHEMA_VERSION,
            id: requireId(value.id, "id"),
            projectId: requireId(context.projectId, "projectId"),
            name: requireName(value.name),
            root: requireAbsoluteRoot(value.root),
            pipelineId: DEFAULT_PIPELINE_ID,
            createdAt: timestamp,
            updatedAt: timestamp,
        },
        warnings: ["Legacy lastUsedAt is used for both createdAt and updatedAt.", "The owning projectId was supplied by migration context."],
    };
}
export function isProjectMarkerV2(value) {
    if (!isRecord(value) || value.schemaVersion !== CURRENT_MARKER_SCHEMA_VERSION)
        return false;
    return hasCommonV2Fields(value) && hasOnlyKeys(value, ["schemaVersion", "id", "name", "root", "createdAt", "updatedAt"]);
}
export function isFeatureMarkerV2(value) {
    if (!isRecord(value) || value.schemaVersion !== CURRENT_MARKER_SCHEMA_VERSION)
        return false;
    return (hasCommonV2Fields(value) &&
        isValidId(value.projectId) &&
        typeof value.pipelineId === "string" &&
        /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.pipelineId) &&
        hasOnlyKeys(value, ["schemaVersion", "id", "projectId", "name", "root", "pipelineId", "createdAt", "updatedAt"]));
}
function unchanged(kind, output) {
    return { kind, fromVersion: 2, toVersion: 2, changed: false, output, warnings: [] };
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
//# sourceMappingURL=marker-formats.js.map