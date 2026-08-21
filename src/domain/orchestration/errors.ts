export type OrchestrationErrorCode =
  | "INVALID_EXECUTION_POLICY"
  | "INVALID_MISSION_ORDER"
  | "MISSION_PRECONDITION_FAILED"
  | "INVALID_EXECUTION_RECORD"
  | "INVALID_EXECUTION_REGISTRY";

export class OrchestrationError extends Error {
  public readonly code: OrchestrationErrorCode;

  public constructor(code: OrchestrationErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = new.target.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class InvalidExecutionPolicyError extends OrchestrationError {
  public constructor(reason: string) {
    super("INVALID_EXECUTION_POLICY", `Invalid orchestration policy: ${reason}`);
  }
}

export class InvalidMissionOrderError extends OrchestrationError {
  public constructor(reason: string) {
    super("INVALID_MISSION_ORDER", `Invalid mission order: ${reason}`);
  }
}

export class MissionPreconditionError extends OrchestrationError {
  public constructor(reason: string) {
    super("MISSION_PRECONDITION_FAILED", `Mission order precondition failed: ${reason}`);
  }
}

export class InvalidExecutionRecordError extends OrchestrationError {
  public constructor(reason: string) {
    super("INVALID_EXECUTION_RECORD", `Invalid execution record: ${reason}`);
  }
}

export class InvalidExecutionRegistryError extends OrchestrationError {
  public constructor(reason: string) {
    super("INVALID_EXECUTION_REGISTRY", `Invalid execution registry: ${reason}`);
  }
}
