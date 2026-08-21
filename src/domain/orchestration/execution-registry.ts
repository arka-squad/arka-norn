import { ProjectId } from "../project/project-id.js";

import { InvalidExecutionRegistryError } from "./errors.js";
import { ExecutionRecord } from "./execution-record.js";

export const EXECUTION_REGISTRY_SCHEMA_VERSION = 1 as const;

export interface ExecutionRegistryProps {
  readonly schemaVersion: typeof EXECUTION_REGISTRY_SCHEMA_VERSION;
  readonly projectId: ProjectId;
  readonly executions: readonly ExecutionRecord[];
  readonly updatedAt: Date;
}

/** A separate, append-oriented Project execution registry. */
export class ExecutionRegistry {
  public readonly schemaVersion: typeof EXECUTION_REGISTRY_SCHEMA_VERSION;
  public readonly projectId: ProjectId;
  public readonly executions: readonly ExecutionRecord[];
  private readonly updatedAtValue: Date;

  private constructor(props: ExecutionRegistryProps) {
    this.schemaVersion = props.schemaVersion;
    this.projectId = props.projectId;
    this.executions = Object.freeze([...props.executions].sort(compareExecutions));
    this.updatedAtValue = new Date(props.updatedAt.getTime());
  }

  public static create(props: ExecutionRegistryProps): ExecutionRegistry {
    validateRegistryProps(props);
    return new ExecutionRegistry(props);
  }

  public static empty(projectId: ProjectId, updatedAt = new Date(0)): ExecutionRegistry {
    return ExecutionRegistry.create({
      schemaVersion: EXECUTION_REGISTRY_SCHEMA_VERSION,
      projectId,
      executions: [],
      updatedAt,
    });
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  public find(id: string): ExecutionRecord | undefined {
    return this.executions.find((record) => record.id === id);
  }

  public add(record: ExecutionRecord, updatedAt: Date): ExecutionRegistry {
    this.assertProject(record);
    if (this.find(record.id) !== undefined) throw new InvalidExecutionRegistryError(`execution ${record.id} already exists`);
    return this.withExecutions([...this.executions, record], updatedAt);
  }

  public replace(record: ExecutionRecord, updatedAt: Date): ExecutionRegistry {
    this.assertProject(record);
    const current = this.find(record.id);
    if (current === undefined) throw new InvalidExecutionRegistryError(`execution ${record.id} does not exist`);
    if (current.provider !== record.provider) throw new InvalidExecutionRegistryError(`execution ${record.id} provider is immutable`);
    if (!sameOrder(current.order, record.order)) throw new InvalidExecutionRegistryError(`execution ${record.id} mission order is immutable`);
    return this.withExecutions(this.executions.map((candidate) => candidate.id === record.id ? record : candidate), updatedAt);
  }

  public toProps(): ExecutionRegistryProps {
    return {
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      executions: this.executions.map((execution) => ExecutionRecord.create(execution.toProps())),
      updatedAt: this.updatedAt,
    };
  }

  private assertProject(record: ExecutionRecord): void {
    if (!record.order.scope.projectId.equals(this.projectId)) {
      throw new InvalidExecutionRegistryError(`execution ${record.id} belongs to another project`);
    }
  }

  private withExecutions(executions: readonly ExecutionRecord[], updatedAt: Date): ExecutionRegistry {
    validateDate(updatedAt, "updatedAt");
    if (updatedAt.getTime() < this.updatedAtValue.getTime()) {
      throw new InvalidExecutionRegistryError("updatedAt must not precede the current registry update time");
    }
    return ExecutionRegistry.create({
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      executions,
      updatedAt,
    });
  }
}

function validateRegistryProps(props: ExecutionRegistryProps): void {
  if (props.schemaVersion !== EXECUTION_REGISTRY_SCHEMA_VERSION) {
    throw new InvalidExecutionRegistryError("schemaVersion must be 1");
  }
  if (!(props.projectId instanceof ProjectId)) throw new InvalidExecutionRegistryError("projectId must be a ProjectId");
  const executions: unknown = props.executions;
  if (!isUnknownArray(executions)) throw new InvalidExecutionRegistryError("executions must be an array");
  const ids = new Set<string>();
  for (const record of executions) {
    if (!(record instanceof ExecutionRecord)) throw new InvalidExecutionRegistryError("executions must contain ExecutionRecord values");
    if (!record.order.scope.projectId.equals(props.projectId)) throw new InvalidExecutionRegistryError(`execution ${record.id} belongs to another project`);
    if (ids.has(record.id)) throw new InvalidExecutionRegistryError(`duplicate execution ${record.id}`);
    ids.add(record.id);
  }
  validateDate(props.updatedAt, "updatedAt");
}

function compareExecutions(left: ExecutionRecord, right: ExecutionRecord): number {
  const chronology = left.createdAt.getTime() - right.createdAt.getTime();
  return chronology === 0 ? left.id.localeCompare(right.id) : chronology;
}

function sameOrder(left: ExecutionRecord["order"], right: ExecutionRecord["order"]): boolean {
  const a = left.toProps();
  const b = right.toProps();
  return a.id === b.id
    && a.scope.projectId.equals(b.scope.projectId)
    && a.scope.featureId?.value === b.scope.featureId?.value
    && sameStrings(a.scope.paths, b.scope.paths)
    && a.preconditions.pipelineId === b.preconditions.pipelineId
    && a.preconditions.nextStepId === b.preconditions.nextStepId
    && sameStrings(a.requiredCapabilities, b.requiredCapabilities)
    && sameStrings(a.requiredPermissions, b.requiredPermissions)
    && a.summary === b.summary
    && a.issuedAt.getTime() === b.issuedAt.getTime();
}

function sameStrings<T extends string>(left: readonly T[], right: readonly T[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validateDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new InvalidExecutionRegistryError(`${field} must be a valid date`);
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}
