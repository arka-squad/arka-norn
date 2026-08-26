/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { ExecutionProfile, type ExecutionProfileProps } from "./execution-profile.js";
import { GLOBAL_AUTOMATIC_RISK_CEILING, type RiskPolicy } from "./orchestration-risk.js";

export const ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION = 4 as const;

export interface OrchestrationConfigurationProps {
  readonly schemaVersion: typeof ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION;
  readonly projectId: string;
  readonly automaticEnabled: boolean;
  readonly profiles: readonly ExecutionProfileProps[];
  readonly riskPolicy: RiskPolicy;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class OrchestrationConfiguration {
  private constructor(private readonly value: OrchestrationConfigurationProps) {}

  public static create(value: OrchestrationConfigurationProps): OrchestrationConfiguration {
    validate(value);
    return new OrchestrationConfiguration(freeze(value));
  }

  public static empty(projectId: string, at: Date): OrchestrationConfiguration {
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

  public get projectId(): string { return this.value.projectId; }
  public get automaticEnabled(): boolean { return this.value.automaticEnabled; }
  public get profiles(): readonly ExecutionProfile[] { return this.value.profiles.map((profile) => ExecutionProfile.create(profile)); }
  public get props(): OrchestrationConfigurationProps { return clone(this.value); }

  public register(profile: ExecutionProfile, at: Date): OrchestrationConfiguration {
    const profiles = this.value.profiles.filter((candidate) => candidate.id !== profile.id);
    return OrchestrationConfiguration.create({ ...this.value, profiles: [...profiles, profile.props], updatedAt: at });
  }

  public activate(at: Date): OrchestrationConfiguration {
    if (this.value.profiles.every((profile) => !profile.enabled)) throw new Error("Automatic orchestration requires at least one enabled execution profile.");
    return OrchestrationConfiguration.create({ ...this.value, automaticEnabled: true, updatedAt: at });
  }

  public deactivate(at: Date): OrchestrationConfiguration {
    return OrchestrationConfiguration.create({ ...this.value, automaticEnabled: false, updatedAt: at });
  }
}

function validate(value: OrchestrationConfigurationProps): void {
  if (value.schemaVersion !== ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION) throw new TypeError("Orchestration configuration schemaVersion must be 4.");
  if (!safeId(value.projectId, 120) || typeof value.automaticEnabled !== "boolean") throw new TypeError("Orchestration configuration identity is invalid.");
  if (value.profiles.length > 64) throw new TypeError("Orchestration profiles are invalid.");
  const ids = new Set<string>();
  for (const profile of value.profiles) {
    const validated = ExecutionProfile.create(profile);
    if (ids.has(validated.id)) throw new TypeError(`Duplicate execution profile ${validated.id}.`);
    ids.add(validated.id);
  }
  if (!Number.isInteger(value.riskPolicy.automaticThreshold) || value.riskPolicy.automaticThreshold < 0 || value.riskPolicy.automaticThreshold > GLOBAL_AUTOMATIC_RISK_CEILING) throw new TypeError("Orchestration risk threshold is invalid.");
  if (value.riskPolicy.extraWeights !== undefined) {
    for (const [key, weight] of Object.entries(value.riskPolicy.extraWeights)) if (!/^[a-z][a-z0-9_]{0,79}$/u.test(key) || !Number.isInteger(weight) || weight < 0 || weight > 100) throw new TypeError("Orchestration risk weights are invalid.");
  }
  if (!validDate(value.createdAt) || !validDate(value.updatedAt) || value.updatedAt < value.createdAt) throw new TypeError("Orchestration configuration timestamps are invalid.");
  if (value.automaticEnabled && value.profiles.every((profile) => !profile.enabled)) throw new TypeError("Automatic orchestration cannot be enabled without an enabled profile.");
}

function safeId(value: string, maximum: number): boolean { return value.length > 0 && value.length <= maximum && /^[a-z0-9][a-z0-9._-]*$/u.test(value); }
function validDate(value: Date): boolean { return value instanceof Date && !Number.isNaN(value.getTime()); }
function cloneProfile(value: ExecutionProfileProps): ExecutionProfileProps { return ExecutionProfile.create(value).props; }
function clone(value: OrchestrationConfigurationProps): OrchestrationConfigurationProps { return { ...value, profiles: value.profiles.map(cloneProfile), riskPolicy: { ...value.riskPolicy, ...(value.riskPolicy.extraWeights === undefined ? {} : { extraWeights: { ...value.riskPolicy.extraWeights } }) }, createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) }; }
function freeze(value: OrchestrationConfigurationProps): OrchestrationConfigurationProps { const copy = clone(value); return Object.freeze({ ...copy, profiles: Object.freeze(copy.profiles.map((profile) => Object.freeze(profile))), riskPolicy: Object.freeze({ ...copy.riskPolicy, ...(copy.riskPolicy.extraWeights === undefined ? {} : { extraWeights: Object.freeze(copy.riskPolicy.extraWeights) }) }) }); }
