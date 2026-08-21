export const EXECUTION_PROVIDERS = ["claude", "codex"] as const;

export type ExecutionProvider = typeof EXECUTION_PROVIDERS[number];

export const EXECUTION_CAPABILITIES = [
  "inspect_workspace",
  "modify_workspace",
  "run_commands",
  "read_pipeline",
] as const;

export type ExecutionCapability = typeof EXECUTION_CAPABILITIES[number];

export const EXECUTION_PERMISSIONS = [
  "read_workspace",
  "write_workspace",
  "shell",
  "network",
] as const;

export type ExecutionPermission = typeof EXECUTION_PERMISSIONS[number];

export const EXECUTION_RECORD_STATUSES = [
  "planned",
  "running",
  "awaiting_approval",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "rejected",
] as const;

export type ExecutionRecordStatus = typeof EXECUTION_RECORD_STATUSES[number];

export const EXECUTION_ATTEMPT_STATUSES = [
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "interrupted",
  "rejected",
] as const;

export type ExecutionAttemptStatus = typeof EXECUTION_ATTEMPT_STATUSES[number];

export function isExecutionProvider(value: unknown): value is ExecutionProvider {
  return typeof value === "string" && (EXECUTION_PROVIDERS as readonly string[]).includes(value);
}

export function isExecutionCapability(value: unknown): value is ExecutionCapability {
  return typeof value === "string" && (EXECUTION_CAPABILITIES as readonly string[]).includes(value);
}

export function isExecutionPermission(value: unknown): value is ExecutionPermission {
  return typeof value === "string" && (EXECUTION_PERMISSIONS as readonly string[]).includes(value);
}

export function isExecutionRecordStatus(value: unknown): value is ExecutionRecordStatus {
  return typeof value === "string" && (EXECUTION_RECORD_STATUSES as readonly string[]).includes(value);
}

export function isExecutionAttemptStatus(value: unknown): value is ExecutionAttemptStatus {
  return typeof value === "string" && (EXECUTION_ATTEMPT_STATUSES as readonly string[]).includes(value);
}
