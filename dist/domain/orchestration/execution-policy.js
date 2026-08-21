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
import { ProjectId } from "../project/project-id.js";
import { InvalidExecutionPolicyError } from "./errors.js";
import { canonicalExecutionAdapter, isExecutionAdapter, isExecutionCapability, isExecutionModelId, isExecutionPermission, isExecutionProvider, isExecutionTarget, userExecutionTarget, } from "./types.js";
export const EXECUTION_POLICY_SCHEMA_VERSION = 2;
export const EXECUTION_SELECTION_MODES = ["assisted", "best"];
/**
 * Project-owned routing and permission policy. It deliberately has no
 * credential, process, session, budget or runtime-worker fields.
 */
export class ExecutionPolicy {
    schemaVersion;
    projectId;
    selectionMode;
    providers;
    createdAtValue;
    updatedAtValue;
    constructor(props) {
        this.schemaVersion = props.schemaVersion;
        this.projectId = props.projectId;
        this.selectionMode = props.selectionMode;
        this.providers = freezeProviders(props.providers);
        this.createdAtValue = new Date(props.createdAt.getTime());
        this.updatedAtValue = new Date(props.updatedAt.getTime());
    }
    static create(props) {
        validatePolicyProps(props);
        return new ExecutionPolicy(props);
    }
    static defaultFor(projectId, at) {
        return ExecutionPolicy.create({
            schemaVersion: EXECUTION_POLICY_SCHEMA_VERSION,
            projectId,
            selectionMode: "assisted",
            providers: [
                defaultProviderPolicy("claude", 40, true),
                defaultProviderPolicy("codex", 30, true),
                defaultProviderPolicy("kimi", 20, false),
                defaultProviderPolicy("zai", 10, false),
            ],
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
    /**
     * Legacy provider-level check retained for callers that do not yet have a
     * user-confirmed model. New dispatch paths must use `allowsTarget`.
     */
    allows(provider, requirements) {
        const policy = this.providers.find((candidate) => candidate.provider === provider);
        return policy !== undefined
            && policy.enabled
            && includesAll(policy.capabilities, requirements.capabilities)
            && includesAll(policy.permissions, requirements.permissions);
    }
    allowsTarget(target, requirements) {
        if (!isExecutionTarget(target) || target.source !== "user" || target.model === undefined)
            return false;
        const provider = this.providers.find((candidate) => candidate.provider === target.provider);
        if (provider === undefined
            || !provider.enabled
            || provider.adapter !== target.adapter
            || !includesAll(provider.capabilities, requirements.capabilities)
            || !includesAll(provider.permissions, requirements.permissions)) {
            return false;
        }
        return provider.models.some((model) => model.id === target.model && model.enabled);
    }
    withProviders(providers, updatedAt) {
        return ExecutionPolicy.create({
            schemaVersion: this.schemaVersion,
            projectId: this.projectId,
            selectionMode: this.selectionMode,
            providers,
            createdAt: this.createdAt,
            updatedAt,
        });
    }
    withSelectionMode(selectionMode, updatedAt) {
        return ExecutionPolicy.create({
            schemaVersion: this.schemaVersion,
            projectId: this.projectId,
            selectionMode,
            providers: this.providers,
            createdAt: this.createdAt,
            updatedAt,
        });
    }
    toProps() {
        return {
            schemaVersion: this.schemaVersion,
            projectId: this.projectId,
            selectionMode: this.selectionMode,
            providers: cloneProviders(this.providers),
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }
}
/**
 * Selects once, before dispatch. The returned provider is meant to be stored
 * in the immutable execution record; retries keep that provider and never
 * call this selector as a fallback mechanism.
 *
 * @deprecated New flows must call selectBestEligibleTarget after the user has
 * selected both a provider and a model.
 */
export function selectBestEligibleProvider(policy, requirements, health) {
    validateRequirements(requirements);
    validateProviderHealth(health);
    const healthByProvider = new Map(health.map((entry) => [entry.provider, entry]));
    const candidates = policy.providers
        .map((provider) => providerEligibilityFor(provider, requirements, healthByProvider.get(provider.provider)))
        .sort(compareProviderEligibility);
    const selected = candidates.find((candidate) => candidate.eligible)?.provider;
    return { selected, candidates: freezeProviderEligibility(candidates) };
}
/**
 * Deterministic target selection for a preview. The caller still requires an
 * explicit user choice in assisted mode; this function only supplies the
 * explainable recommendation and all rejection reasons.
 */
export function selectBestEligibleTarget(policy, requirements, health) {
    validateRequirements(requirements);
    validateTargetHealth(health);
    const healthByTarget = new Map(health.map((entry) => [targetKey(entry.target), entry]));
    const candidates = policy.providers.flatMap((provider) => provider.models.map((model) => {
        const target = userExecutionTarget(provider.provider, model.id);
        return targetEligibilityFor(provider, model, target, requirements, healthByTarget.get(targetKey(target)));
    })).sort(compareTargetEligibility);
    const selected = candidates.find((candidate) => candidate.eligible)?.target;
    return { selected, candidates: freezeTargetEligibility(candidates) };
}
export function validateExecutionRequirements(value) {
    validateRequirements(value);
}
function defaultProviderPolicy(provider, priority, enabled) {
    // Codex and Kimi use ACP in V1, whose permission payload is not structured
    // enough to prove a Feature write scope. Z.AI uses the same bounded Claude
    // worker as Claude; it is disabled by default, but its declared policy can
    // explicitly allow writes without a later configuration action escalating it.
    const readOnly = provider === "codex" || provider === "kimi";
    return {
        provider,
        adapter: canonicalExecutionAdapter(provider),
        enabled,
        priority,
        capabilities: readOnly
            ? ["inspect_workspace", "read_pipeline"]
            : ["inspect_workspace", "modify_workspace", "read_pipeline"],
        permissions: readOnly ? ["read_workspace"] : ["read_workspace", "write_workspace"],
        models: [],
    };
}
function validatePolicyProps(props) {
    if (props.schemaVersion !== EXECUTION_POLICY_SCHEMA_VERSION) {
        throw new InvalidExecutionPolicyError("schemaVersion must be 2");
    }
    if (!(props.projectId instanceof ProjectId))
        throw new InvalidExecutionPolicyError("projectId must be a ProjectId");
    if (!isExecutionSelectionMode(props.selectionMode))
        throw new InvalidExecutionPolicyError("selectionMode is unsupported");
    validateDate(props.createdAt, "createdAt");
    validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
        throw new InvalidExecutionPolicyError("updatedAt must not precede createdAt");
    }
    const providers = props.providers;
    if (!isUnknownArray(providers) || providers.length === 0 || providers.length > 4) {
        throw new InvalidExecutionPolicyError("providers must contain one to four supported providers");
    }
    const seen = new Set();
    for (const provider of providers) {
        validateProviderPolicy(provider);
        if (seen.has(provider.provider))
            throw new InvalidExecutionPolicyError(`duplicate provider ${provider.provider}`);
        seen.add(provider.provider);
    }
}
function validateProviderPolicy(value) {
    if (!isRecord(value) || !hasExactKeys(value, ["provider", "adapter", "enabled", "priority", "capabilities", "permissions", "models"])) {
        throw new InvalidExecutionPolicyError("provider policy must contain only supported fields");
    }
    const provider = value["provider"];
    if (!isExecutionProvider(provider))
        throw new InvalidExecutionPolicyError("provider is unsupported");
    if (!isExecutionAdapter(value["adapter"]) || value["adapter"] !== canonicalExecutionAdapter(provider)) {
        throw new InvalidExecutionPolicyError(`${provider}.adapter is incompatible`);
    }
    if (typeof value["enabled"] !== "boolean")
        throw new InvalidExecutionPolicyError(`${provider}.enabled must be boolean`);
    validatePriority(value["priority"], `${provider}.priority`);
    validateUniqueEnumArray(value["capabilities"], isExecutionCapability, `${provider}.capabilities`);
    validateUniqueEnumArray(value["permissions"], isExecutionPermission, `${provider}.permissions`);
    validateModelPolicies(value["models"], provider);
}
function validateModelPolicies(value, provider) {
    if (!isUnknownArray(value) || value.length > 32) {
        throw new InvalidExecutionPolicyError(`${provider}.models must contain at most 32 entries`);
    }
    const ids = new Set();
    for (const model of value) {
        if (!isRecord(model)
            || !hasExactKeys(model, ["id", "enabled", "priority"])
            || !isExecutionModelId(model["id"])
            || typeof model["enabled"] !== "boolean") {
            throw new InvalidExecutionPolicyError(`${provider}.models must contain valid model policies`);
        }
        validatePriority(model["priority"], `${provider}.models.priority`);
        if (ids.has(model["id"]))
            throw new InvalidExecutionPolicyError(`duplicate model ${model["id"]} for ${provider}`);
        ids.add(model["id"]);
    }
}
function validatePriority(value, field) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 1000) {
        throw new InvalidExecutionPolicyError(`${field} must be an integer between 0 and 1000`);
    }
}
function validateRequirements(value) {
    validateUniqueEnumArray(value.capabilities, isExecutionCapability, "requirements.capabilities");
    validateUniqueEnumArray(value.permissions, isExecutionPermission, "requirements.permissions");
}
function validateProviderHealth(health) {
    const seen = new Set();
    for (const entry of health) {
        if (!isExecutionProvider(entry.provider))
            throw new InvalidExecutionPolicyError("health provider is unsupported");
        if (typeof entry.healthy !== "boolean")
            throw new InvalidExecutionPolicyError(`${entry.provider}.healthy must be boolean`);
        validateUniqueEnumArray(entry.capabilities, isExecutionCapability, `${entry.provider}.capabilities`);
        if (seen.has(entry.provider))
            throw new InvalidExecutionPolicyError(`duplicate health entry for ${entry.provider}`);
        seen.add(entry.provider);
    }
}
function validateTargetHealth(health) {
    const seen = new Set();
    for (const entry of health) {
        if (!isExecutionTarget(entry.target) || entry.target.source !== "user") {
            throw new InvalidExecutionPolicyError("health target is invalid");
        }
        if (typeof entry.healthy !== "boolean")
            throw new InvalidExecutionPolicyError("target health must be boolean");
        validateUniqueEnumArray(entry.capabilities, isExecutionCapability, "target health capabilities");
        const key = targetKey(entry.target);
        if (seen.has(key))
            throw new InvalidExecutionPolicyError(`duplicate health entry for ${key}`);
        seen.add(key);
    }
}
function providerEligibilityFor(provider, requirements, health) {
    const reasons = [];
    if (!provider.enabled)
        reasons.push("disabled");
    if (health === undefined)
        reasons.push("not_allowed");
    else {
        if (!health.healthy)
            reasons.push("unhealthy");
        if (!includesAll(provider.capabilities, requirements.capabilities) || !includesAll(health.capabilities, requirements.capabilities)) {
            reasons.push("missing_capability");
        }
    }
    if (!includesAll(provider.permissions, requirements.permissions))
        reasons.push("missing_permission");
    return {
        provider: provider.provider,
        eligible: reasons.length === 0,
        reasons,
        priority: provider.priority,
    };
}
function targetEligibilityFor(provider, model, target, requirements, health) {
    const reasons = [];
    if (!provider.enabled)
        reasons.push("disabled");
    if (!model.enabled)
        reasons.push("model_disabled");
    if (health === undefined)
        reasons.push("not_allowed");
    else {
        if (!health.healthy)
            reasons.push("unhealthy");
        if (!includesAll(provider.capabilities, requirements.capabilities) || !includesAll(health.capabilities, requirements.capabilities)) {
            reasons.push("missing_capability");
        }
    }
    if (!includesAll(provider.permissions, requirements.permissions))
        reasons.push("missing_permission");
    return {
        target,
        eligible: reasons.length === 0,
        reasons,
        providerPriority: provider.priority,
        modelPriority: model.priority,
    };
}
function compareProviderEligibility(left, right) {
    if (left.eligible !== right.eligible)
        return left.eligible ? -1 : 1;
    const priority = (right.priority ?? -1) - (left.priority ?? -1);
    return priority === 0 ? left.provider.localeCompare(right.provider) : priority;
}
function compareTargetEligibility(left, right) {
    if (left.eligible !== right.eligible)
        return left.eligible ? -1 : 1;
    const providerPriority = right.providerPriority - left.providerPriority;
    if (providerPriority !== 0)
        return providerPriority;
    const modelPriority = right.modelPriority - left.modelPriority;
    if (modelPriority !== 0)
        return modelPriority;
    const provider = left.target.provider.localeCompare(right.target.provider);
    return provider === 0 ? left.target.model.localeCompare(right.target.model) : provider;
}
function includesAll(allowed, required) {
    const values = new Set(allowed);
    return required.every((entry) => values.has(entry));
}
function validateUniqueEnumArray(value, predicate, field) {
    if (!isUnknownArray(value) || value.some((entry) => !predicate(entry)) || new Set(value).size !== value.length) {
        throw new InvalidExecutionPolicyError(`${field} must be a unique array of supported values`);
    }
}
export function isExecutionSelectionMode(value) {
    return typeof value === "string" && EXECUTION_SELECTION_MODES.includes(value);
}
function isUnknownArray(value) {
    return Array.isArray(value);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    const expectedKeys = [...expected].sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}
function validateDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new InvalidExecutionPolicyError(`${field} must be a valid date`);
    }
}
function cloneProviders(providers) {
    return providers.map((provider) => ({
        provider: provider.provider,
        adapter: provider.adapter,
        enabled: provider.enabled,
        priority: provider.priority,
        capabilities: [...provider.capabilities],
        permissions: [...provider.permissions],
        models: provider.models.map((model) => ({ ...model })),
    }));
}
function freezeProviders(providers) {
    return Object.freeze([...cloneProviders(providers)]
        .sort((left, right) => left.provider.localeCompare(right.provider))
        .map((provider) => Object.freeze({
        ...provider,
        capabilities: Object.freeze([...provider.capabilities]),
        permissions: Object.freeze([...provider.permissions]),
        models: Object.freeze(provider.models.map((model) => Object.freeze({ ...model }))),
    })));
}
function freezeProviderEligibility(candidates) {
    return Object.freeze(candidates.map((candidate) => Object.freeze({
        ...candidate,
        reasons: Object.freeze([...candidate.reasons]),
    })));
}
function freezeTargetEligibility(candidates) {
    return Object.freeze(candidates.map((candidate) => Object.freeze({
        ...candidate,
        target: Object.freeze({ ...candidate.target }),
        reasons: Object.freeze([...candidate.reasons]),
    })));
}
function targetKey(target) {
    return `${target.provider}\u0000${target.adapter}\u0000${target.model ?? ""}`;
}
//# sourceMappingURL=execution-policy.js.map