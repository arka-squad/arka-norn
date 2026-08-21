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

import { PathSecurityError } from "../../../domain/errors.js";
import {
  EXECUTION_REGISTRY_SCHEMA_VERSION,
  ExecutionRegistry,
  type ExecutionRegistryProps,
} from "../../../domain/orchestration/execution-registry.js";
import {
  ExecutionRecord,
  isExecutionSuspensionCode,
  type ExecutionAttempt,
  type ExecutionEvent,
  type ExecutionRecordProps,
  type ExecutionSuspensionReason,
} from "../../../domain/orchestration/execution-record.js";
import { InvalidExecutionRegistryError } from "../../../domain/orchestration/errors.js";
import {
  MissionOrder,
  type MissionOrderProps,
  type MissionPipelinePreconditions,
  type MissionScope,
} from "../../../domain/orchestration/mission-order.js";
import {
  canonicalExecutionAdapter,
  isExecutionAdapter,
  isExecutionAttemptStatus,
  isExecutionCapability,
  isExecutionModelId,
  isExecutionPermission,
  isExecutionProvider,
  isExecutionRecordStatus,
  isExecutionTargetSource,
  legacyExecutionTarget,
  type ExecutionAdapter,
  type ExecutionAttemptStatus,
  type ExecutionCapability,
  type ExecutionPermission,
  type ExecutionProvider,
  type ExecutionRecordStatus,
  type ExecutionTarget,
  type ExecutionTargetSource,
} from "../../../domain/orchestration/types.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import type { Project } from "../../../domain/project/project.js";
import type { ExecutionRegistryStore } from "../../../ports/outbound/execution-registry-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";

interface ExecutionRegistryFileV1 {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly updatedAt: string;
  readonly executions: readonly ExecutionRecordRawV1[];
}

export interface ExecutionRegistryFileV2 {
  readonly schemaVersion: typeof EXECUTION_REGISTRY_SCHEMA_VERSION;
  readonly projectId: string;
  readonly updatedAt: string;
  readonly executions: readonly ExecutionRecordRawV2[];
}

interface ExecutionRecordRawBase {
  readonly id: string;
  readonly order: MissionOrderRaw;
  readonly status: ExecutionRecordStatus;
  readonly attempts: readonly ExecutionAttemptRaw[];
  readonly events: readonly ExecutionEventRaw[];
  readonly truncatedEventCount: number;
  readonly proofReferences: readonly string[];
  readonly suspensionReason?: ExecutionSuspensionReasonRaw;
  readonly providerSessionId?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface ExecutionRecordRawV1 extends ExecutionRecordRawBase {
  readonly provider: "claude" | "codex";
}

export interface ExecutionRecordRawV2 extends ExecutionRecordRawBase {
  readonly target: ExecutionTargetRaw;
}

export interface ExecutionTargetRaw {
  readonly provider: ExecutionProvider;
  readonly adapter: ExecutionAdapter;
  readonly model?: string;
  readonly source: ExecutionTargetSource;
}

interface MissionOrderRaw {
  readonly id: string;
  readonly scope: MissionScopeRaw;
  readonly preconditions: MissionPipelinePreconditionsRaw;
  readonly requiredCapabilities: readonly ExecutionCapability[];
  readonly requiredPermissions: readonly ExecutionPermission[];
  readonly summary: string;
  readonly issuedAt: string;
}

interface MissionScopeRaw {
  readonly projectId: string;
  readonly featureId?: string;
  readonly paths: readonly string[];
}

interface MissionPipelinePreconditionsRaw {
  readonly pipelineId: string;
  readonly nextStepId: string;
}

interface ExecutionAttemptRaw {
  readonly number: number;
  readonly status: ExecutionAttemptStatus;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly providerSessionId?: string;
}

interface ExecutionEventRaw {
  readonly at: string;
  readonly type: string;
  readonly detail: string;
}

interface ExecutionSuspensionReasonRaw {
  readonly code: string;
  readonly detail: string;
}

type ExecutionRegistryFile = ExecutionRegistryFileV1 | ExecutionRegistryFileV2;

export class FsExecutionRegistryStore implements ExecutionRegistryStore {
  private readonly paths: PathPolicy;

  public constructor(paths: PathPolicy = new FsPathPolicy()) {
    this.paths = paths;
  }

  /** Loading v1 is a pure migration in memory; it never rewrites the marker. */
  public async load(project: Project): Promise<ExecutionRegistry> {
    await this.assertProjectRoot(project);
    return this.loadUnlocked(project);
  }

