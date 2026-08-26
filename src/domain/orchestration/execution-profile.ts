/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { ExecutionCapability } from "./types.js";

export const EXECUTION_PROFILE_SCHEMA_VERSION = 1 as const;
export const EXECUTION_TRANSPORTS = ["codex-cli", "claude-cli", "gemini-cli", "api"] as const;
export const CREDENTIAL_REFERENCE_KINDS = ["environment", "keychain"] as const;
export const COST_METER_KINDS = ["cli_quota_percent", "currency_eur", "calls", "duration_seconds", "unknown"] as const;
export const ALLOWED_CREDENTIAL_ENVIRONMENT_VARIABLES = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "KIMI_MODEL_API_KEY"] as const;

export type ExecutionTransport = typeof EXECUTION_TRANSPORTS[number];
export type CredentialReferenceKind = typeof CREDENTIAL_REFERENCE_KINDS[number];
export type CostMeterKind = typeof COST_METER_KINDS[number];

export interface GatewayDescriptor {
  readonly kind: string;
  readonly endpoint?: string;
  readonly catalogRef?: string;
  readonly fingerprint: string;
}

export interface CredentialReference {
  readonly kind: CredentialReferenceKind;
  readonly name: string;
  readonly environmentVariable: string;
}

export interface CostMeter {
  readonly kind: CostMeterKind;
  readonly observable: boolean;
}

