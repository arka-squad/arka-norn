/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { join } from "node:path";

import { ExecutionProfile, type ExecutionProfileProps } from "../../../domain/orchestration/execution-profile.js";
import { ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION, OrchestrationConfiguration } from "../../../domain/orchestration/orchestration-configuration.js";
import type { Project } from "../../../domain/project/project.js";
import type { OrchestrationConfigurationStore } from "../../../ports/outbound/orchestration-configuration-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";

interface OrchestrationConfigurationFileV4 {
  readonly schemaVersion: 4;
  readonly projectId: string;
  readonly automaticEnabled: boolean;
  readonly profiles: readonly SerializedExecutionProfile[];
  readonly riskPolicy: { readonly automaticThreshold: number; readonly extraWeights?: Readonly<Record<string, number>> };
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface SerializedExecutionProfile extends Omit<ExecutionProfileProps, "createdAt" | "updatedAt"> {
  readonly createdAt: string;
  readonly updatedAt: string;
}

export class FsOrchestrationConfigurationStore implements OrchestrationConfigurationStore {
  private readonly paths: PathPolicy;

  public constructor(paths: PathPolicy = new FsPathPolicy()) { this.paths = paths; }

  public async load(project: Project): Promise<OrchestrationConfiguration | undefined> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    const value = await readJson<unknown>(configurationPath(project.root));
    if (value === undefined) return undefined;
    if (!isRecord(value) || value["schemaVersion"] !== ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION) {
      throw new Error("Legacy orchestration state is read-only; inspect and import it explicitly before using automatic orchestration 2.3.");
    }
    const configuration = deserialize(value);
    if (configuration.projectId !== project.id.value) throw new Error("Orchestration configuration projectId mismatch.");
    return configuration;
  }

  public async save(project: Project, configuration: OrchestrationConfiguration): Promise<void> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    if (configuration.projectId !== project.id.value) throw new Error("Orchestration configuration projectId mismatch.");
    const path = configurationPath(project.root);
    await withFileLock(path, async () => {
      const current = await readJson<unknown>(path);
      if (current !== undefined && (!isRecord(current) || current["schemaVersion"] !== ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION)) {
        throw new Error("Refusing to overwrite legacy orchestration state; quarantine or import it first.");
      }
      await writeJsonAtomic(path, serialize(configuration), { mode: 0o600 });
    });
  }
}

export function serializeOrchestrationConfiguration(value: OrchestrationConfiguration): OrchestrationConfigurationFileV4 {
  const props = value.props;
  return {
    schemaVersion: 4,
    projectId: props.projectId,
    automaticEnabled: props.automaticEnabled,
    profiles: props.profiles.map((profile) => ({ ...profile, createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString() })),
    riskPolicy: { ...props.riskPolicy, ...(props.riskPolicy.extraWeights === undefined ? {} : { extraWeights: { ...props.riskPolicy.extraWeights } }) },
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
  };
}

export function configurationPath(projectRoot: string): string { return join(projectRoot, ".arka-norn", "orchestration.json"); }

function serialize(value: OrchestrationConfiguration): OrchestrationConfigurationFileV4 { return serializeOrchestrationConfiguration(value); }

function deserialize(value: Record<string, unknown>): OrchestrationConfiguration {
  if (!hasExactKeys(value, ["schemaVersion", "projectId", "automaticEnabled", "profiles", "riskPolicy", "createdAt", "updatedAt"]) || value["schemaVersion"] !== 4 || typeof value["projectId"] !== "string" || typeof value["automaticEnabled"] !== "boolean" || !Array.isArray(value["profiles"]) || !isRecord(value["riskPolicy"]) || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string") throw new Error("Invalid orchestration configuration file.");
  const profiles = value["profiles"].map(deserializeProfile);
  const risk = value["riskPolicy"];
  if (typeof risk["automaticThreshold"] !== "number" || (risk["extraWeights"] !== undefined && !isNumberRecord(risk["extraWeights"]))) throw new Error("Invalid orchestration risk policy.");
  return OrchestrationConfiguration.create({
    schemaVersion: 4,
    projectId: value["projectId"],
    automaticEnabled: value["automaticEnabled"],
    profiles,
    riskPolicy: { automaticThreshold: risk["automaticThreshold"], ...(risk["extraWeights"] === undefined ? {} : { extraWeights: risk["extraWeights"] }) },
    createdAt: parseDate(value["createdAt"]),
    updatedAt: parseDate(value["updatedAt"]),
  });
}

function deserializeProfile(value: unknown): ExecutionProfileProps {
  if (!isRecord(value) || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string") throw new Error("Invalid execution profile in orchestration configuration.");
  return ExecutionProfile.create({ ...value, createdAt: parseDate(value["createdAt"]), updatedAt: parseDate(value["updatedAt"]) } as unknown as ExecutionProfileProps).props;
}

function parseDate(value: string): Date { const parsed = new Date(value); if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) throw new Error("Invalid orchestration timestamp."); return parsed; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isNumberRecord(value: unknown): value is Readonly<Record<string, number>> { return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number"); }
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
