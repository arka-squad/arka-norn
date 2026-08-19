import { InvalidProjectOptionError } from "../errors.js";
import type { ProjectId } from "./project-id.js";

export interface ProjectProps {
  readonly id: ProjectId;
  readonly name: string;
  readonly root: string;
  readonly schemaVersion: 2;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Project {
  public readonly id: ProjectId;
  public readonly name: string;
  public readonly root: string;
  public readonly schemaVersion: 2;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  private constructor(props: ProjectProps) {
    this.id = props.id;
    this.name = props.name;
    this.root = props.root;
    this.schemaVersion = props.schemaVersion;
    this.createdAt = new Date(props.createdAt.getTime());
    this.updatedAt = new Date(props.updatedAt.getTime());
  }

  public static create(props: ProjectProps): Project {
    validateName(props.name);
    validateRoot(props.root);
    validateDate(props.createdAt, "createdAt");
    validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
      throw new InvalidProjectOptionError("updatedAt", "must not be earlier than createdAt");
    }
    return new Project(props);
  }

  public withName(name: string, now: Date): Project {
    return Project.create({ ...this.toProps(), name, updatedAt: now });
  }

  public touched(now: Date): Project {
    return Project.create({ ...this.toProps(), updatedAt: now });
  }

  public sameIdentity(other: Project): boolean {
    return this.id.equals(other.id);
  }

  private toProps(): ProjectProps {
    return {
      id: this.id,
      name: this.name,
      root: this.root,
      schemaVersion: this.schemaVersion,
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

function validateDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidProjectOptionError(field, "must be a valid Date");
  }
}