export interface ExecutionProfileProps {
  readonly schemaVersion: typeof EXECUTION_PROFILE_SCHEMA_VERSION;
  readonly id: string;
  readonly transport: ExecutionTransport;
  readonly gateway?: GatewayDescriptor;
  readonly provider: string;
  readonly model: string;
  readonly credentialRef?: CredentialReference;
  readonly capabilities: readonly ExecutionCapability[];
  readonly egressHosts: readonly string[];
  readonly costMeter: CostMeter;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class ExecutionProfile {
  private constructor(private readonly value: ExecutionProfileProps) {}

  public static create(value: ExecutionProfileProps): ExecutionProfile {
    validate(value);
    return new ExecutionProfile(freeze(value));
  }

  public get id(): string { return this.value.id; }
  public get transport(): ExecutionTransport { return this.value.transport; }
  public get provider(): string { return this.value.provider; }
  public get model(): string { return this.value.model; }
  public get enabled(): boolean { return this.value.enabled; }
  public get props(): ExecutionProfileProps { return clone(this.value); }

  public disable(at: Date): ExecutionProfile {
    return ExecutionProfile.create({ ...this.value, enabled: false, updatedAt: at });
  }
}

export function isExecutionTransport(value: unknown): value is ExecutionTransport {
  return typeof value === "string" && (EXECUTION_TRANSPORTS as readonly string[]).includes(value);
}

export function isCredentialReferenceKind(value: unknown): value is CredentialReferenceKind {
  return typeof value === "string" && (CREDENTIAL_REFERENCE_KINDS as readonly string[]).includes(value);
}

export function isCostMeterKind(value: unknown): value is CostMeterKind {
  return typeof value === "string" && (COST_METER_KINDS as readonly string[]).includes(value);
}

function validate(value: ExecutionProfileProps): void {
  if (value.schemaVersion !== EXECUTION_PROFILE_SCHEMA_VERSION) throw new TypeError("Execution profile schemaVersion must be 1.");
  if (!safeId(value.id, 80)) throw new TypeError("Execution profile id is invalid.");
  if (!isExecutionTransport(value.transport)) throw new TypeError("Execution profile transport is invalid.");
  if (!safeText(value.provider, 128) || !safeText(value.model, 256)) throw new TypeError("Execution profile provider or model is invalid.");
  if (containsCredential(value.provider) || containsCredential(value.model)) throw new TypeError("Execution profile contains credential-like text.");
  if (value.gateway !== undefined) validateGateway(value.gateway);
  if (value.credentialRef !== undefined) validateCredentialReference(value.credentialRef);
  if (new Set(value.capabilities).size !== value.capabilities.length) throw new TypeError("Execution profile capabilities are invalid.");
  if (value.egressHosts.length > 32 || new Set(value.egressHosts).size !== value.egressHosts.length) throw new TypeError("Execution profile egress hosts are invalid.");
  for (const host of value.egressHosts) if (!validHost(host)) throw new TypeError("Execution profile egress host is invalid.");
  if (!isCostMeterKind(value.costMeter.kind) || typeof value.costMeter.observable !== "boolean") throw new TypeError("Execution profile cost meter is invalid.");
  if (typeof value.enabled !== "boolean") throw new TypeError("Execution profile enabled flag is invalid.");
  if (!validDate(value.createdAt) || !validDate(value.updatedAt) || value.updatedAt < value.createdAt) throw new TypeError("Execution profile timestamps are invalid.");
}

function validateGateway(value: GatewayDescriptor): void {
  if (!safeId(value.kind, 80) || !/^[a-f0-9]{64}$/u.test(value.fingerprint)) throw new TypeError("Gateway descriptor is invalid.");
  if (value.endpoint !== undefined) {
    let url: URL;
    try { url = new URL(value.endpoint); } catch { throw new TypeError("Gateway endpoint is invalid."); }
    if (!(["https:", "http:"].includes(url.protocol)) || url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") throw new TypeError("Gateway endpoint is unsafe.");
    if (url.protocol === "http:" && !["localhost", "127.0.0.1", "::1"].includes(url.hostname)) throw new TypeError("Insecure gateway endpoints must be local.");
  }
  if (value.catalogRef !== undefined && (!safeReference(value.catalogRef) || containsCredential(value.catalogRef))) throw new TypeError("Gateway catalog reference is invalid.");
}

function validateCredentialReference(value: CredentialReference): void {
  if (!isCredentialReferenceKind(value.kind) || !safeReference(value.name) || containsCredential(value.name) || !(ALLOWED_CREDENTIAL_ENVIRONMENT_VARIABLES as readonly string[]).includes(value.environmentVariable)) throw new TypeError("Credential reference is invalid.");
}

function validHost(value: string): boolean {
  return value === "localhost" || /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/u.test(value);
}

function safeId(value: string, maximum: number): boolean { return value.length > 0 && value.length <= maximum && /^[a-z0-9][a-z0-9._-]*$/u.test(value); }
function safeText(value: string, maximum: number): boolean { return value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function safeReference(value: string): boolean { return value.length > 0 && value.length <= 512 && !/[\u0000-\u001f\u007f]/u.test(value); }
function validDate(value: Date): boolean { return value instanceof Date && !Number.isNaN(value.getTime()); }
function containsCredential(value: string): boolean { return /(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]|\bBearer\s+|\bsk-[a-z0-9_-]{12,}/iu.test(value); }

function clone(value: ExecutionProfileProps): ExecutionProfileProps {
  return {
    ...value,
    ...(value.gateway === undefined ? {} : { gateway: { ...value.gateway } }),
    ...(value.credentialRef === undefined ? {} : { credentialRef: { ...value.credentialRef } }),
    capabilities: [...value.capabilities],
    egressHosts: [...value.egressHosts],
    costMeter: { ...value.costMeter },
    createdAt: new Date(value.createdAt),
    updatedAt: new Date(value.updatedAt),
  };
}

function freeze(value: ExecutionProfileProps): ExecutionProfileProps {
  const copied = clone(value);
  return Object.freeze({
    ...copied,
    ...(copied.gateway === undefined ? {} : { gateway: Object.freeze(copied.gateway) }),
    ...(copied.credentialRef === undefined ? {} : { credentialRef: Object.freeze(copied.credentialRef) }),
    capabilities: Object.freeze(copied.capabilities),
    egressHosts: Object.freeze(copied.egressHosts),
    costMeter: Object.freeze(copied.costMeter),
  });
}
