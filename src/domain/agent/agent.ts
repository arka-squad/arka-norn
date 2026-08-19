import { InvalidAgentOptionError } from "../errors.js";
import type { FeatureId } from "../feature/feature-id.js";
import type { ProjectId } from "../project/project-id.js";
import type { AgentId } from "./agent-id.js";

export interface AgentScope {
  readonly projectId: ProjectId;
  readonly featureIds: readonly FeatureId[];
  readonly paths: readonly string[];
  readonly responsibilities: readonly string[];
}

export interface AgentRegistrationProps {
  readonly id: AgentId;
  readonly provider: string;
  readonly role: string;
  readonly active: boolean;
  readonly scope: AgentScope;
  readonly registeredAt: Date;
  readonly updatedAt: Date;
  readonly deactivatedAt?: Date;
  readonly replacedByAgentId?: AgentId;
  readonly replacesAgentId?: AgentId;
}

export class AgentRegistration {
  public readonly id: AgentId;
  public readonly provider: string;
  public readonly role: string;
  public readonly active: boolean;
  public readonly scope: AgentScope;
  public readonly registeredAt: Date;
  public readonly updatedAt: Date;
  public readonly deactivatedAt: Date | undefined;
  public readonly replacedByAgentId: AgentId | undefined;
  public readonly replacesAgentId: AgentId | undefined;

  private constructor(props: AgentRegistrationProps) {
    this.id = props.id;
    this.provider = props.provider;
    this.role = props.role;
    this.active = props.active;
    this.scope = freezeScope(props.scope);
    this.registeredAt = new Date(props.registeredAt.getTime());
    this.updatedAt = new Date(props.updatedAt.getTime());
    this.deactivatedAt = props.deactivatedAt === undefined ? undefined : new Date(props.deactivatedAt.getTime());
    this.replacedByAgentId = props.replacedByAgentId;
    this.replacesAgentId = props.replacesAgentId;
  }

  public static create(props: AgentRegistrationProps): AgentRegistration {
    validateText(props.provider, "provider", 80);
    validateText(props.role, "role", 80);
    validateDate(props.registeredAt, "registeredAt");
    validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.registeredAt.getTime()) throw new InvalidAgentOptionError("updatedAt", "must not precede registeredAt");
    validateScope(props.scope);
    if (props.active && (props.deactivatedAt !== undefined || props.replacedByAgentId !== undefined)) {
      throw new InvalidAgentOptionError("active", "an active agent cannot be deactivated or replaced");
    }
    if (!props.active && props.deactivatedAt === undefined) throw new InvalidAgentOptionError("deactivatedAt", "is required for an inactive agent");
    if (props.deactivatedAt !== undefined) {
      validateDate(props.deactivatedAt, "deactivatedAt");
      if (props.deactivatedAt.getTime() < props.registeredAt.getTime()) throw new InvalidAgentOptionError("deactivatedAt", "must not precede registeredAt");
    }
    if (props.replacedByAgentId?.equals(props.id) === true || props.replacesAgentId?.equals(props.id) === true) {
      throw new InvalidAgentOptionError("replacement", "an agent cannot replace itself");
    }
    return new AgentRegistration(props);
  }

  public deactivate(at: Date, replacedByAgentId?: AgentId): AgentRegistration {
    if (!this.active) throw new InvalidAgentOptionError("active", `agent ${this.id.value} is already inactive`);
    return AgentRegistration.create({
      ...this.toProps(),
      active: false,
      updatedAt: at,
      deactivatedAt: at,
      ...(replacedByAgentId === undefined ? {} : { replacedByAgentId }),
    });
  }

  public coversFeature(featureId: FeatureId): boolean {
    return this.scope.featureIds.length === 0 || this.scope.featureIds.some((candidate) => candidate.value === featureId.value);
  }

  public coversProjectPath(relativePath: string): boolean {
    if (this.scope.paths.length === 0) return true;
    const target = canonicalRelative(relativePath);
    return this.scope.paths.some((path) => {
      const allowed = canonicalRelative(path);
      return target === allowed || target.startsWith(`${allowed}/`);
    });
  }

  private toProps(): AgentRegistrationProps {
    return {
      id: this.id,
      provider: this.provider,
      role: this.role,
      active: this.active,
      scope: this.scope,
      registeredAt: this.registeredAt,
      updatedAt: this.updatedAt,
      ...(this.deactivatedAt === undefined ? {} : { deactivatedAt: this.deactivatedAt }),
      ...(this.replacedByAgentId === undefined ? {} : { replacedByAgentId: this.replacedByAgentId }),
      ...(this.replacesAgentId === undefined ? {} : { replacesAgentId: this.replacesAgentId }),
    };
  }
}

function validateScope(scope: AgentScope): void {
  unique(scope.featureIds.map((id) => id.value), "featureIds");
  unique(scope.paths, "paths");
  unique(scope.responsibilities, "responsibilities");
  for (const path of scope.paths) {
    const segments = path.split(/[\\/]/);
    if (path.length === 0 || path.length > 512 || path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path) || segments.includes("..")) {
      throw new InvalidAgentOptionError("scope.paths", `must contain safe project-relative paths; received "${path}"`);
    }
  }
  for (const responsibility of scope.responsibilities) validateText(responsibility, "scope.responsibilities", 256);
}

function canonicalRelative(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

function freezeScope(scope: AgentScope): AgentScope {
  return {
    projectId: scope.projectId,
    featureIds: [...scope.featureIds],
    paths: [...scope.paths],
    responsibilities: [...scope.responsibilities],
  };
}

function unique(values: readonly string[], field: string): void {
  if (new Set(values).size !== values.length) throw new InvalidAgentOptionError(`scope.${field}`, "must not contain duplicates");
}

function validateText(value: string, field: string, max: number): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new InvalidAgentOptionError(field, `must contain 1..${max} printable characters`);
  }
}

function validateDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new InvalidAgentOptionError(field, "must be a valid Date");
}
