import { FeatureId } from "../feature/feature-id.js";
import { ProjectId } from "../project/project-id.js";

import { InvalidMissionOrderError, MissionPreconditionError } from "./errors.js";
import {
  isExecutionCapability,
  isExecutionPermission,
  type ExecutionCapability,
  type ExecutionPermission,
} from "./types.js";

const MISSION_ID_PATTERN = /^[a-z][a-z0-9-]{0,95}$/;
const PIPELINE_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const STEP_ID_PATTERN = /^[a-z0-9][a-z0-9_]{0,127}$/;
const SECRET_LIKE_PATTERN = /(?:api[_ -]?key|access[_ -]?token|token|auth(?:orization)?|password|secret)\s*[:=]|\bBearer\s+[a-z0-9._-]{12,}\b|\bsk-[a-z0-9_-]{12,}\b|\bAKIA[0-9A-Z]{16}\b/i;

export interface MissionScope {
  readonly projectId: ProjectId;
  readonly featureId?: FeatureId;
  readonly paths: readonly string[];
}

export interface MissionPipelinePreconditions {
  readonly pipelineId: string;
  readonly nextStepId: string;
}

export interface MissionOrderProps {
  readonly id: string;
  readonly scope: MissionScope;
  readonly preconditions: MissionPipelinePreconditions;
  readonly requiredCapabilities: readonly ExecutionCapability[];
  readonly requiredPermissions: readonly ExecutionPermission[];
  readonly summary: string;
  readonly issuedAt: Date;
}

export interface MissionOrderContext {
  readonly scope: MissionScope;
  readonly pipelineId: string;
  readonly nextStepId: string;
}

export interface MissionPreconditionCheck {
  readonly current: boolean;
  readonly reasons: readonly string[];
}

/**
 * A worker-facing order. The control plane creates it from a fresh Pipeline
 * evaluation; it cannot be edited in-place once stored in an execution.
 */
export class MissionOrder {
  public readonly id: string;
  public readonly scope: MissionScope;
  public readonly preconditions: MissionPipelinePreconditions;
  public readonly requiredCapabilities: readonly ExecutionCapability[];
  public readonly requiredPermissions: readonly ExecutionPermission[];
  public readonly summary: string;
  private readonly issuedAtValue: Date;

  private constructor(props: MissionOrderProps) {
    this.id = props.id;
    this.scope = freezeScope(props.scope);
    this.preconditions = Object.freeze({ ...props.preconditions });
    this.requiredCapabilities = Object.freeze([...props.requiredCapabilities]);
    this.requiredPermissions = Object.freeze([...props.requiredPermissions]);
    this.summary = props.summary;
    this.issuedAtValue = new Date(props.issuedAt.getTime());
  }

  public static create(props: MissionOrderProps): MissionOrder {
    validateMissionOrderProps(props);
    return new MissionOrder(props);
  }

  public get issuedAt(): Date {
    return new Date(this.issuedAtValue.getTime());
  }

  public checkPreconditions(context: MissionOrderContext): MissionPreconditionCheck {
    validateContext(context);
    const reasons: string[] = [];
    if (!this.scope.projectId.equals(context.scope.projectId)) reasons.push("project scope changed");
    if (!sameFeature(this.scope.featureId, context.scope.featureId)) reasons.push("feature scope changed");
    if (!sameStrings(this.scope.paths, normalizePaths(context.scope.paths))) reasons.push("path scope changed");
    if (this.preconditions.pipelineId !== context.pipelineId) reasons.push("pipeline changed");
    if (this.preconditions.nextStepId !== context.nextStepId) reasons.push("next pipeline step changed");
    return { current: reasons.length === 0, reasons: Object.freeze(reasons) };
  }

  public assertCurrent(context: MissionOrderContext): void {
    const check = this.checkPreconditions(context);
    if (!check.current) throw new MissionPreconditionError(check.reasons.join("; "));
  }

  public toProps(): MissionOrderProps {
    return {
      id: this.id,
      scope: cloneScope(this.scope),
      preconditions: { ...this.preconditions },
      requiredCapabilities: [...this.requiredCapabilities],
      requiredPermissions: [...this.requiredPermissions],
      summary: this.summary,
      issuedAt: this.issuedAt,
    };
  }
}

export function assertNoSecretLikeText(value: string, field: string): void {
  if (containsSecretLikeText(value)) {
    throw new InvalidMissionOrderError(`${field} must not include credentials or authorization material`);
  }
}

