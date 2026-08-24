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
import { InvalidExecutionRecordError } from "./errors.js";
import { containsSecretLikeText, MissionOrder } from "./mission-order.js";
import { isExecutionAttemptStatus, isExecutionRecordStatus, isExecutionTarget, legacyExecutionTarget, } from "./types.js";
const EXECUTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,95}$/;
const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
// One initial provider run plus one bounded retry for an automatic campaign.
// A fresh preview is required instead of turning a failing mission into a loop.
const MAX_EXECUTION_ATTEMPTS = 2;
const MAX_EXECUTION_EVENTS = 100;
const MAX_PROOF_REFERENCES = 50;
export const EXECUTION_SUSPENSION_CODES = [
    "permission_not_preapproved",
    "permission_requested",
    "automatic_disabled",
    "scope_changed",
    "precondition_changed",
    "missing_proof",
    "decision_required",
    "provider_error",
    "worker_unavailable",
    "cancelled_by_user",
    "interrupted",
    "policy_rejected",
];
/**
 * A history-bearing execution. Its target and MissionOrder are immutable:
 * retries reuse the same provider, adapter and model instead of falling back.
 */
export class ExecutionRecord {
    id;
    order;
    target;
    /** Compatibility accessor for older renderers; new code must use `target`. */
    provider;
    status;
    attempts;
    events;
    truncatedEventCount;
    proofReferences;
    suspensionReason;
    providerSessionId;
    createdAtValue;
    updatedAtValue;
    constructor(props) {
        this.id = props.id;
        this.order = MissionOrder.create(props.order.toProps());
        this.target = freezeExecutionTarget(props.target);
        this.provider = this.target.provider;
        this.status = props.status;
        this.attempts = freezeAttempts(props.attempts);
        this.events = freezeEvents(props.events);
        this.truncatedEventCount = props.truncatedEventCount;
        this.proofReferences = Object.freeze([...props.proofReferences]);
        this.suspensionReason = props.suspensionReason === undefined ? undefined : Object.freeze({ ...props.suspensionReason });
        this.providerSessionId = props.providerSessionId;
        this.createdAtValue = new Date(props.createdAt.getTime());
        this.updatedAtValue = new Date(props.updatedAt.getTime());
    }
    static create(props) {
        validateRecordProps(props);
        return new ExecutionRecord(props);
    }
    static planned(id, order, targetOrProvider, at) {
        const target = typeof targetOrProvider === "string"
            ? legacyExecutionTarget(targetOrProvider)
            : targetOrProvider;
        const targetEvent = target.source === "legacy"
            ? { at, type: "target_selected", detail: "Legacy execution target retained without a model." }
            : { at, type: "target_selected", detail: `Provider ${target.provider} and model ${target.model} selected by the user.` };
        return ExecutionRecord.create({
            id,
            order,
            target,
            status: "planned",
            attempts: [],
            events: [
                targetEvent,
                { at, type: "planned", detail: "Mission order accepted by the control plane." },
            ],
            truncatedEventCount: 0,
            proofReferences: [],
            createdAt: at,
            updatedAt: at,
        });
    }
    get createdAt() {
        return new Date(this.createdAtValue.getTime());
    }
    get updatedAt() {
        return new Date(this.updatedAtValue.getTime());
    }
    begin(input) {
        this.requireStatus("planned");
        validateDate(input.at, "begin.at");
        if (this.attempts.length >= MAX_EXECUTION_ATTEMPTS) {
            throw new InvalidExecutionRecordError(`attempts must not exceed ${MAX_EXECUTION_ATTEMPTS}`);
        }
        const attempt = {
            number: this.attempts.length + 1,
            status: "running",
            startedAt: input.at,
            ...(input.providerSessionId === undefined ? {} : { providerSessionId: input.providerSessionId }),
        };
        return this.transition({
            status: "running",
            at: input.at,
            attempts: [...this.attempts, attempt],
            ...(input.providerSessionId === undefined ? {} : { providerSessionId: input.providerSessionId }),
            event: { type: "started", detail: "Worker dispatch started." },
        });
    }
    awaitApproval(reason, at) {
        this.requireStatus("running");
        return this.transition({
            status: "awaiting_approval",
            at,
            suspensionReason: reason,
            event: { type: "approval_requested", detail: reason.detail },
        });
    }
    approve(at) {
        this.requireStatus("awaiting_approval");
        return this.transition({
            status: "planned",
            at,
            attempts: finishLatestAttempt(this.attempts, "interrupted", at),
            event: { type: "approved", detail: "Required approval granted; mission can be dispatched again." },
        });
    }
    succeed(proofReferences, at) {
        this.requireStatus("running");
        const proofs = mergeProofReferences(this.proofReferences, proofReferences);
        if (proofs.length === 0)
            throw new InvalidExecutionRecordError("succeeded execution requires at least one proof reference");
        return this.transition({
            status: "succeeded",
            at,
            attempts: finishLatestAttempt(this.attempts, "succeeded", at),
            proofReferences: proofs,
            event: { type: "succeeded", detail: "Worker returned verifiable proof references." },
        });
    }
    /**
     * Persist only a validated provider session identifier. The provider is
     * immutable and the session remains diagnostic metadata: retry still starts
     * a new run.
     */
    recordProviderSession(providerSessionId, at) {
        if (this.status !== "running" && this.status !== "awaiting_approval") {
            throw new InvalidExecutionRecordError(`cannot record a provider session in ${this.status}`);
        }
        validateProviderSessionId(providerSessionId);
        const latest = this.attempts.at(-1);
        if (latest === undefined || latest.status !== "running") {
            throw new InvalidExecutionRecordError("a running attempt is required to record a provider session");
        }
        if (latest.providerSessionId === providerSessionId && this.providerSessionId === providerSessionId)
            return this;
        const attempts = [...this.attempts.slice(0, -1), { ...latest, providerSessionId }];
        return this.transition({
            status: this.status,
            at,
            attempts,
            providerSessionId,
            event: { type: "provider_session_recorded", detail: "External provider session reference recorded." },
        });
    }
    fail(reason, at) {
        this.requireStatus("running");
        return this.transition({
            status: "failed",
            at,
            attempts: finishLatestAttempt(this.attempts, "failed", at),
            suspensionReason: reason,
            event: { type: "failed", detail: reason.detail },
        });
    }
    cancel(reason, at) {
        if (this.status !== "planned" && this.status !== "running" && this.status !== "awaiting_approval") {
            throw new InvalidExecutionRecordError(`cannot cancel an execution in ${this.status}`);
        }
        const attempts = this.status === "running" || this.status === "awaiting_approval"
            ? finishLatestAttempt(this.attempts, "cancelled", at)
            : this.attempts;
        return this.transition({
            status: "cancelled",
            at,
            attempts,
            suspensionReason: reason,
            event: { type: "cancelled", detail: reason.detail },
        });
    }
    interrupt(reason, at) {
        if (this.status !== "running" && this.status !== "awaiting_approval") {
            throw new InvalidExecutionRecordError(`cannot interrupt an execution in ${this.status}`);
        }
        return this.transition({
            status: "interrupted",
            at,
            attempts: finishLatestAttempt(this.attempts, "interrupted", at),
            suspensionReason: reason,
            event: { type: "interrupted", detail: reason.detail },
        });
    }
    reject(reason, at) {
        this.requireStatus("planned");
        return this.transition({
            status: "rejected",
            at,
            suspensionReason: reason,
            event: { type: "rejected", detail: reason.detail },
        });
    }
    retry(at) {
        if (this.target.source === "legacy") {
            throw new InvalidExecutionRecordError("legacy execution target cannot be retried without an explicitly selected model");
        }
        if (this.status !== "failed" && this.status !== "cancelled" && this.status !== "interrupted") {
            throw new InvalidExecutionRecordError(`cannot retry an execution in ${this.status}`);
        }
        if (this.attempts.length >= MAX_EXECUTION_ATTEMPTS) {
            throw new InvalidExecutionRecordError(`attempts must not exceed ${MAX_EXECUTION_ATTEMPTS}`);
        }
        return this.transition({
            status: "planned",
            at,
            event: { type: "retry_planned", detail: "Retry planned with the original provider, adapter and model." },
        });
    }
    appendEvent(type, detail, at) {
        validateEvent({ type, detail, at });
        return this.transition({ status: this.status, at, event: { type, detail } });
    }
    toProps() {
        return {
            id: this.id,
            order: MissionOrder.create(this.order.toProps()),
            target: cloneExecutionTarget(this.target),
            status: this.status,
            attempts: cloneAttempts(this.attempts),
            events: cloneEvents(this.events),
            truncatedEventCount: this.truncatedEventCount,
            proofReferences: [...this.proofReferences],
            ...(this.suspensionReason === undefined ? {} : { suspensionReason: { ...this.suspensionReason } }),
            ...(this.providerSessionId === undefined ? {} : { providerSessionId: this.providerSessionId }),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
    requireStatus(expected) {
        if (this.status !== expected)
            throw new InvalidExecutionRecordError(`expected ${expected} status, received ${this.status}`);
    }
    transition(input) {
        validateDate(input.at, "transition.at");
        if (input.at.getTime() < this.updatedAtValue.getTime()) {
            throw new InvalidExecutionRecordError("transition time must not precede the current update time");
        }
        const event = { at: input.at, type: input.event.type, detail: input.event.detail };
        const bounded = appendBoundedEvent(this.events, event, this.truncatedEventCount);
        const suspensionReason = input.status === "planned" || input.status === "succeeded"
            ? undefined
            : input.suspensionReason ?? this.suspensionReason;
        return ExecutionRecord.create({
            id: this.id,
            order: this.order,
            target: this.target,
            status: input.status,
            attempts: input.attempts ?? this.attempts,
            events: bounded.events,
            truncatedEventCount: bounded.truncatedEventCount,
            proofReferences: input.proofReferences ?? this.proofReferences,
            ...(suspensionReason === undefined ? {} : { suspensionReason }),
            ...(input.providerSessionId === undefined ? (this.providerSessionId === undefined ? {} : { providerSessionId: this.providerSessionId }) : { providerSessionId: input.providerSessionId }),
            createdAt: this.createdAt,
            updatedAt: input.at,
        });
    }
}
export function executionSuspensionReason(code, detail) {
    const value = { code, detail };
    validateSuspensionReason(value);
    return Object.freeze({ ...value });
}
export function isExecutionSuspensionCode(value) {
    return typeof value === "string" && EXECUTION_SUSPENSION_CODES.includes(value);
}
function validateRecordProps(props) {
    if (typeof props.id !== "string" || !EXECUTION_ID_PATTERN.test(props.id)) {
        throw new InvalidExecutionRecordError("id must match [a-z][a-z0-9-]{0,95}");
    }
    if (!(props.order instanceof MissionOrder))
        throw new InvalidExecutionRecordError("order must be a MissionOrder");
    if (!isExecutionTarget(props.target))
        throw new InvalidExecutionRecordError("target is invalid");
    if (!isExecutionRecordStatus(props.status))
        throw new InvalidExecutionRecordError("status is unsupported");
    validateAttempts(props.attempts);
    validateEvents(props.events);
    if (!Number.isInteger(props.truncatedEventCount) || props.truncatedEventCount < 0) {
        throw new InvalidExecutionRecordError("truncatedEventCount must be a non-negative integer");
    }
    validateProofReferences(props.proofReferences);
    if (props.suspensionReason !== undefined)
        validateSuspensionReason(props.suspensionReason);
    if (props.providerSessionId !== undefined)
        validateProviderSessionId(props.providerSessionId);
    validateDate(props.createdAt, "createdAt");
    validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.createdAt.getTime())
        throw new InvalidExecutionRecordError("updatedAt must not precede createdAt");
    validateStateConsistency(props);
}
function validateStateConsistency(props) {
    const lastAttempt = props.attempts.at(-1);
    if (props.status === "succeeded") {
        if (props.proofReferences.length === 0)
            throw new InvalidExecutionRecordError("succeeded execution requires proof references");
        if (lastAttempt?.status !== "succeeded")
            throw new InvalidExecutionRecordError("succeeded execution requires a succeeded attempt");
    }
    if (props.status === "running" && lastAttempt?.status !== "running") {
        throw new InvalidExecutionRecordError("running execution requires a running attempt");
    }
    if (props.status === "awaiting_approval") {
        if (props.suspensionReason === undefined)
            throw new InvalidExecutionRecordError("awaiting approval requires a suspension reason");
        if (lastAttempt?.status !== "running")
            throw new InvalidExecutionRecordError("awaiting approval requires a running attempt");
    }
    if (["failed", "cancelled", "interrupted", "rejected"].includes(props.status) && props.suspensionReason === undefined) {
        throw new InvalidExecutionRecordError(`${props.status} execution requires a suspension reason`);
    }
}
function validateAttempts(value) {
    if (!isUnknownArray(value) || value.length > MAX_EXECUTION_ATTEMPTS) {
        throw new InvalidExecutionRecordError(`attempts must contain at most ${MAX_EXECUTION_ATTEMPTS} entries`);
    }
    let previousStart = -Infinity;
    for (const [index, attempt] of value.entries()) {
        validateAttempt(attempt);
        if (!Number.isInteger(attempt.number) || attempt.number !== index + 1)
            throw new InvalidExecutionRecordError("attempt numbers must be contiguous");
        validateDate(attempt.startedAt, "attempt.startedAt");
        if (attempt.startedAt.getTime() < previousStart)
            throw new InvalidExecutionRecordError("attempts must be ordered by start time");
        previousStart = attempt.startedAt.getTime();
        if (attempt.endedAt !== undefined) {
            validateDate(attempt.endedAt, "attempt.endedAt");
            if (attempt.endedAt.getTime() < attempt.startedAt.getTime())
                throw new InvalidExecutionRecordError("attempt end must not precede start");
        }
        if (attempt.status === "running" && attempt.endedAt !== undefined)
            throw new InvalidExecutionRecordError("running attempt cannot have endedAt");
        if (attempt.status !== "running" && attempt.endedAt === undefined)
            throw new InvalidExecutionRecordError("finished attempt requires endedAt");
        if (attempt.providerSessionId !== undefined)
            validateProviderSessionId(attempt.providerSessionId);
    }
}
function validateAttempt(value) {
    if (!isRecord(value))
        throw new InvalidExecutionRecordError("attempt must be an object");
    const number = value["number"];
    const status = value["status"];
    if (typeof number !== "number" || !Number.isInteger(number))
        throw new InvalidExecutionRecordError("attempt number is invalid");
    if (!isExecutionAttemptStatus(status))
        throw new InvalidExecutionRecordError("attempt status is unsupported");
    validateDate(value["startedAt"], "attempt.startedAt");
    if (value["endedAt"] !== undefined)
        validateDate(value["endedAt"], "attempt.endedAt");
    if (value["providerSessionId"] !== undefined)
        validateProviderSessionId(value["providerSessionId"]);
}
function validateEvents(value) {
    if (!isUnknownArray(value) || value.length > MAX_EXECUTION_EVENTS) {
        throw new InvalidExecutionRecordError(`events must contain at most ${MAX_EXECUTION_EVENTS} entries`);
    }
    let previous = -Infinity;
    for (const event of value) {
        validateEvent(event);
        if (event.at.getTime() < previous)
            throw new InvalidExecutionRecordError("events must be ordered by time");
        previous = event.at.getTime();
    }
}
function validateEvent(event) {
    if (!isRecord(event))
        throw new InvalidExecutionRecordError("event must be an object");
    validateDate(event.at, "event.at");
    if (typeof event.type !== "string" || !EVENT_TYPE_PATTERN.test(event.type)) {
        throw new InvalidExecutionRecordError("event.type is invalid");
    }
    validateSafeText(event.detail, "event.detail", 500);
}
function validateProofReferences(value) {
    if (!isUnknownArray(value) || value.length > MAX_PROOF_REFERENCES || new Set(value).size !== value.length) {
        throw new InvalidExecutionRecordError(`proofReferences must contain at most ${MAX_PROOF_REFERENCES} unique entries`);
    }
    for (const reference of value)
        validateSafeText(reference, "proofReferences", 512);
}
function validateSuspensionReason(reason) {
    if (!isRecord(reason))
        throw new InvalidExecutionRecordError("suspension reason must be an object");
    if (!isExecutionSuspensionCode(reason.code))
        throw new InvalidExecutionRecordError("suspension reason code is unsupported");
    validateSafeText(reason.detail, "suspension reason detail", 500);
}
function validateProviderSessionId(value) {
    validateSafeText(value, "providerSessionId", 256);
}
function validateSafeText(value, field, maximum) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum || /[\u0000-\u001f\u007f]/.test(value)) {
        throw new InvalidExecutionRecordError(`${field} must contain 1..${maximum} printable characters`);
    }
    if (containsSecretLikeText(value))
        throw new InvalidExecutionRecordError(`${field} must not include credentials or authorization material`);
}
function validateDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime()))
        throw new InvalidExecutionRecordError(`${field} must be a valid date`);
}
function isUnknownArray(value) {
    return Array.isArray(value);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function finishLatestAttempt(attempts, status, at) {
    const current = attempts.at(-1);
    if (current === undefined || current.status !== "running")
        throw new InvalidExecutionRecordError("no running attempt to finish");
    return [...attempts.slice(0, -1), { ...current, status, endedAt: at }];
}
function mergeProofReferences(current, incoming) {
    const merged = [...current, ...incoming];
    validateProofReferences(merged);
    return merged;
}
function appendBoundedEvent(events, event, truncatedEventCount) {
    validateEvent(event);
    const next = [...events, event];
    if (next.length <= MAX_EXECUTION_EVENTS)
        return { events: next, truncatedEventCount };
    return { events: next.slice(1), truncatedEventCount: truncatedEventCount + 1 };
}
function freezeAttempts(attempts) {
    return Object.freeze(attempts.map((attempt) => Object.freeze({
        ...attempt,
        startedAt: new Date(attempt.startedAt.getTime()),
        ...(attempt.endedAt === undefined ? {} : { endedAt: new Date(attempt.endedAt.getTime()) }),
    })));
}
function freezeEvents(events) {
    return Object.freeze(events.map((event) => Object.freeze({ ...event, at: new Date(event.at.getTime()) })));
}
function cloneAttempts(attempts) {
    return attempts.map((attempt) => ({
        ...attempt,
        startedAt: new Date(attempt.startedAt.getTime()),
        ...(attempt.endedAt === undefined ? {} : { endedAt: new Date(attempt.endedAt.getTime()) }),
    }));
}
function cloneEvents(events) {
    return events.map((event) => ({ ...event, at: new Date(event.at.getTime()) }));
}
function freezeExecutionTarget(target) {
    return Object.freeze({
        provider: target.provider,
        adapter: target.adapter,
        ...(target.model === undefined ? {} : { model: target.model }),
        source: target.source,
    });
}
function cloneExecutionTarget(target) {
    return {
        provider: target.provider,
        adapter: target.adapter,
        ...(target.model === undefined ? {} : { model: target.model }),
        source: target.source,
    };
}
//# sourceMappingURL=execution-record.js.map