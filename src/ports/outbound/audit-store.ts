/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { AuditCanonical, AuditEvidence, AuditKbRecord, AuditModuleId, AuditModuleResult, AuditRun } from "../../domain/audit/audit-types.js";

export interface AuditIndexEntry {
  readonly id: string;
  readonly projectId: string;
  readonly status: AuditRun["status"];
  readonly mode: AuditRun["request"]["mode"];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly commitExact: string | null;
}

export interface AuditStore {
  withRunLock<T>(auditId: string, operation: () => Promise<T>): Promise<T>;
  initialize(): Promise<void>;
  saveRun(run: AuditRun): Promise<void>;
  loadRun(auditId: string): Promise<AuditRun | undefined>;
  listRuns(): Promise<readonly AuditIndexEntry[]>;
  saveModuleResult(result: AuditModuleResult): Promise<void>;
  loadModuleResult(auditId: string, moduleId: AuditModuleId): Promise<AuditModuleResult | undefined>;
  loadModuleResults(auditId: string): Promise<readonly AuditModuleResult[]>;
  saveCanonical(audit: AuditCanonical): Promise<void>;
  loadCanonical(auditId: string): Promise<AuditCanonical | undefined>;
  saveReport(auditId: string, report: string): Promise<string>;
  loadReport(auditId: string): Promise<string | undefined>;
  loadEvidence(auditId: string, evidenceId: string): Promise<AuditEvidence | undefined>;
  saveKbRecords(records: readonly AuditKbRecord[]): Promise<void>;
  searchKb(filters: Readonly<Record<string, string>>): Promise<readonly AuditKbRecord[]>;
  exportAudit(auditId: string, targetDirectory: string, includeEvidence: boolean): Promise<readonly string[]>;
  auditDirectory(auditId: string): string;
}