export function containsSecretLikeText(value: string): boolean {
  return SECRET_LIKE_PATTERN.test(value);
}

export function normalizeMissionScopePaths(paths: readonly string[]): readonly string[] {
  return Object.freeze(normalizePaths(paths));
}

function validateMissionOrderProps(props: MissionOrderProps): void {
  if (typeof props.id !== "string" || !MISSION_ID_PATTERN.test(props.id)) {
    throw new InvalidMissionOrderError("id must match [a-z][a-z0-9-]{0,95}");
  }
  validateScope(props.scope);
  validatePipelinePreconditions(props.preconditions);
  validateUniqueValues(props.requiredCapabilities, isExecutionCapability, "requiredCapabilities");
  validateUniqueValues(props.requiredPermissions, isExecutionPermission, "requiredPermissions");
  validateText(props.summary, "summary", 1_000);
  assertNoSecretLikeText(props.summary, "summary");
  validateDate(props.issuedAt, "issuedAt");
}

function validateContext(context: MissionOrderContext): void {
  validateScope(context.scope);
  validateText(context.pipelineId, "context.pipelineId", 128);
  validateText(context.nextStepId, "context.nextStepId", 128);
  if (!PIPELINE_ID_PATTERN.test(context.pipelineId)) throw new InvalidMissionOrderError("context.pipelineId is invalid");
  if (!STEP_ID_PATTERN.test(context.nextStepId)) throw new InvalidMissionOrderError("context.nextStepId is invalid");
}

function validateScope(scope: MissionScope): void {
  if (!(scope.projectId instanceof ProjectId)) throw new InvalidMissionOrderError("scope.projectId must be a ProjectId");
  if (scope.featureId !== undefined && !(scope.featureId instanceof FeatureId)) {
    throw new InvalidMissionOrderError("scope.featureId must be a FeatureId");
  }
  const normalized = normalizePaths(scope.paths);
  if (normalized.length === 0) throw new InvalidMissionOrderError("scope.paths must not be empty");
}

function validatePipelinePreconditions(value: MissionPipelinePreconditions): void {
  validateText(value.pipelineId, "preconditions.pipelineId", 128);
  validateText(value.nextStepId, "preconditions.nextStepId", 128);
  if (!PIPELINE_ID_PATTERN.test(value.pipelineId)) throw new InvalidMissionOrderError("preconditions.pipelineId is invalid");
  if (!STEP_ID_PATTERN.test(value.nextStepId)) throw new InvalidMissionOrderError("preconditions.nextStepId is invalid");
}

function validateUniqueValues<T extends string>(
  values: readonly T[],
  predicate: (value: unknown) => value is T,
  field: string,
): void {
  if (!Array.isArray(values) || values.some((value) => !predicate(value)) || new Set(values).size !== values.length) {
    throw new InvalidMissionOrderError(`${field} must be a unique array of supported values`);
  }
}

function normalizePaths(paths: readonly string[]): string[] {
  if (!Array.isArray(paths)) throw new InvalidMissionOrderError("scope.paths must be an array");
  const normalized = paths.map(normalizeProjectRelativePath);
  if (new Set(normalized).size !== normalized.length) throw new InvalidMissionOrderError("scope.paths must not contain duplicates");
  return normalized.sort((left, right) => left.localeCompare(right));
}

function normalizeProjectRelativePath(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 512 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidMissionOrderError("scope.paths must contain printable project-relative paths");
  }
  const normalized = value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "") || ".";
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) || segments.includes("..") || segments.some((segment) => segment.length === 0)) {
    throw new InvalidMissionOrderError(`scope path "${value}" is outside the project`);
  }
  return normalized;
}

function validateText(value: string, field: string, maximum: number): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidMissionOrderError(`${field} must contain 1..${maximum} printable characters`);
  }
}

function validateDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new InvalidMissionOrderError(`${field} must be a valid date`);
}

function freezeScope(scope: MissionScope): MissionScope {
  return Object.freeze({
    projectId: scope.projectId,
    ...(scope.featureId === undefined ? {} : { featureId: scope.featureId }),
    paths: Object.freeze(normalizePaths(scope.paths)),
  });
}

function cloneScope(scope: MissionScope): MissionScope {
  return {
    projectId: scope.projectId,
    ...(scope.featureId === undefined ? {} : { featureId: scope.featureId }),
    paths: [...scope.paths],
  };
}

function sameFeature(left: FeatureId | undefined, right: FeatureId | undefined): boolean {
  return left?.value === right?.value;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
