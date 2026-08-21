import { ProjectId } from "../project/project-id.js";

import { InvalidExecutionPolicyError } from "./errors.js";
import {
  isExecutionCapability,
  isExecutionPermission,
  isExecutionProvider,
  type ExecutionCapability,
  type ExecutionPermission,
  type ExecutionProvider,
} from "./types.js";

export const EXECUTION_POLICY_SCHEMA_VERSION = 1 as const;

export interface ProviderExecutionPolicy {
  readonly provider: ExecutionProvider;
  readonly enabled: boolean;
  readonly priority: number;
  readonly capabilities: readonly ExecutionCapability[];
  readonly permissions: readonly ExecutionPermission[];
}

export interface ExecutionPolicyProps {
  readonly schemaVersion: typeof EXECUTION_POLICY_SCHEMA_VERSION;
  readonly projectId: ProjectId;
  readonly providers: readonly ProviderExecutionPolicy[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ExecutionRequirements {
  readonly capabilities: readonly ExecutionCapability[];
  readonly permissions: readonly ExecutionPermission[];
}

export interface ExecutionProviderHealth {
  readonly provider: ExecutionProvider;
  readonly healthy: boolean;
  readonly capabilities: readonly ExecutionCapability[];
}

export type ProviderIneligibility =
  | "not_allowed"
  | "disabled"
  | "unhealthy"
  | "missing_capability"
  | "missing_permission";

export interface ProviderEligibility {
  readonly provider: ExecutionProvider;
  readonly eligible: boolean;
  readonly reasons: readonly ProviderIneligibility[];
  readonly priority?: number;
}

export interface ExecutionProviderSelection {
  readonly selected: ExecutionProvider | undefined;
  readonly candidates: readonly ProviderEligibility[];
}

/**
 * Project-owned routing and permission policy. It deliberately has no
 * credential, process, session, budget or runtime-worker fields.
 */
export class ExecutionPolicy {
  public readonly schemaVersion: typeof EXECUTION_POLICY_SCHEMA_VERSION;
  public readonly projectId: ProjectId;
  public readonly providers: readonly ProviderExecutionPolicy[];
  private readonly createdAtValue: Date;
  private readonly updatedAtValue: Date;

  private constructor(props: ExecutionPolicyProps) {
    this.schemaVersion = props.schemaVersion;
    this.projectId = props.projectId;
    this.providers = freezeProviders(props.providers);
    this.createdAtValue = new Date(props.createdAt.getTime());
    this.updatedAtValue = new Date(props.updatedAt.getTime());
  }

  public static create(props: ExecutionPolicyProps): ExecutionPolicy {
    validatePolicyProps(props);
    return new ExecutionPolicy(props);
  }

  public static defaultFor(projectId: ProjectId, at: Date): ExecutionPolicy {
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

  public get createdAt(): Date {
    return new Date(this.createdAtValue.getTime());
  }

  public get updatedAt(): Date {
    return new Date(this.updatedAtValue.getTime());
  }

  public allows(provider: ExecutionProvider, requirements: ExecutionRequirements): boolean {
    const policy = this.providers.find((candidate) => candidate.provider === provider);
    return policy !== undefined
      && policy.enabled
      && includesAll(policy.capabilities, requirements.capabilities)
      && includesAll(policy.permissions, requirements.permissions);
  }

  public withProviders(providers: readonly ProviderExecutionPolicy[], updatedAt: Date): ExecutionPolicy {
    return ExecutionPolicy.create({
      schemaVersion: this.schemaVersion,
      projectId: this.projectId,
      providers,
      createdAt: this.createdAt,
      updatedAt,
    });
  }

  public toProps(): ExecutionPolicyProps {
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
export function selectBestEligibleProvider(
  policy: ExecutionPolicy,
  requirements: ExecutionRequirements,
  health: readonly ExecutionProviderHealth[],
): ExecutionProviderSelection {
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

export function validateExecutionRequirements(value: ExecutionRequirements): void {
  validateRequirements(value);
}

function defaultProviderPolicy(provider: ExecutionProvider, priority: number): ProviderExecutionPolicy {
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

function validatePolicyProps(props: ExecutionPolicyProps): void {
  if (props.schemaVersion !== EXECUTION_POLICY_SCHEMA_VERSION) {
    throw new InvalidExecutionPolicyError("schemaVersion must be 1");
  }
  if (!(props.projectId instanceof ProjectId)) throw new InvalidExecutionPolicyError("projectId must be a ProjectId");
  validateDate(props.createdAt, "createdAt");
  validateDate(props.updatedAt, "updatedAt");
  if (props.updatedAt.getTime() < props.createdAt.getTime()) {
    throw new InvalidExecutionPolicyError("updatedAt must not precede createdAt");
  }
  const providers: unknown = props.providers;
  if (!isUnknownArray(providers) || providers.length === 0 || providers.length > 2) {
    throw new InvalidExecutionPolicyError("providers must contain one or two supported providers");
  }
  const seen = new Set<ExecutionProvider>();
  for (const provider of providers) {
    validateProviderPolicy(provider);
    if (seen.has(provider.provider)) throw new InvalidExecutionPolicyError(`duplicate provider ${provider.provider}`);
    seen.add(provider.provider);
  }
}

function validateProviderPolicy(value: unknown): asserts value is ProviderExecutionPolicy {
  if (!isRecord(value)) throw new InvalidExecutionPolicyError("provider policy must be an object");
  const provider = value["provider"];
  if (!isExecutionProvider(provider)) throw new InvalidExecutionPolicyError("provider is unsupported");
  if (typeof value["enabled"] !== "boolean") throw new InvalidExecutionPolicyError(`${provider}.enabled must be boolean`);
  const priority = value["priority"];
  if (typeof priority !== "number" || !Number.isInteger(priority) || priority < 0 || priority > 1000) {
    throw new InvalidExecutionPolicyError(`${provider}.priority must be an integer between 0 and 1000`);
  }
  validateUniqueEnumArray(value["capabilities"], isExecutionCapability, `${provider}.capabilities`);
  validateUniqueEnumArray(value["permissions"], isExecutionPermission, `${provider}.permissions`);
}

function validateRequirements(value: ExecutionRequirements): void {
  validateUniqueEnumArray(value.capabilities as unknown, isExecutionCapability, "requirements.capabilities");
  validateUniqueEnumArray(value.permissions as unknown, isExecutionPermission, "requirements.permissions");
}

function validateHealth(health: readonly ExecutionProviderHealth[]): void {
  const seen = new Set<ExecutionProvider>();
  for (const entry of health) {
    if (!isExecutionProvider(entry.provider)) throw new InvalidExecutionPolicyError("health provider is unsupported");
    if (typeof entry.healthy !== "boolean") throw new InvalidExecutionPolicyError(`${entry.provider}.healthy must be boolean`);
    validateUniqueEnumArray(entry.capabilities as unknown, isExecutionCapability, `${entry.provider}.capabilities`);
    if (seen.has(entry.provider)) throw new InvalidExecutionPolicyError(`duplicate health entry for ${entry.provider}`);
    seen.add(entry.provider);
  }
}

function eligibilityFor(
  provider: ProviderExecutionPolicy,
  requirements: ExecutionRequirements,
  health: ExecutionProviderHealth | undefined,
): ProviderEligibility {
  const reasons: ProviderIneligibility[] = [];
  if (!provider.enabled) reasons.push("disabled");
  if (health === undefined) reasons.push("not_allowed");
  else {
    if (!health.healthy) reasons.push("unhealthy");
    if (!includesAll(provider.capabilities, requirements.capabilities) || !includesAll(health.capabilities, requirements.capabilities)) {
      reasons.push("missing_capability");
    }
  }
  if (!includesAll(provider.permissions, requirements.permissions)) reasons.push("missing_permission");
  return {
    provider: provider.provider,
    eligible: reasons.length === 0,
    reasons,
    priority: provider.priority,
  };
}

function compareEligibility(left: ProviderEligibility, right: ProviderEligibility): number {
  if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
  const priority = (right.priority ?? -1) - (left.priority ?? -1);
  return priority === 0 ? left.provider.localeCompare(right.provider) : priority;
}

function includesAll<T>(allowed: readonly T[], required: readonly T[]): boolean {
  const values = new Set(allowed);
  return required.every((entry) => values.has(entry));
}

function validateUniqueEnumArray<T extends string>(
  value: unknown,
  predicate: (entry: unknown) => entry is T,
  field: string,
): asserts value is readonly T[] {
  if (!isUnknownArray(value) || value.some((entry) => !predicate(entry)) || new Set(value).size !== value.length) {
    throw new InvalidExecutionPolicyError(`${field} must be a unique array of supported values`);
  }
}

function isUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateDate(value: Date, field: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new InvalidExecutionPolicyError(`${field} must be a valid date`);
  }
}

function cloneProviders(providers: readonly ProviderExecutionPolicy[]): readonly ProviderExecutionPolicy[] {
  return providers.map((provider) => ({
    provider: provider.provider,
    enabled: provider.enabled,
    priority: provider.priority,
    capabilities: [...provider.capabilities],
    permissions: [...provider.permissions],
  }));
}

function freezeProviders(providers: readonly ProviderExecutionPolicy[]): readonly ProviderExecutionPolicy[] {
  return Object.freeze([...cloneProviders(providers)]
    .sort((left, right) => left.provider.localeCompare(right.provider))
    .map((provider) => Object.freeze({
      ...provider,
      capabilities: Object.freeze([...provider.capabilities]),
      permissions: Object.freeze([...provider.permissions]),
    })));
}

function freezeEligibility(candidates: readonly ProviderEligibility[]): readonly ProviderEligibility[] {
  return Object.freeze(candidates.map((candidate) => Object.freeze({
    ...candidate,
    reasons: Object.freeze([...candidate.reasons]),
  })));
}
