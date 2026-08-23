/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { AuditToolId } from "../../domain/audit/tool-catalog.js";

export interface AuditToolStatus {
  readonly id: AuditToolId;
  readonly image: string;
  readonly installed: boolean;
  readonly sizeBytes: number | null;
}

export interface AuditToolInvocation {
  readonly toolId: AuditToolId;
  readonly projectRoot: string;
  readonly arguments: readonly string[];
  readonly allowPull: boolean;
  readonly allowNetwork: boolean;
  readonly writableWorkspace: boolean;
  readonly timeoutMs: number;
}

export interface AuditToolResult {
  readonly status: "pass" | "findings" | "error" | "not_executed";
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly truncated: boolean;
}

export interface AuditToolRunner {
  readonly runtime: "docker" | "podman";
  doctor(toolIds?: readonly AuditToolId[]): Promise<readonly AuditToolStatus[]>;
  run(invocation: AuditToolInvocation): Promise<AuditToolResult>;
}
