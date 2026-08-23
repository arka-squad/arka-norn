/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { AuditInspection, AuditModuleId, AuditModuleResult, AuditRequest } from "../../domain/audit/audit-types.js";
import type { AuditToolId } from "../../domain/audit/tool-catalog.js";
import type { AuditToolStatus } from "./audit-tool-runner.js";

export interface AuditCollectorContext {
  readonly auditId: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly featureId: string | null;
  readonly request: AuditRequest;
  readonly inspection: AuditInspection;
  readonly now: Date;
}

export interface AuditCollector {
  doctorTools?(runtime: "docker" | "podman", toolIds: readonly AuditToolId[]): Promise<readonly AuditToolStatus[]>;
  inspect(input: {
    readonly projectId: string;
    readonly projectName: string;
    readonly projectRoot: string;
    readonly featureId: string | null;
    readonly paths: readonly string[];
  }): Promise<AuditInspection>;
  collect(moduleId: AuditModuleId, context: AuditCollectorContext): Promise<AuditModuleResult>;
}
