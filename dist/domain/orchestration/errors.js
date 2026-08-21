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