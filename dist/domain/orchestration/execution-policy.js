import { ProjectId } from "../project/project-id.js";
import { InvalidExecutionPolicyError } from "./errors.js";
import { isExecutionCapability, isExecutionPermission, isExecutionProvider, } from "./types.js";
export const EXECUTION_POLICY_SCHEMA_VERSION = 1;
/**
 * Project-owned routing and permission policy. It deliberately has no
 * credential, process, session, budget or runtime-worker fields.
 */
export class ExecutionPolicy {
    schemaVersion;
    projectId;
    providers;
    createdAtValue;
    updatedAtValue;
    constructor(props) {
        this.schemaVersion = props.schemaVersion;
        this.projectId = props.projectId;
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
            providers: [
                defaultProviderPolicy("claude", 20),
                defaultProviderPolicy("codex", 10),
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
    allows(provider, requirements) {
        const policy = this.providers.find((candidate) => candidate.provider === provider);
        return policy !== undefined
            && policy.enabled
            && includesAll(policy.capabilities, requirements.capabilities)
            && includesAll(policy.permissions, requirements.permissions);
    }
    withProviders(providers, updatedAt) {
        return ExecutionPolicy.create({
            schemaVersion: this.schemaVersion,
            projectId: this.projectId,
            providers,
            createdAt: this.createdAt,
            updatedAt,
        });
    }
    toProps() {
        return {
            schemaVersion: this.schemaVersion,
            projectId: this.projectId,
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
 */
export function selectBestEligibleProvider(policy, requirements, health) {
    validateRequirements(requirements);
    validateHealth(health);
    const healthByProvider = new Map(health.map((entry) => [entry.provider, entry]));
    const candidates = policy.providers
        .map((provider) => eligibilityFor(provider, requirements, healthByProvider.get(provider.provider)))
        .sort(compareEligibility);
    const eligible = candidates.filter((candidate) => candidate.eligible);
    const selected = eligible[0]?.provider;
    return { selected, candidates: freezeEligibility(candidates) };
}
export function validateExecutionRequirements(value) {
    validateRequirements(value);
}
function defaultProviderPolicy(provider, priority) {
    return {
        provider,
        enabled: true,
        priority,
        // A persisted default is an authorization boundary. It must not advertise
        // shell or command execution merely because the broader domain can model
        // them for a future, separately sandboxed adapter.
        capabilities: ["inspect_workspace", "modify_workspace", "read_pipeline"],
        permissions: ["read_workspace", "write_workspace"],
    };
}
function validatePolicyProps(props) {
    if (props.schemaVersion !== EXECUTION_POLICY_SCHEMA_VERSION) {
        throw new InvalidExecutionPolicyError("schemaVersion must be 1");
    }
    if (!(props.projectId instanceof ProjectId))
        throw new InvalidExecutionPolicyError("projectId must be a ProjectId");
    validateDate(props.createdAt, "createdAt");
    validateDate(props.updatedAt, "updatedAt");
    if (props.updatedAt.getTime() < props.createdAt.getTime()) {
        throw new InvalidExecutionPolicyError("updatedAt must not precede createdAt");
    }
    const providers = props.providers;
    if (!isUnknownArray(providers) || providers.length === 0 || providers.length > 2) {
        throw new InvalidExecutionPolicyError("providers must contain one or two supported providers");
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
    if (!isRecord(value))
        throw new InvalidExecutionPolicyError("provider policy must be an object");
    const provider = value["provider"];
    if (!isExecutionProvider(provider))
        throw new InvalidExecutionPolicyError("provider is unsupported");
    if (typeof value["enabled"] !== "boolean")
        throw new InvalidExecutionPolicyError(`${provider}.enabled must be boolean`);
    const priority = value["priority"];
    if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 1000) {
        throw new InvalidExecutionPolicyError(`${provider}.priority must be an integer between 0 and 1000`);
    }
    validateUniqueEnumArray(value["capabilities"], isExecutionCapability, `${provider}.capabilities`);
    validateUniqueEnumArray(value["permissions"], isExecutionPermission, `${provider}.permissions`);
}
function validateRequirements(value) {
    validateUniqueEnumArray(value.capabilities, isExecutionCapability, "requirements.capabilities");
    validateUniqueEnumArray(value.permissions, isExecutionPermission, "requirements.permissions");
}
function validateHealth(health) {
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
function eligibilityFor(provider, requirements, health) {
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
function compareEligibility(left, right) {
    if (left.eligible !== right.eligible)
        return left.eligible ? -1 : 1;
    const priority = (right.priority ?? -1) - (left.priority ?? -1);
    return priority === 0 ? left.provider.localeCompare(right.provider) : priority;
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
function isUnknownArray(value) {
    return Array.isArray(value);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function validateDate(value, field) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
        throw new InvalidExecutionPolicyError(`${field} must be a valid date`);
    }
}
function cloneProviders(providers) {
    return providers.map((provider) => ({
        provider: provider.provider,
        enabled: provider.enabled,
        priority: provider.priority,
        capabilities: [...provider.capabilities],
        permissions: [...provider.permissions],
    }));
}
function freezeProviders(providers) {
    return Object.freeze([...cloneProviders(providers)]
        .sort((left, right) => left.provider.localeCompare(right.provider))
        .map((provider) => Object.freeze({
        ...provider,
        capabilities: Object.freeze([...provider.capabilities]),
        permissions: Object.freeze([...provider.permissions]),
    })));
}
function freezeEligibility(candidates) {
    return Object.freeze(candidates.map((candidate) => Object.freeze({
        ...candidate,
        reasons: Object.freeze([...candidate.reasons]),
    })));
}
//# sourceMappingURL=execution-policy.js.map