  /** Every explicit update persists the current v2 representation under a lock. */
  public async update(project: Project, transform: (registry: ExecutionRegistry) => ExecutionRegistry): Promise<ExecutionRegistry> {
    await this.assertProjectRoot(project);
    const path = executionRegistryPath(project.root);
    return withFileLock(path, async () => {
      const next = transform(await this.loadUnlocked(project));
      if (!(next instanceof ExecutionRegistry)) throw new InvalidExecutionRegistryError("registry transform must return an ExecutionRegistry");
      if (!next.projectId.equals(project.id)) throw new InvalidExecutionRegistryError("registry projectId must match the Project");
      await writeJsonAtomic(path, serialize(next), { mode: 0o600 });
      return next;
    });
  }

  private async loadUnlocked(project: Project): Promise<ExecutionRegistry> {
    const path = executionRegistryPath(project.root);
    let value: unknown;
    try {
      value = await readJson<unknown>(path);
    } catch (error) {
      throw invalidFile(path, error);
    }
    if (value === undefined) return ExecutionRegistry.empty(project.id);
    try {
      const registry = deserialize(value);
      if (!registry.projectId.equals(project.id)) throw new InvalidExecutionRegistryError("projectId mismatch");
      return registry;
    } catch (error) {
      throw invalidFile(path, error);
    }
  }

  private async assertProjectRoot(project: Project): Promise<void> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    await rejectMarkerDirectorySymlink(project.root);
  }
}

export function executionRegistryPath(projectRoot: string): string {
  return join(projectRoot, ".arka-norn", "executions.json");
}

export function serializeExecutionRegistry(registry: ExecutionRegistry): ExecutionRegistryFileV2 {
  return serialize(registry);
}

export function deserializeExecutionRegistry(value: unknown): ExecutionRegistry {
  return deserialize(value);
}

function serialize(registry: ExecutionRegistry): ExecutionRegistryFileV2 {
  const props = registry.toProps();
  return {
    schemaVersion: props.schemaVersion,
    projectId: props.projectId.value,
    updatedAt: props.updatedAt.toISOString(),
    executions: props.executions.map(serializeRecord),
  };
}

function serializeRecord(record: ExecutionRecord): ExecutionRecordRawV2 {
  const props = record.toProps();
  return {
    id: props.id,
    order: serializeOrder(props.order),
    target: serializeTarget(props.target),
    status: props.status,
    attempts: props.attempts.map((attempt) => ({
      number: attempt.number,
      status: attempt.status,
      startedAt: attempt.startedAt.toISOString(),
      ...(attempt.endedAt === undefined ? {} : { endedAt: attempt.endedAt.toISOString() }),
      ...(attempt.providerSessionId === undefined ? {} : { providerSessionId: attempt.providerSessionId }),
    })),
    events: props.events.map((event) => ({ at: event.at.toISOString(), type: event.type, detail: event.detail })),
    truncatedEventCount: props.truncatedEventCount,
    proofReferences: [...props.proofReferences],
    ...(props.suspensionReason === undefined ? {} : { suspensionReason: { ...props.suspensionReason } }),
    ...(props.providerSessionId === undefined ? {} : { providerSessionId: props.providerSessionId }),
    createdAt: props.createdAt.toISOString(),
    updatedAt: props.updatedAt.toISOString(),
  };
}

function serializeTarget(target: ExecutionTarget): ExecutionTargetRaw {
  return {
    provider: target.provider,
    adapter: target.adapter,
    ...(target.model === undefined ? {} : { model: target.model }),
    source: target.source,
  };
}

function serializeOrder(order: MissionOrder): MissionOrderRaw {
  const props = order.toProps();
  return {
    id: props.id,
    scope: {
      projectId: props.scope.projectId.value,
      ...(props.scope.featureId === undefined ? {} : { featureId: props.scope.featureId.value }),
      paths: [...props.scope.paths],
    },
    preconditions: { ...props.preconditions },
    requiredCapabilities: [...props.requiredCapabilities],
    requiredPermissions: [...props.requiredPermissions],
    summary: props.summary,
    issuedAt: props.issuedAt.toISOString(),
  };
}

function deserialize(value: unknown): ExecutionRegistry {
  if (!isRegistryFile(value)) throw new InvalidExecutionRegistryError("schema is invalid or contains forbidden fields");
  const props: ExecutionRegistryProps = {
    schemaVersion: EXECUTION_REGISTRY_SCHEMA_VERSION,
    projectId: ProjectId.of(value.projectId),
    executions: value.schemaVersion === 1
      ? value.executions.map(deserializeLegacyRecord)
      : value.executions.map(deserializeRecord),
    updatedAt: parseDate(value.updatedAt, "updatedAt"),
  };
  return ExecutionRegistry.create(props);
}

function deserializeLegacyRecord(value: ExecutionRecordRawV1): ExecutionRecord {
  return createRecord(value, legacyExecutionTarget(value.provider));
}

