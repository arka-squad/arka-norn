export const EXECUTION_PROVIDERS = ["claude", "codex", "kimi", "zai"];
/**
 * Transport selected by Arka's control plane. It is deliberately separate
 * from a provider name so a persisted execution remains explicit about the
 * integration contract it was dispatched through.
 */
export const EXECUTION_ADAPTERS = ["claude-sdk", "acp"];
export const EXECUTION_TARGET_SOURCES = ["user", "legacy"];
export const EXECUTION_CAPABILITIES = [
    "inspect_workspace",
    "modify_workspace",
    "run_commands",
    "read_pipeline",
];
export const EXECUTION_PERMISSIONS = [
    "read_workspace",
    "write_workspace",
    "shell",
    "network",
];
export const EXECUTION_RECORD_STATUSES = [
    "planned",
    "running",
    "awaiting_approval",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
    "rejected",
];
export const EXECUTION_ATTEMPT_STATUSES = [
    "running",
    "succeeded",
    "failed",
    "cancelled",
    "interrupted",
    "rejected",
];
export function isExecutionProvider(value) {
    return typeof value === "string" && EXECUTION_PROVIDERS.includes(value);
}
export function isExecutionAdapter(value) {
    return typeof value === "string" && EXECUTION_ADAPTERS.includes(value);
}
export function isExecutionTargetSource(value) {
    return typeof value === "string" && EXECUTION_TARGET_SOURCES.includes(value);
}
export function canonicalExecutionAdapter(provider) {
    return provider === "claude" || provider === "zai" ? "claude-sdk" : "acp";
}
export function isExecutionModelId(value) {
    return typeof value === "string"
        && value.trim().length > 0
        && value.length <= 256
        && !/[\u0000-\u001f\u007f]/.test(value)
        && !containsCredentialLikeText(value);
}
export function isExecutionTarget(value) {
    if (!isRecord(value)
        || !isExecutionProvider(value["provider"])
        || !isExecutionAdapter(value["adapter"])
        || !isExecutionTargetSource(value["source"])
        || value["adapter"] !== canonicalExecutionAdapter(value["provider"])) {
        return false;
    }
    if (value["source"] === "user") {
        return hasExactKeys(value, ["provider", "adapter", "model", "source"])
            && isExecutionModelId(value["model"]);
    }
    return hasExactKeys(value, ["provider", "adapter", "source"]) && value["model"] === undefined;
}
export function userExecutionTarget(provider, model) {
    const target = {
        provider,
        adapter: canonicalExecutionAdapter(provider),
        model,
        source: "user",
    };
    if (!isExecutionTarget(target))
        throw new TypeError("execution target is invalid");
    return Object.freeze({ ...target });
}
export function legacyExecutionTarget(provider) {
    return Object.freeze({
        provider,
        adapter: canonicalExecutionAdapter(provider),
        source: "legacy",
    });
}
export function sameExecutionTarget(left, right) {
    return left.provider === right.provider
        && left.adapter === right.adapter
        && left.model === right.model
        && left.source === right.source;
}
export function isExecutionCapability(value) {
    return typeof value === "string" && EXECUTION_CAPABILITIES.includes(value);
}
export function isExecutionPermission(value) {
    return typeof value === "string" && EXECUTION_PERMISSIONS.includes(value);
}
export function isExecutionRecordStatus(value) {
    return typeof value === "string" && EXECUTION_RECORD_STATUSES.includes(value);
}
export function isExecutionAttemptStatus(value) {
    return typeof value === "string" && EXECUTION_ATTEMPT_STATUSES.includes(value);
}
function containsCredentialLikeText(value) {
    return /(?:api[_ -]?key|access[_ -]?token|token|auth(?:orization)?|password|secret)\s*[:=]|\bBearer\s+[a-z0-9._-]{12,}\b|\bsk-[a-z0-9_-]{12,}\b|\bAKIA[0-9A-Z]{16}\b/i.test(value);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function hasExactKeys(value, expected) {
    const keys = Object.keys(value).sort();
    const expectedKeys = [...expected].sort();
    return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}
//# sourceMappingURL=types.js.map