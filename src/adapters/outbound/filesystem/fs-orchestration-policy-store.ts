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

import * as fs from "node:fs/promises";
import { join } from "node:path";

import {
  EXECUTION_POLICY_SCHEMA_VERSION,
  ExecutionPolicy,
  isExecutionSelectionMode,
  type ExecutionPolicyProps,
  type ExecutionSelectionMode,
} from "../../../domain/orchestration/execution-policy.js";
import { InvalidExecutionPolicyError } from "../../../domain/orchestration/errors.js";
import {
  canonicalExecutionAdapter,
  isExecutionAdapter,
  isExecutionCapability,
  isExecutionModelId,
  isExecutionPermission,
  isExecutionProvider,
  type ExecutionAdapter,
  type ExecutionCapability,
  type ExecutionPermission,
  type ExecutionProvider,
} from "../../../domain/orchestration/types.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import type { Project } from "../../../domain/project/project.js";
import { PathSecurityError } from "../../../domain/errors.js";
import type { OrchestrationPolicyStore } from "../../../ports/outbound/orchestration-policy-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";

interface OrchestrationPolicyFileV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly providers: readonly ProviderExecutionPolicyRawV1[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface OrchestrationPolicyFileV2 {
  readonly schemaVersion: typeof EXECUTION_POLICY_SCHEMA_VERSION;
  readonly projectId: string;
  readonly selectionMode: ExecutionSelectionMode;
  readonly providers: readonly ProviderExecutionPolicyRawV2[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ProviderExecutionPolicyRawV1 {
  readonly provider: "claude" | "codex";
  readonly enabled: boolean;
  readonly priority: number;
  readonly capabilities: readonly ExecutionCapability[];
  readonly permissions: readonly ExecutionPermission[];
}

export interface ProviderExecutionPolicyRawV2 {
  readonly provider: ExecutionProvider;
  readonly adapter: ExecutionAdapter;
  readonly enabled: boolean;
  readonly priority: number;
  readonly capabilities: readonly ExecutionCapability[];
  readonly permissions: readonly ExecutionPermission[];
  readonly models: readonly ExecutionModelPolicyRaw[];
}

export interface ExecutionModelPolicyRaw {
  readonly id: string;
  readonly enabled: boolean;
  readonly priority: number;
}

type OrchestrationPolicyFile = OrchestrationPolicyFileV1 | OrchestrationPolicyFileV2;

export class FsOrchestrationPolicyStore implements OrchestrationPolicyStore {
  private readonly paths: PathPolicy;

  public constructor(paths: PathPolicy = new FsPathPolicy()) {
    this.paths = paths;
  }

  /** Loading v1 is a pure migration in memory; it never rewrites the marker. */
  public async load(project: Project): Promise<ExecutionPolicy | undefined> {
    await this.assertProjectRoot(project);
    const path = orchestrationPolicyPath(project.root);
    let value: unknown;
    try {
      value = await readJson<unknown>(path);
    } catch (error) {
      throw invalidFile(path, error);
    }
    if (value === undefined) return undefined;
    try {
      const policy = deserialize(value);
      if (!policy.projectId.equals(project.id)) throw new InvalidExecutionPolicyError("projectId mismatch");
      return policy;
    } catch (error) {
      throw invalidFile(path, error);
    }
  }

  /** Every explicit save writes the current v2 representation. */
  public async save(project: Project, policy: ExecutionPolicy): Promise<void> {
    await this.assertProjectRoot(project);
    if (!policy.projectId.equals(project.id)) throw new InvalidExecutionPolicyError("policy projectId must match the Project");
    const path = orchestrationPolicyPath(project.root);
    await withFileLock(path, async () => {
      await writeJsonAtomic(path, serialize(policy), { mode: 0o600 });
    });
  }

  private async assertProjectRoot(project: Project): Promise<void> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    await rejectMarkerDirectorySymlink(project.root);
  }
}

export function orchestrationPolicyPath(projectRoot: string): string {
  return join(projectRoot, ".arka-norn", "orchestration.json");
}

export function serializeOrchestrationPolicy(policy: ExecutionPolicy): OrchestrationPolicyFileV2 {
  return serialize(policy);
}

export function deserializeOrchestrationPolicy(value: unknown): ExecutionPolicy {
  return deserialize(value);
}

function serialize(policy: ExecutionPolicy): OrchestrationPolicyFileV2 {
  const props = policy.toProps();
  return {
    schemaVersion: props.schemaVersion,
    projectId: props.projectId.value,
    selectionMode: props.selectionMode,
    providers: props.providers.map((provider) => ({
      provider: provider.provider,
      adapter: provider.adapter,
      enabled: provider.enabled,
      priority: provider.priority,
      capabilities: [...provider.capabilities],
      permissions: [...provider.permissions],
      models: provider.models.map((model) => ({ ...model })),
    })),
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
  };
}

function deserialize(value: unknown): ExecutionPolicy {
  if (!isPolicyFile(value)) throw new InvalidExecutionPolicyError("schema is invalid or contains forbidden fields");
  const props: ExecutionPolicyProps = value.schemaVersion === 1
    ? {
      schemaVersion: EXECUTION_POLICY_SCHEMA_VERSION,
      projectId: ProjectId.of(value.projectId),
      selectionMode: "assisted",
      providers: value.providers.map((provider) => ({
        provider: provider.provider,
        adapter: canonicalExecutionAdapter(provider.provider),
        enabled: provider.enabled,
        priority: provider.priority,
        capabilities: [...provider.capabilities],
        permissions: [...provider.permissions],
        models: [],
      })),
      createdAt: parseDate(value.createdAt, "createdAt"),
      updatedAt: parseDate(value.updatedAt, "updatedAt"),
    }
    : {
      schemaVersion: value.schemaVersion,
      projectId: ProjectId.of(value.projectId),
      selectionMode: value.selectionMode,
      providers: value.providers.map((provider) => ({
        provider: provider.provider,
        adapter: provider.adapter,
        enabled: provider.enabled,
        priority: provider.priority,
        capabilities: [...provider.capabilities],
        permissions: [...provider.permissions],
        models: provider.models.map((model) => ({ ...model })),
      })),
      createdAt: parseDate(value.createdAt, "createdAt"),
      updatedAt: parseDate(value.updatedAt, "updatedAt"),
    };
  return ExecutionPolicy.create(props);
}

function isPolicyFile(value: unknown): value is OrchestrationPolicyFile {
  return isPolicyFileV1(value) || isPolicyFileV2(value);
}

function isPolicyFileV1(value: unknown): value is OrchestrationPolicyFileV1 {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "providers", "createdAt", "updatedAt"])) return false;
  return value["schemaVersion"] === 1
    && typeof value["projectId"] === "string"
    && Array.isArray(value["providers"])
    && value["providers"].length >= 1
    && value["providers"].length <= 2
    && value["providers"].every(isProviderPolicyRawV1)
    && typeof value["createdAt"] === "string"
    && isIsoDate(value["createdAt"])
    && typeof value["updatedAt"] === "string"
    && isIsoDate(value["updatedAt"]);
}