function deserializeRecord(value: ExecutionRecordRawV2): ExecutionRecord {
  return createRecord(value, deserializeTarget(value.target));
}

function createRecord(value: ExecutionRecordRawBase, target: ExecutionTarget): ExecutionRecord {
  const props: ExecutionRecordProps = {
    id: value.id,
    order: deserializeOrder(value.order),
    target,
    status: value.status,
    attempts: value.attempts.map(deserializeAttempt),
    events: value.events.map(deserializeEvent),
    truncatedEventCount: value.truncatedEventCount,
    proofReferences: [...value.proofReferences],
    ...(value.suspensionReason === undefined ? {} : { suspensionReason: deserializeReason(value.suspensionReason) }),
    ...(value.providerSessionId === undefined ? {} : { providerSessionId: value.providerSessionId }),
    createdAt: parseDate(value.createdAt, "createdAt"),
    updatedAt: parseDate(value.updatedAt, "updatedAt"),
  };
  return ExecutionRecord.create(props);
}

function deserializeTarget(value: ExecutionTargetRaw): ExecutionTarget {
  return {
    provider: value.provider,
    adapter: value.adapter,
    ...(value.model === undefined ? {} : { model: value.model }),
    source: value.source,
  };
}

function deserializeOrder(value: MissionOrderRaw): MissionOrder {
  const scope: MissionScope = {
    projectId: ProjectId.of(value.scope.projectId),
    ...(value.scope.featureId === undefined ? {} : { featureId: FeatureId.of(value.scope.featureId) }),
    paths: [...value.scope.paths],
  };
  const preconditions: MissionPipelinePreconditions = { ...value.preconditions };
  const props: MissionOrderProps = {
    id: value.id,
    scope,
    preconditions,
    requiredCapabilities: [...value.requiredCapabilities],
    requiredPermissions: [...value.requiredPermissions],
    summary: value.summary,
    issuedAt: parseDate(value.issuedAt, "order.issuedAt"),
  };
  return MissionOrder.create(props);
}

function deserializeAttempt(value: ExecutionAttemptRaw): ExecutionAttempt {
  return {
    number: value.number,
    status: value.status,
    startedAt: parseDate(value.startedAt, "attempt.startedAt"),
    ...(value.endedAt === undefined ? {} : { endedAt: parseDate(value.endedAt, "attempt.endedAt") }),
    ...(value.providerSessionId === undefined ? {} : { providerSessionId: value.providerSessionId }),
  };
}

function deserializeEvent(value: ExecutionEventRaw): ExecutionEvent {
  return { at: parseDate(value.at, "event.at"), type: value.type, detail: value.detail };
}

function deserializeReason(value: ExecutionSuspensionReasonRaw): ExecutionSuspensionReason {
  if (!isExecutionSuspensionCode(value.code)) throw new InvalidExecutionRegistryError("suspension reason code is invalid");
  return { code: value.code, detail: value.detail };
}

function isRegistryFile(value: unknown): value is ExecutionRegistryFile {
  return isRegistryFileV1(value) || isRegistryFileV2(value);
}

function isRegistryFileV1(value: unknown): value is ExecutionRegistryFileV1 {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "updatedAt", "executions"])) return false;
  return value["schemaVersion"] === 1
    && typeof value["projectId"] === "string"
    && typeof value["updatedAt"] === "string"
    && isIsoDate(value["updatedAt"])
    && Array.isArray(value["executions"])
    && value["executions"].every(isExecutionRecordRawV1);
}

function isRegistryFileV2(value: unknown): value is ExecutionRegistryFileV2 {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "updatedAt", "executions"])) return false;
  return value["schemaVersion"] === EXECUTION_REGISTRY_SCHEMA_VERSION
    && typeof value["projectId"] === "string"
    && typeof value["updatedAt"] === "string"
    && isIsoDate(value["updatedAt"])
    && Array.isArray(value["executions"])
    && value["executions"].every(isExecutionRecordRawV2);
}

function isExecutionRecordRawV1(value: unknown): value is ExecutionRecordRawV1 {
  const required = ["id", "order", "provider", "status", "attempts", "events", "truncatedEventCount", "proofReferences", "createdAt", "updatedAt"];
  return isExecutionRecordRawBase(value, required)
    && (value["provider"] === "claude" || value["provider"] === "codex");
}

function isExecutionRecordRawV2(value: unknown): value is ExecutionRecordRawV2 {
  const required = ["id", "order", "target", "status", "attempts", "events", "truncatedEventCount", "proofReferences", "createdAt", "updatedAt"];
  return isExecutionRecordRawBase(value, required) && isExecutionTargetRaw(value["target"]);
}

