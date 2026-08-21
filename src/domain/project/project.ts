import { InvalidProjectOptionError } from "../errors.js";
import type { ProjectId } from "./project-id.js";

export const PROJECT_ORCHESTRATION_MODES = ["manual", "automatic"] as const;

export type ProjectOrchestrationMode = (typeof PROJECT_ORCHESTRATION_MODES)[number];

export interface ProjectProps {
  readonly id: ProjectId;
  readonly name: string;
  readonly root: string;
  /**
   * v3 is accepted only to keep direct in-memory callers compatible with
   * historical markers. Every Project instance is normalized to v4.
   */
  readonly schemaVersion: 3 | 4;
  readonly orchestrationMode?: ProjectOrchestrationMode;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface CanonicalProjectProps {
  readonly id: ProjectId;
  readonly name: string;
  readonly root: string;
  readonly schemaVersion: 4;
  readonly orchestrationMode: ProjectOrchestrationMode;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Project {
  public readonly id: ProjectId;
  public readonly name: string;
  public readonly root: string;
  public readonly schemaVersion: 4;
  public readonly orchestrationMode: ProjectOrchestrationMode;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: CanonicalProjectProps) {
    this.id = props.id;
    this.name = props.name;
    this.root = props.root;
    this.schemaVersion = props.schemaVersion;
    this.orchestrationMode = props.orchestrationMode;
    this.createdAt = new Date(props.createdAt.getTime());
    this.updatedAt = new Date(props.updatedAt.getTime());
  }

  public static create(props: ProjectProps): Project {
    validateName(props.name);
    validateRoot(props.root);
    validateSchemaVersion(props.schemaVersion);
    const orchestrationMode = props.orchestrationMode ?? "manual";
    validateOrchestrationMode(orchestrationMode);
    validateDate(props.createdAt, "createdAt");
    validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new InvalidProjectOptionError("updatedAt", "must not be earlier than createdAt");
    }
    return new Project({
      id: props.id,
      name: props.name,
      root: props.root,
      schemaVersion: 4,
      orchestrationMode,
      createdAt: props.createdAt,
      updatedAt: props.updatedAt,
    });
  }

  public withName(name: string, now: Date): Project {
    return Project.create({ ...this.toProps(), name, updatedAt: now });
  }

  public touched(now: Date): Project {
    return Project.create({ ...this.toProps(), updatedAt: now });
  }

  public withOrchestrationMode(orchestrationMode: ProjectOrchestrationMode, now: Date): Project {
    return Project.create({ ...this.toProps(), orchestrationMode, updatedAt: now });
  }

  public sameIdentity(other: Project): boolean {
    return this.id.equals(other.id);
  }

  private toProps(): CanonicalProjectProps {
    return {
      id: this.id,
      name: this.name,
      root: this.root,
      schemaVersion: this.schemaVersion,
      orchestrationMode: this.orchestrationMode,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

function validateName(name: string): void {
  if (typeof name !== "string" || name.trim().length === 0 || name.length > 256) {
    throw new InvalidProjectOptionError("name", "must contain between 1 and 256 characters");
  }
}

function validateRoot(root: string): void {
  if (typeof root !== "string" || (!root.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(root))) {
    throw new InvalidProjectOptionError("root", "must be an absolute POSIX or Windows path");
  }
}

function validateSchemaVersion(schemaVersion: number): void {
  if (schemaVersion !== 3 && schemaVersion !== 4) {
    throw new InvalidProjectOptionError("schemaVersion", "must be 3 or 4");
  }
}

function validateOrchestrationMode(orchestrationMode: unknown): asserts orchestrationMode is ProjectOrchestrationMode {
  if (!isProjectOrchestrationMode(orchestrationMode)) {
    throw new InvalidProjectOptionError("orchestrationMode", "must be manual or automatic");
  }
}

function validateDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidProjectOptionError(field, "must be a valid Date");
  }
}

export function isProjectOrchestrationMode(value: unknown): value is ProjectOrchestrationMode {
  return value === "manual" || value === "automatic";
}
