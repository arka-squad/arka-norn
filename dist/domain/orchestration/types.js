export const EXECUTION_PROVIDERS = ["claude", "codex"];
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
//# sourceMappingURL=types.js.map