function isExecutionRecordRawBase(value: unknown, required: readonly string[]): value is Record<string, unknown> {
  const optional = ["suspensionReason", "providerSessionId"];
  if (!isRecord(value) || !hasKeys(value, required, optional)) return false;
  return typeof value["id"] === "string"
    && isMissionOrderRaw(value["order"])
    && isExecutionRecordStatus(value["status"])
    && Array.isArray(value["attempts"])
    && value["attempts"].every(isExecutionAttemptRaw)
    && Array.isArray(value["events"])
    && value["events"].every(isExecutionEventRaw)
    && Number.isInteger(value["truncatedEventCount"])
    && isStringArray(value["proofReferences"])
    && optionalRawReason(value["suspensionReason"])
    && optionalString(value["providerSessionId"])
    && typeof value["createdAt"] === "string"
    && isIsoDate(value["createdAt"])
    && typeof value["updatedAt"] === "string"
    && isIsoDate(value["updatedAt"]);
}

function isExecutionTargetRaw(value: unknown): value is ExecutionTargetRaw {
  if (!isRecord(value) || !hasKeys(value, ["provider", "adapter", "source"], ["model"])) return false;
  if (!isExecutionProvider(value["provider"])
    || !isExecutionAdapter(value["adapter"])
    || value["adapter"] !== canonicalExecutionAdapter(value["provider"])
    || !isExecutionTargetSource(value["source"])) {
    return false;
  }
  return value["source"] === "user"
    ? isExecutionModelId(value["model"])
    : value["model"] === undefined;
}

function isMissionOrderRaw(value: unknown): value is MissionOrderRaw {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "scope", "preconditions", "requiredCapabilities", "requiredPermissions", "summary", "issuedAt"])) return false;
  return typeof value["id"] === "string"
    && isMissionScopeRaw(value["scope"])
    && isPipelinePreconditionsRaw(value["preconditions"])
    && isUniqueArray(value["requiredCapabilities"], isExecutionCapability)
    && isUniqueArray(value["requiredPermissions"], isExecutionPermission)
    && typeof value["summary"] === "string"
    && typeof value["issuedAt"] === "string"
    && isIsoDate(value["issuedAt"]);
}

function isMissionScopeRaw(value: unknown): value is MissionScopeRaw {
  if (!isRecord(value) || !hasKeys(value, ["projectId", "paths"], ["featureId"])) return false;
  return typeof value["projectId"] === "string"
    && optionalString(value["featureId"])
    && isStringArray(value["paths"]);
}

function isPipelinePreconditionsRaw(value: unknown): value is MissionPipelinePreconditionsRaw {
  return isRecord(value)
    && hasExactKeys(value, ["pipelineId", "nextStepId"])
    && typeof value["pipelineId"] === "string"
    && typeof value["nextStepId"] === "string";
}

function isExecutionAttemptRaw(value: unknown): value is ExecutionAttemptRaw {
  if (!isRecord(value) || !hasKeys(value, ["number", "status", "startedAt"], ["endedAt", "providerSessionId"])) return false;
  return Number.isInteger(value["number"])
    && isExecutionAttemptStatus(value["status"])
    && typeof value["startedAt"] === "string"
    && isIsoDate(value["startedAt"])
    && optionalIsoDate(value["endedAt"])
    && optionalString(value["providerSessionId"]);
}

function isExecutionEventRaw(value: unknown): value is ExecutionEventRaw {
  return isRecord(value)
    && hasExactKeys(value, ["at", "type", "detail"])
    && typeof value["at"] === "string"
    && isIsoDate(value["at"])
    && typeof value["type"] === "string"
    && typeof value["detail"] === "string";
}

function optionalRawReason(value: unknown): value is ExecutionSuspensionReasonRaw | undefined {
  return value === undefined || (isRecord(value)
    && hasExactKeys(value, ["code", "detail"])
    && isExecutionSuspensionCode(value["code"])
    && typeof value["detail"] === "string");
}

function isUniqueArray<T>(value: unknown, predicate: (entry: unknown) => entry is T): value is readonly T[] {
  return Array.isArray(value) && value.every(predicate) && new Set(value).size === value.length;
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalIsoDate(value: unknown): boolean {
  return value === undefined || (typeof value === "string" && isIsoDate(value));
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

function invalidFile(path: string, error: unknown): InvalidExecutionRegistryError {
  const reason = error instanceof Error ? error.message : String(error);
  return new InvalidExecutionRegistryError(`${path}: ${reason}`);
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new InvalidExecutionRegistryError(`${field} is invalid`);
  return date;
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return hasKeys(value, expected, []);
}

function hasKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[]): boolean {
  const allowed = new Set([...required, ...optional]);
  return required.every((key) => Object.hasOwn(value, key)) && Object.keys(value).every((key) => allowed.has(key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
