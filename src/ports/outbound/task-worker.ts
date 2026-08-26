/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { ExecutionProfile } from "../../domain/orchestration/execution-profile.js";
import type { TaskPlan } from "../../domain/orchestration/orchestration-plan.js";
import type { PreparedExecutionProfileRuntime } from "./execution-profile-runtime.js";

export interface TaskWorkerUsage {
  readonly calls?: number;
  readonly durationSeconds: number;
  readonly quotaPercent?: number;
  readonly euros?: number;
  readonly measurement: "measured" | "unknown";
}

export interface TaskWorkerFailure {
  readonly code: string;
  readonly message: string;
  readonly exitCode?: number;
  readonly stderrExcerpt?: string;
}

export interface TaskWorkerResult {
  readonly executionId: string;
  readonly status: "succeeded" | "failed" | "blocked" | "cancelled";
  readonly proofReferences: readonly string[];
  readonly usage: TaskWorkerUsage;
  readonly failure?: TaskWorkerFailure;
}

export interface TaskWorkerPort {
  execute(input: {
    readonly executionId: string;
    readonly campaignId: string;
    readonly projectId: string;
    readonly featureId: string;
    readonly task: TaskPlan;
    readonly workspace: string;
    readonly profile: ExecutionProfile;
    readonly runtime: PreparedExecutionProfileRuntime;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  }): Promise<TaskWorkerResult>;
}
