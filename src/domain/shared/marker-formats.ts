import { DomainError } from "../errors.js";
import { isProjectOrchestrationMode, type ProjectOrchestrationMode } from "../project/project.js";

export const CURRENT_PROJECT_MARKER_SCHEMA_VERSION = 4 as const;
export const CURRENT_FEATURE_MARKER_SCHEMA_VERSION = 3 as const;
export const DEFAULT_PIPELINE_ID = "arka-norn-default";

export interface ProjectMarkerV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FeatureMarkerV2 {
  readonly schemaVersion: 2;
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly root: string;
  readonly pipelineId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectMarkerV3 {
  readonly schemaVersion: 3;
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectMarkerV4 {
  readonly schemaVersion: 4;
  readonly id: string;
  readonly name: string;
  readonly orchestrationMode: ProjectOrchestrationMode;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface FeatureMarkerV3 {
  readonly schemaVersion: 3;
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly pipelineId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MarkerMigrationPlan<T, FromVersion extends number = number, ToVersion extends number = number> {
  readonly kind: "project" | "feature";
  readonly fromVersion: FromVersion;
  readonly toVersion: ToVersion;
  readonly changed: boolean;
  readonly output: T;
  readonly warnings: readonly string[];
}

export type ProjectMarkerMigrationPlan = MarkerMigrationPlan<ProjectMarkerV4, 1 | 2 | 3 | 4, 4>;
export type FeatureMarkerMigrationPlan = MarkerMigrationPlan<FeatureMarkerV3, 1 | 2 | 3, 3>;

export function planProjectMarkerMigration(value: unknown): ProjectMarkerMigrationPlan {
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
  if (!isLegacyMarkerV1(value)) throw unsupportedMarker("Project", value);
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

export function planFeatureMarkerMigration(
  value: unknown,
  context: { readonly projectId?: string } = {},
): FeatureMarkerMigrationPlan {
  if (isFeatureMarkerV3(value)) {
    return unchanged("feature", CURRENT_FEATURE_MARKER_SCHEMA_VERSION, value);
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
  if (!isLegacyMarkerV1(value)) throw unsupportedMarker("Feature", value);
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
      pipelineId: DEFAULT_PIPELINE_ID,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    warnings: ["Legacy lastUsedAt is used for both createdAt and updatedAt.", "The owning projectId was supplied by migration context.", "The absolute v1 root was removed; runtime root is now derived from marker location."],
  };
}

export function isProjectMarkerV2(value: unknown): value is ProjectMarkerV2 {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  return hasCommonV2Fields(value) && hasOnlyKeys(value, ["schemaVersion", "id", "name", "root", "createdAt", "updatedAt"]);
}

export function isFeatureMarkerV2(value: unknown): value is FeatureMarkerV2 {
  if (!isRecord(value) || value.schemaVersion !== 2) return false;
  return (
    hasCommonV2Fields(value) &&
    isValidId(value.projectId) &&
    typeof value.pipelineId === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.pipelineId) &&
    hasOnlyKeys(value, ["schemaVersion", "id", "projectId", "name", "root", "pipelineId", "createdAt", "updatedAt"])
  );
}

export function isProjectMarkerV3(value: unknown): value is ProjectMarkerV3 {
  return isRecord(value)
    && value.schemaVersion === 3
    && hasCommonPortableFields(value)
    && hasOnlyKeys(value, ["schemaVersion", "id", "name", "createdAt", "updatedAt"]);
}

export function isProjectMarkerV4(value: unknown): value is ProjectMarkerV4 {
  return isRecord(value)
    && value.schemaVersion === CURRENT_PROJECT_MARKER_SCHEMA_VERSION
    && hasCommonPortableFields(value)
    && isProjectOrchestrationMode(value.orchestrationMode)
    && hasOnlyKeys(value, ["schemaVersion", "id", "name", "orchestrationMode", "createdAt", "updatedAt"]);
}

export function isFeatureMarkerV3(value: unknown): value is FeatureMarkerV3 {
  return isRecord(value)
    && value.schemaVersion === CURRENT_FEATURE_MARKER_SCHEMA_VERSION
    && hasCommonPortableFields(value)
    && isValidId(value.projectId)
    && typeof value.pipelineId === "string"
    && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(value.pipelineId)
    && hasOnlyKeys(value, ["schemaVersion", "id", "projectId", "name", "pipelineId", "createdAt", "updatedAt"]);
}

function unchanged<T, Version extends number>(kind: "project" | "feature", version: Version, output: T): MarkerMigrationPlan<T, Version, Version> {
  return { kind, fromVersion: version, toVersion: version, changed: false, output, warnings: [] };
}

function hasCommonV2Fields(value: Record<string, unknown>): boolean {
  return (
    isValidId(value.id) &&
    typeof value.name === "string" &&
    value.name.trim().length > 0 &&
    value.name.length <= 256 &&
    isAbsoluteRoot(value.root) &&
    isTimestamp(value.createdAt) &&
    isTimestamp(value.updatedAt)
  );
}

function hasCommonPortableFields(value: Record<string, unknown>): boolean {
  return isValidId(value.id)
    && typeof value.name === "string"
    && value.name.trim().length > 0
    && value.name.length <= 256
    && isTimestamp(value.createdAt)
    && isTimestamp(value.updatedAt);
}

function withoutProjectRoot(value: ProjectMarkerV2): ProjectMarkerV4 {
  return {
    schemaVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
    id: value.id,
    name: value.name,
    orchestrationMode: "manual",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function withManualProjectOrchestration(value: ProjectMarkerV3): ProjectMarkerV4 {
  return {
    schemaVersion: CURRENT_PROJECT_MARKER_SCHEMA_VERSION,
    id: value.id,
    name: value.name,
    orchestrationMode: "manual",
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function withoutFeatureRoot(value: FeatureMarkerV2): FeatureMarkerV3 {
  return {
    schemaVersion: CURRENT_FEATURE_MARKER_SCHEMA_VERSION,
    id: value.id,
    projectId: value.projectId,
    name: value.name,
    pipelineId: value.pipelineId,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

function isLegacyMarkerV1(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && value.version === 1 && hasOnlyKeys(value, ["version", "id", "name", "root", "lastUsedAt"]);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const expected = new Set(keys);
  return Object.keys(value).every((key) => expected.has(key)) && Object.keys(value).length === keys.length;
}

function requireId(value: unknown, field: string): string {
  if (!isValidId(value)) throw markerError(`${field} must be a valid kebab-case identifier.`);
  return value;
}

function requireName(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw markerError("name must contain between 1 and 256 characters.");
  }
  return value;
}

function requireAbsoluteRoot(value: unknown): string {
  if (!isAbsoluteRoot(value)) throw markerError("root must be an absolute POSIX or Windows path.");
  return value;
}

function requireTimestamp(value: unknown, field: string): string {
  if (!isTimestamp(value)) throw markerError(`${field} must be an ISO date-time.`);
  return value;
}

function isValidId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value);
}

function isAbsoluteRoot(value: unknown): value is string {
  return typeof value === "string" && (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value));
}

function isTimestamp(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(new Date(value).getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function markerError(message: string): DomainError {
  return new DomainError("INVALID_MARKER", message);
}

function unsupportedMarker(kind: "Project" | "Feature", value: unknown): DomainError {
  const currentVersion = kind === "Project" ? CURRENT_PROJECT_MARKER_SCHEMA_VERSION : CURRENT_FEATURE_MARKER_SCHEMA_VERSION;
  if (isRecord(value) && typeof value.schemaVersion === "number" && value.schemaVersion > currentVersion) {
    return new DomainError("UNSUPPORTED_SCHEMA_VERSION", `${kind} marker schemaVersion ${value.schemaVersion} is newer than supported version ${currentVersion}.`);
  }
  const supportedVersions = kind === "Project" ? "v1, v2, v3 or v4" : "v1, v2 or v3";
  return markerError(`${kind} marker is not a valid supported ${supportedVersions} marker.`);
}