function isPolicyFileV2(value: unknown): value is OrchestrationPolicyFileV2 {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "selectionMode", "providers", "createdAt", "updatedAt"])) return false;
  return value["schemaVersion"] === EXECUTION_POLICY_SCHEMA_VERSION
    && typeof value["projectId"] === "string"
    && isExecutionSelectionMode(value["selectionMode"])
    && Array.isArray(value["providers"])
    && value["providers"].every(isProviderPolicyRawV2)
    && typeof value["createdAt"] === "string"
    && isIsoDate(value["createdAt"])
    && typeof value["updatedAt"] === "string"
    && isIsoDate(value["updatedAt"]);
}

function isProviderPolicyRawV1(value: unknown): value is ProviderExecutionPolicyRawV1 {
  if (!isRecord(value) || !hasExactKeys(value, ["provider", "enabled", "priority", "capabilities", "permissions"])) return false;
  return (value["provider"] === "claude" || value["provider"] === "codex")
    && typeof value["enabled"] === "boolean"
    && Number.isInteger(value["priority"])
    && isUniqueArray(value["capabilities"], isExecutionCapability)
    && isUniqueArray(value["permissions"], isExecutionPermission);
}

function isProviderPolicyRawV2(value: unknown): value is ProviderExecutionPolicyRawV2 {
  if (!isRecord(value) || !hasExactKeys(value, ["provider", "adapter", "enabled", "priority", "capabilities", "permissions", "models"])) return false;
  return isExecutionProvider(value["provider"])
    && isExecutionAdapter(value["adapter"])
    && typeof value["enabled"] === "boolean"
    && Number.isInteger(value["priority"])
    && isUniqueArray(value["capabilities"], isExecutionCapability)
    && isUniqueArray(value["permissions"], isExecutionPermission)
    && Array.isArray(value["models"])
    && value["models"].every(isModelPolicyRaw);
}

function isModelPolicyRaw(value: unknown): value is ExecutionModelPolicyRaw {
  return isRecord(value)
    && hasExactKeys(value, ["id", "enabled", "priority"])
    && isExecutionModelId(value["id"])
    && typeof value["enabled"] === "boolean"
    && Number.isInteger(value["priority"]);
}

function isUniqueArray<T>(value: unknown, predicate: (entry: unknown) => entry is T): value is readonly T[] {
  return Array.isArray(value) && value.every(predicate) && new Set(value).size === value.length;
}

async function rejectMarkerDirectorySymlink(root: string): Promise<void> {
  try {
    const markerDirectory = join(root, ".arka-norn");
    if ((await fs.lstat(markerDirectory)).isSymbolicLink()) {
      throw new PathSecurityError(markerDirectory, "symbolic-link marker directories are forbidden");
    }
  } catch (error) {
    if (!isNodeError(error, "ENOENT")) throw error;
  }
}

function invalidFile(path: string, error: unknown): InvalidExecutionPolicyError {
  const reason = error instanceof Error ? error.message : String(error);
  return new InvalidExecutionPolicyError(`${path}: ${reason}`);
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidExecutionPolicyError(`${field} is invalid`);
  return date;
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return keys.length === expectedKeys.length && keys.every((key, index) => key === expectedKeys[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
