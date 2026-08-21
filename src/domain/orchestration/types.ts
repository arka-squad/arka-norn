export const EXECUTION_PROVIDERS = ["claude", "codex", "kimi", "zai"] as const;

export type ExecutionProvider = typeof EXECUTION_PROVIDERS[number];

/**
 * Transport selected by Arka's control plane. It is deliberately separate
 * from a provider name so a persisted execution remains explicit about the
 * integration contract it was dispatched through.
 */
export const EXECUTION_ADAPTERS = ["claude-sdk", "acp"] as const;

export type ExecutionAdapter = typeof EXECUTION_ADAPTERS[number];

export const EXECUTION_TARGET_SOURCES = ["user", "legacy"] as const;

export type ExecutionTargetSource = typeof EXECUTION_TARGET_SOURCES[number];

export interface ExecutionTarget {
  readonly provider: ExecutionProvider;
  readonly adapter: ExecutionAdapter;
  /** A model is mandatory for a new user-confirmed mission and absent for v1 migrations. */
  readonly model?: string;
  readonly source: ExecutionTargetSource;
}

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

export function isExecutionAdapter(value: unknown): value is ExecutionAdapter {
  return typeof value === "string" && (EXECUTION_ADAPTERS as readonly string[]).includes(value);
}

export function isExecutionTargetSource(value: unknown): value is ExecutionTargetSource {
  return typeof value === "string" && (EXECUTION_TARGET_SOURCES as readonly string[]).includes(value);
}

export function canonicalExecutionAdapter(provider: ExecutionProvider): ExecutionAdapter {
  return provider === "claude" || provider === "zai" ? "claude-sdk" : "acp";
}

export function isExecutionModelId(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/.test(value)
    && !containsCredentialLikeText(value);
}

export function isExecutionTarget(value: unknown): value is ExecutionTarget {
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

export function userExecutionTarget(provider: ExecutionProvider, model: string): ExecutionTarget {
  const target: ExecutionTarget = {
    provider,
    adapter: canonicalExecutionAdapter(provider),
    model,
    source: "user",
  };
  if (!isExecutionTarget(target)) throw new TypeError("execution target is invalid");
  return Object.freeze({ ...target });
}

export function legacyExecutionTarget(provider: ExecutionProvider): ExecutionTarget {
  return Object.freeze({
    provider,
    adapter: canonicalExecutionAdapter(provider),
    source: "legacy",
  });
}

export function sameExecutionTarget(left: ExecutionTarget, right: ExecutionTarget): boolean {
  return left.provider === right.provider
    && left.adapter === right.adapter
    && left.model === right.model
    && left.source === right.source;
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

function containsCredentialLikeText(value: string): boolean {
  return /(?:api[_ -]?key|access[_ -]?token|token|auth(?:orization)?|password|secret)\s*[:=]|\bBearer\s+[a-z0-9._-]{12,}\b|\bsk-[a-z0-9_-]{12,}\b|\bAKIA[0-9A-Z]{16}\b/i.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}
