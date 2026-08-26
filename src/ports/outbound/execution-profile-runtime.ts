/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { ExecutionProfile } from "../../domain/orchestration/execution-profile.js";

export type ProfilePreflightCode =
  | "profile_valid"
  | "gateway_profile_missing"
  | "model_unresolvable"
  | "credential_unavailable"
  | "runtime_dependency_missing"
  | "runtime_failed";

export interface PreparedExecutionProfileRuntime {
  readonly profileId: string;
  readonly command: string;
  readonly home: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly fingerprint: string;
}

export interface ProfilePreflightResult {
  readonly profileId: string;
  readonly healthy: boolean;
  readonly code: ProfilePreflightCode;
  readonly message: string;
  readonly runtimeVersion?: string;
  readonly runtimeFingerprint?: string;
  readonly exitCode?: number;
  readonly stderrExcerpt?: string;
}

export interface ExecutionProfileRuntimePort {
  prepare(profile: ExecutionProfile): Promise<PreparedExecutionProfileRuntime>;
  preflight(profile: ExecutionProfile, workspace: string): Promise<ProfilePreflightResult>;
}
