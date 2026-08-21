export class OrchestrationError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = new.target.name;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}
export class InvalidExecutionPolicyError extends OrchestrationError {
    constructor(reason) {
        super("INVALID_EXECUTION_POLICY", `Invalid orchestration policy: ${reason}`);
    }
}
export class InvalidMissionOrderError extends OrchestrationError {
    constructor(reason) {
        super("INVALID_MISSION_ORDER", `Invalid mission order: ${reason}`);
    }
}
export class MissionPreconditionError extends OrchestrationError {
    constructor(reason) {
        super("MISSION_PRECONDITION_FAILED", `Mission order precondition failed: ${reason}`);
    }
}
export class InvalidExecutionRecordError extends OrchestrationError {
    constructor(reason) {
        super("INVALID_EXECUTION_RECORD", `Invalid execution record: ${reason}`);
    }
}
export class InvalidExecutionRegistryError extends OrchestrationError {
    constructor(reason) {
        super("INVALID_EXECUTION_REGISTRY", `Invalid execution registry: ${reason}`);
    }
}
//# sourceMappingURL=errors.js.map