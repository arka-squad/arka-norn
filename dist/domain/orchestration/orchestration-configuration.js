/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { ExecutionProfile } from "./execution-profile.js";
import { GLOBAL_AUTOMATIC_RISK_CEILING } from "./orchestration-risk.js";
export const ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION = 4;
export class OrchestrationConfiguration {
    value;
    constructor(value) {
        this.value = value;
    }
    static create(value) {
        validate(value);
        return new OrchestrationConfiguration(freeze(value));
    }
    static empty(projectId, at) {
        return OrchestrationConfiguration.create({
            schemaVersion: ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION,
            projectId,
            automaticEnabled: false,
            profiles: [],
            riskPolicy: { automaticThreshold: GLOBAL_AUTOMATIC_RISK_CEILING },
            createdAt: at,
            updatedAt: at,
        });
    }
    get projectId() { return this.value.projectId; }
    get automaticEnabled() { return this.value.automaticEnabled; }
    get profiles() { return this.value.profiles.map((profile) => ExecutionProfile.create(profile)); }
    get props() { return clone(this.value); }
    register(profile, at) {
        const profiles = this.value.profiles.filter((candidate) => candidate.id !== profile.id);
        return OrchestrationConfiguration.create({ ...this.value, profiles: [...profiles, profile.props], updatedAt: at });
    }
    activate(at) {
        if (this.value.profiles.every((profile) => !profile.enabled))
            throw new Error("Automatic orchestration requires at least one enabled execution profile.");
        return OrchestrationConfiguration.create({ ...this.value, automaticEnabled: true, updatedAt: at });
    }
    deactivate(at) {
        return OrchestrationConfiguration.create({ ...this.value, automaticEnabled: false, updatedAt: at });
    }
}
function validate(value) {
    if (value.schemaVersion !== ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION)
        throw new TypeError("Orchestration configuration schemaVersion must be 4.");
    if (!safeId(value.projectId, 120) || typeof value.automaticEnabled !== "boolean")
        throw new TypeError("Orchestration configuration identity is invalid.");
    if (value.profiles.length > 64)
        throw new TypeError("Orchestration profiles are invalid.");
    const ids = new Set();
    for (const profile of value.profiles) {
        const validated = ExecutionProfile.create(profile);
        if (ids.has(validated.id))
            throw new TypeError(`Duplicate execution profile ${validated.id}.`);
        ids.add(validated.id);
    }
    if (!Number.isInteger(value.riskPolicy.automaticThreshold) || value.riskPolicy.automaticThreshold < 0 || value.riskPolicy.automaticThreshold > GLOBAL_AUTOMATIC_RISK_CEILING)
        throw new TypeError("Orchestration risk threshold is invalid.");
    if (value.riskPolicy.extraWeights !== undefined) {
        for (const [key, weight] of Object.entries(value.riskPolicy.extraWeights))
            if (!/^[a-z][a-z0-9_]{0,79}$/u.test(key) || !Number.isInteger(weight) || weight < 0 || weight > 100)
                throw new TypeError("Orchestration risk weights are invalid.");
    }
    if (!validDate(value.createdAt) || !validDate(value.updatedAt) || value.updatedAt < value.createdAt)
        throw new TypeError("Orchestration configuration timestamps are invalid.");
    if (value.automaticEnabled && value.profiles.every((profile) => !profile.enabled))
        throw new TypeError("Automatic orchestration cannot be enabled without an enabled profile.");
}
function safeId(value, maximum) { return value.length > 0 && value.length <= maximum && /^[a-z0-9][a-z0-9._-]*$/u.test(value); }
function validDate(value) { return value instanceof Date && !Number.isNaN(value.getTime()); }
function cloneProfile(value) { return ExecutionProfile.create(value).props; }
function clone(value) { return { ...value, profiles: value.profiles.map(cloneProfile), riskPolicy: { ...value.riskPolicy, ...(value.riskPolicy.extraWeights === undefined ? {} : { extraWeights: { ...value.riskPolicy.extraWeights } }) }, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) }; }
function freeze(value) { const copy = clone(value); return Object.freeze({ ...copy, profiles: Object.freeze(copy.profiles.map((profile) => Object.freeze(profile))), riskPolicy: Object.freeze({ ...copy.riskPolicy, ...(copy.riskPolicy.extraWeights === undefined ? {} : { extraWeights: Object.freeze(copy.riskPolicy.extraWeights) }) }) }); }
//# sourceMappingURL=orchestration-configuration.js.map