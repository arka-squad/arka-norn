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
import type { ProjectId } from "../../../domain/project/project-id.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

const WORKER_STATE_SCHEMA_VERSION = 1 as const;
const EXECUTION_ID_PATTERN = /^[a-z][a-z0-9-]{0,95}$/;

export interface OrchestrationWorkerState {
  readonly schemaVersion: typeof WORKER_STATE_SCHEMA_VERSION;
  readonly projectId: string;
  readonly executionId: string;
  readonly pid: number;
  readonly startedAt: Date;
  readonly updatedAt: Date;
}

/**
 * Private, disposable process metadata. It is deliberately outside the
 * Project marker and the portable execution registry. It is not used to send
 * signals: a stale/reused PID must never authorize killing another process.
 */
export class FsOrchestrationWorkerStateStore {
  public constructor(private readonly homeDir: string) {}

  public async load(projectId: ProjectId, executionId: string): Promise<OrchestrationWorkerState | undefined> {
    const path = workerStatePath(this.homeDir, projectId, executionId);
    let value: unknown;
    try {
      value = await readJson<unknown>(path);
    } catch (error) {
      throw invalidState(path, error);
    }
    if (value === undefined) return undefined;
    const state = deserialize(value, path);
    if (state.projectId !== projectId.value || state.executionId !== executionId) {
      throw new Error(`Orchestration worker state identity mismatch at ${path}.`);
    }
    return state;
  }

  public async start(input: { readonly projectId: ProjectId; readonly executionId: string; readonly pid: number; readonly at: Date }): Promise<OrchestrationWorkerState> {
    const path = workerStatePath(this.homeDir, input.projectId, input.executionId);
    const state = createState(input);
    await withFileLock(path, async () => {
      await writeJsonAtomic(path, serialize(state), { mode: 0o600 });
    });
    return state;
  }

  public async touch(input: { readonly projectId: ProjectId; readonly executionId: string; readonly pid: number; readonly at: Date }): Promise<OrchestrationWorkerState> {
    const path = workerStatePath(this.homeDir, input.projectId, input.executionId);
    return withFileLock(path, async () => {
      const current = await this.load(input.projectId, input.executionId);
      if (current === undefined) return this.write(path, createState(input));
      if (current.pid !== input.pid) throw new Error(`Orchestration worker PID mismatch at ${path}.`);
      return this.write(path, { ...current, updatedAt: cloneDate(input.at, "updatedAt") });
    });
  }

  public async clear(projectId: ProjectId, executionId: string): Promise<void> {
    const path = workerStatePath(this.homeDir, projectId, executionId);
    await withFileLock(path, async () => {
      await fs.unlink(path).catch((error: unknown) => {
        if (isNodeError(error, "ENOENT")) return;
        throw error;
      });
    });
  }

  private async write(path: string, state: OrchestrationWorkerState): Promise<OrchestrationWorkerState> {
    await writeJsonAtomic(path, serialize(state), { mode: 0o600 });
    return state;
  }
}

export function workerStatePath(homeDir: string, projectId: ProjectId, executionId: string): string {
  validateExecutionId(executionId);
  if (typeof homeDir !== "string" || homeDir.length === 0) throw new PathSecurityError(homeDir, "home directory is required");
  return join(homeDir, ".arka-norn", "workers", projectId.value, `${executionId}.json`);
}

function createState(input: { readonly projectId: ProjectId; readonly executionId: string; readonly pid: number; readonly at: Date }): OrchestrationWorkerState {
  validateExecutionId(input.executionId);
  if (!Number.isInteger(input.pid) || input.pid <= 0) throw new Error("Orchestration worker PID is invalid.");
  const at = cloneDate(input.at, "at");
  return {
    schemaVersion: WORKER_STATE_SCHEMA_VERSION,
    projectId: input.projectId.value,
    executionId: input.executionId,
    pid: input.pid,
    startedAt: at,
    updatedAt: new Date(at.getTime()),
  };
}

function serialize(state: OrchestrationWorkerState): Record<string, unknown> {
  return {
    schemaVersion: state.schemaVersion,
    projectId: state.projectId,
    executionId: state.executionId,
    pid: state.pid,
    startedAt: state.startedAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

function deserialize(value: unknown, path: string): OrchestrationWorkerState {
  if (!isRecord(value) || !hasExactKeys(value, ["schemaVersion", "projectId", "executionId", "pid", "startedAt", "updatedAt"])) {
    throw new Error(`Invalid orchestration worker state at ${path}.`);
  }
  const pid = value["pid"];
  if (value["schemaVersion"] !== WORKER_STATE_SCHEMA_VERSION || typeof value["projectId"] !== "string" || typeof value["executionId"] !== "string" || typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0 || typeof value["startedAt"] !== "string" || typeof value["updatedAt"] !== "string") {
    throw new Error(`Invalid orchestration worker state at ${path}.`);
  }
  validateExecutionId(value["executionId"]);
  const startedAt = cloneDate(new Date(value["startedAt"]), "startedAt");
  const updatedAt = cloneDate(new Date(value["updatedAt"]), "updatedAt");
  if (updatedAt.getTime() < startedAt.getTime()) throw new Error(`Invalid orchestration worker state at ${path}.`);
  return {
    schemaVersion: WORKER_STATE_SCHEMA_VERSION,
    projectId: value["projectId"],
    executionId: value["executionId"],
    pid,
    startedAt,
    updatedAt,
  };
}

function validateExecutionId(value: string): void {
  if (!EXECUTION_ID_PATTERN.test(value)) throw new Error("Orchestration worker execution id is invalid.");
}

function cloneDate(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) throw new Error(`Orchestration worker ${field} is invalid.`);
  return new Date(value.getTime());
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidState(path: string, error: unknown): Error {
  return new Error(`Cannot read orchestration worker state at ${path}: ${error instanceof Error ? error.message : String(error)}`);
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
