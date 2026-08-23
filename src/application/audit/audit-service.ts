/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { createHash, randomBytes } from "node:crypto";

import { expandAuditModuleDependencies } from "../../domain/audit/module-catalog.js";
import { auditToolDefinition, type AuditToolId } from "../../domain/audit/tool-catalog.js";
import type { AuditCanonical, AuditInspection, AuditModuleId, AuditModuleResult, AuditRequest, AuditRun } from "../../domain/audit/audit-types.js";
import type { AuditCollector } from "../../ports/outbound/audit-collector.js";
import type { AuditStore } from "../../ports/outbound/audit-store.js";
import { buildCanonicalAudit, compareAudits, kbRecordsFromAudit, renderAuditReport, type AuditComparison } from "./audit-report.js";
import { parseAuditRequest, parseModuleResult } from "./audit-validation.js";
import { translate } from "../localization/locale.js";

export interface AuditProjectContext {
  readonly projectId: string;
  readonly projectName: string;
  readonly projectRoot: string;
  readonly featureId: string | null;
  readonly featurePath?: string | null;
}

export class AuditService {
  public constructor(
    private readonly store: AuditStore,
    private readonly collector: AuditCollector,
    private readonly now: () => Date = () => new Date(),
  ) {}

  public inspect(context: AuditProjectContext, paths: readonly string[]): Promise<AuditInspection> {
    return this.collector.inspect({ ...context, paths });
  }

  public async prepare(context: AuditProjectContext, requestValue: unknown): Promise<AuditRun> {
    const request = parseAuditRequest(requestValue);
    if (context.featureId !== null && context.featurePath !== undefined && context.featurePath !== null) assertFeatureScope(request.paths, context.featurePath);
    const inspection = await this.inspect(context, request.paths);
    const selectedModules = expandAuditModuleDependencies(request.modules.map((module) => module.moduleId));
    const normalizedRequest = addDependencySelections(request, selectedModules);
    const toolIds = [...plannedToolIds(normalizedRequest, selectedModules, inspection)];
    const toolStatuses = toolIds.length === 0 || inspection.sandbox.runtime === null || this.collector.doctorTools === undefined ? [] : await this.collector.doctorTools(inspection.sandbox.runtime, toolIds);
    const plan = buildExecutionPlan(inspection, normalizedRequest, selectedModules, toolStatuses);
    const createdAt = this.now();
    const id = auditId(createdAt);
    const fingerprint = hashJson({ context: { projectId: context.projectId, featureId: context.featureId }, inspection, request: normalizedRequest, selectedModules, plan });
    const moduleStatuses = Object.fromEntries(selectedModules.map((moduleId) => [moduleId, "pending" as const]));
    const run: AuditRun = {
      schemaVersion: 1,
      id,
      projectId: context.projectId,
      projectName: context.projectName,
      featureId: context.featureId,
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
      status: "planned",
      fingerprint,
      inspection,
      request: normalizedRequest,
      plan,
      selectedModules,
      moduleStatuses,
      attempts: [],
      warnings: preparationWarnings(inspection, normalizedRequest),
    };
    await this.store.saveRun(run);
    return run;
  }

  public async start(context: AuditProjectContext, auditIdValue: string, confirmation: string): Promise<AuditRun> {
    return this.store.withRunLock(auditIdValue, () => this.startUnlocked(context, auditIdValue, confirmation));
  }

  private async startUnlocked(context: AuditProjectContext, auditIdValue: string, confirmation: string): Promise<AuditRun> {
    const current = await this.requiredRun(auditIdValue);
    if (current.projectId !== context.projectId || current.fingerprint !== confirmation) throw new Error("Audit confirmation does not match the immutable plan");
    if (current.status !== "planned" && current.status !== "interrupted") throw new Error(`Audit ${current.id} cannot start from ${current.status}`);
    const inspection = await this.inspect(context, current.request.paths);
    if (inspection.workspaceFingerprint !== current.inspection.workspaceFingerprint) throw new Error("Audit workspace changed after confirmation; prepare a new audit");
    const startedAt = this.now();
    let run = withRun(current, {
      status: "collecting",
      updatedAt: startedAt.toISOString(),
      attempts: [...current.attempts, { number: current.attempts.length + 1, status: "running", startedAt: startedAt.toISOString(), endedAt: null }],
    });
    await this.store.saveRun(run);
    try {
      for (const moduleId of run.selectedModules) {
        const existing = await this.store.loadModuleResult(run.id, moduleId);
        if (current.status === "interrupted" && existing?.execution.status === "complete") continue;
        const cached = await this.findReusableModule(run, moduleId);
        const result = cached ?? await this.collector.collect(moduleId, { ...context, auditId: run.id, request: run.request, inspection, now: this.now() });
        await this.store.saveModuleResult(result);
        run = withModuleStatus(run, moduleId, result.execution.status, this.now());
        await this.store.saveRun(run);
      }
      run = withRun(run, { status: "analyzing", updatedAt: this.now().toISOString(), attempts: closeAttempt(run.attempts, "completed", this.now()) });
      await this.store.saveRun(run);
      return run;
    } catch (error) {
      run = withRun(run, { status: "interrupted", updatedAt: this.now().toISOString(), attempts: closeAttempt(run.attempts, "interrupted", this.now()) });
      await this.store.saveRun(run);
      throw error;
    }
  }

  public async submit(auditIdValue: string, moduleId: AuditModuleId, value: unknown): Promise<AuditModuleResult> {
    return this.store.withRunLock(auditIdValue, () => this.submitUnlocked(auditIdValue, moduleId, value));
  }

  private async submitUnlocked(auditIdValue: string, moduleId: AuditModuleId, value: unknown): Promise<AuditModuleResult> {
    const run = await this.requiredRun(auditIdValue);
    if (run.status !== "analyzing" && run.status !== "collecting") throw new Error(`Audit ${run.id} does not accept analyses in ${run.status}`);
    if (!run.selectedModules.includes(moduleId)) throw new Error(`Audit ${run.id} does not include ${moduleId}`);
    const result = parseModuleResult(value, run.id, moduleId);
    await this.store.saveModuleResult(result);
    await this.store.saveRun(withModuleStatus(run, moduleId, result.execution.status, this.now()));
    return result;
  }

  public async finalize(auditIdValue: string): Promise<{ readonly run: AuditRun; readonly audit: AuditCanonical; readonly reportPath: string }> {
    return this.store.withRunLock(auditIdValue, () => this.finalizeUnlocked(auditIdValue));
  }

  private async finalizeUnlocked(auditIdValue: string): Promise<{ readonly run: AuditRun; readonly audit: AuditCanonical; readonly reportPath: string }> {
    const run = await this.requiredRun(auditIdValue);
    if (run.status !== "analyzing") throw new Error(`Audit ${run.id} cannot be finalized from ${run.status}`);
    const results = await this.store.loadModuleResults(run.id);
    const missing = run.selectedModules.filter((moduleId) => !results.some((result) => result.moduleId === moduleId));
    if (missing.length > 0) throw new Error(`Audit modules are missing: ${missing.join(", ")}`);
    const audit = buildCanonicalAudit(run, results, this.now());
    await this.store.saveCanonical(audit);
    await this.store.saveKbRecords(kbRecordsFromAudit(audit));
    const reportPath = await this.store.saveReport(run.id, renderAuditReport(run, audit));
    const finalRun = withRun(run, { status: audit.status, updatedAt: this.now().toISOString() });
    await this.store.saveRun(finalRun);
    return { run: finalRun, audit, reportPath };
  }

  public async cancel(auditIdValue: string): Promise<AuditRun> {
    return this.store.withRunLock(auditIdValue, () => this.cancelUnlocked(auditIdValue));
  }

  private async cancelUnlocked(auditIdValue: string): Promise<AuditRun> {
    const run = await this.requiredRun(auditIdValue);
    if (["completed", "partial", "failed", "cancelled"].includes(run.status)) throw new Error(`Audit ${run.id} cannot be cancelled from ${run.status}`);
    const cancelled = withRun(run, { status: "cancelled", updatedAt: this.now().toISOString(), attempts: closeAttempt(run.attempts, "cancelled", this.now()) });
    await this.store.saveRun(cancelled);
    return cancelled;
  }

  public async resume(context: AuditProjectContext, auditIdValue: string): Promise<AuditRun> {
    const run = await this.requiredRun(auditIdValue);
    if (run.status !== "interrupted") throw new Error(`Audit ${run.id} is not interrupted`);
    return this.start(context, run.id, run.fingerprint);
  }

  public async compare(currentId: string, baselineId: string): Promise<AuditComparison> {
    const current = await this.store.loadCanonical(currentId);
    const baseline = await this.store.loadCanonical(baselineId);
    if (current === undefined || baseline === undefined) throw new Error("Both audits must be finalized before comparison");
    if (current.projectId !== baseline.projectId) throw new Error("Audits from different Projects cannot be compared");
    return compareAudits(baseline, current);
  }

  public async requiredRun(auditIdValue: string): Promise<AuditRun> {
    const run = await this.store.loadRun(auditIdValue);
    if (run === undefined) throw new Error(`Audit not found: ${auditIdValue}`);
    return run;
  }

  private async findReusableModule(run: AuditRun, moduleId: AuditModuleId): Promise<AuditModuleResult | undefined> {
    const selection = moduleId === "M00" ? { intent: "discover" as const, depth: "inventory" as const } : run.request.modules.find((candidate) => candidate.moduleId === moduleId);
    if (selection === undefined || selection.depth !== "inventory") return undefined;
    for (const entry of await this.store.listRuns()) {
      if (entry.id === run.id || entry.projectId !== run.projectId || (entry.status !== "completed" && entry.status !== "partial")) continue;
      const previous = await this.store.loadRun(entry.id);
      if (previous === undefined || previous.inspection.commitExact !== run.inspection.commitExact || previous.inspection.workspaceFingerprint !== run.inspection.workspaceFingerprint) continue;
      if (JSON.stringify(previous.request.paths) !== JSON.stringify(run.request.paths)) continue;
      const previousSelection = moduleId === "M00" ? { intent: "discover" as const, depth: "inventory" as const } : previous.request.modules.find((candidate) => candidate.moduleId === moduleId);
      if (previousSelection?.intent !== selection.intent || previousSelection.depth !== selection.depth) continue;
      const result = await this.store.loadModuleResult(entry.id, moduleId);
      if (result === undefined || result.execution.status !== "complete" || result.evidence.some((evidence) => evidence.kind === "external" || evidence.producer.startsWith("arka-norn/container/"))) continue;
      return { ...result, auditId: run.id, strengths: [...result.strengths, translate("audit.service.reused", { audit: entry.id })] };
    }
    return undefined;
  }
}

function assertFeatureScope(paths: readonly string[], featurePath: string): void {
  const normalizedFeature = featurePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
  if (paths.some((path) => path !== normalizedFeature && !path.startsWith(`${normalizedFeature}/`))) {
    throw new Error(`Audit paths must remain inside Feature scope: ${normalizedFeature}`);
  }
}

function buildExecutionPlan(inspection: AuditInspection, request: AuditRequest, selected: readonly AuditModuleId[], toolStatuses: readonly { readonly image: string; readonly installed: boolean; readonly sizeBytes: number | null }[]): AuditRun["plan"] {
  const toolIds = plannedToolIds(request, selected, inspection);
  const images = [...toolIds].map((toolId) => {
    const reference = auditToolDefinition(toolId).image;
    const status = toolStatuses.find((candidate) => candidate.image === reference);
    return { reference, installed: status?.installed ?? null, sizeBytes: status?.sizeBytes ?? null };
  });
  const logicalCommands = [
    "read-only-local-inventory",
    ...selected.filter((moduleId) => moduleId !== "M00").map((moduleId) => `collect-${moduleId.toLowerCase()}`),
  ];
  const sensitive = images.length > 0 || request.capabilities.allowedHosts.length > 0 || request.capabilities.credentialRefs.length > 0
    || request.capabilities.dynamicTargets.length > 0 || request.modules.some((module) => module.depth === "dynamic");
  return {
    scopePaths: request.paths,
    commitExact: inspection.commitExact,
    images,
    hosts: request.capabilities.allowedHosts,
    credentialRefs: request.capabilities.credentialRefs,
    dynamicTargets: request.capabilities.dynamicTargets,
    logicalCommands,
    timeoutMs: request.modules.some((module) => module.depth === "dynamic") ? 900_000 : 300_000,
    estimatedDuration: request.modules.some((module) => module.depth === "dynamic") ? "10–30 min" : "1–10 min",
    requiresAdditionalConfirmation: sensitive,
  };
}

function plannedToolIds(request: AuditRequest, selected: readonly AuditModuleId[], inspection: AuditInspection): Set<AuditToolId> {
  const depths = new Map(request.modules.map((module) => [module.moduleId, module.depth]));
  const toolIds = new Set<AuditToolId>();
  for (const moduleId of selected) {
    const depth = depths.get(moduleId);
    if (depth === undefined || depth === "inventory") continue;
    if (moduleId === "M02" && depth === "dynamic") for (const toolId of runnerToolIds(inspection)) toolIds.add(toolId);
    if (moduleId === "M04" || moduleId === "M08") toolIds.add("syft");
    if (moduleId === "M05") {
      toolIds.add("gitleaks");
      if (depth === "connected" || depth === "dynamic") { toolIds.add("trivy"); toolIds.add("grype"); }
    }
    if (moduleId === "M10" && depth === "dynamic") toolIds.add("terraform");
  }
  return toolIds;
}

function runnerToolIds(inspection: AuditInspection): readonly AuditToolId[] {
  const manifests = inspection.signals.find((signal) => signal.id === "manifest")?.evidence ?? [];
  const ids: AuditToolId[] = [];
  if (manifests.some((path) => path.endsWith("package.json"))) ids.push("node");
  if (manifests.some((path) => /(?:pyproject\.toml|requirements[^/]*\.txt)$/.test(path))) ids.push("python");
  if (manifests.some((path) => path.endsWith("go.mod"))) ids.push("go");
  if (manifests.some((path) => path.endsWith("Cargo.toml"))) ids.push("rust");
  if (manifests.some((path) => path.endsWith("pom.xml"))) ids.push("maven");
  if (manifests.some((path) => /build\.gradle(?:\.kts)?$/.test(path))) ids.push("gradle");
  return ids;
}

function addDependencySelections(request: AuditRequest, selected: readonly AuditModuleId[]): AuditRequest {
  const byId = new Map(request.modules.map((module) => [module.moduleId, module]));
  const dependencyIntent = request.mode === "audit" ? "audit" as const : "discover" as const;
  const modules = selected.filter((id) => id !== "M00").map((moduleId) => byId.get(moduleId) ?? { moduleId, intent: dependencyIntent, depth: "static" as const, criteria: [] });
  return { ...request, modules };
}

function preparationWarnings(inspection: AuditInspection, request: AuditRequest): readonly string[] {
  const warnings: string[] = [];
  if (inspection.workspaceClean === false) warnings.push(translate("audit.service.workspaceModified"));
  if (request.modules.some((module) => module.depth === "dynamic") && !inspection.sandbox.available) warnings.push(translate("audit.service.dynamicUnavailable"));
  return warnings;
}

function withModuleStatus(run: AuditRun, moduleId: AuditModuleId, status: AuditModuleResult["execution"]["status"], now: Date): AuditRun {
  return withRun(run, { moduleStatuses: { ...run.moduleStatuses, [moduleId]: status }, updatedAt: now.toISOString() });
}

function withRun(run: AuditRun, patch: Partial<Pick<AuditRun, "status" | "updatedAt" | "attempts" | "moduleStatuses">>): AuditRun {
  return { ...run, ...patch };
}

function closeAttempt(attempts: readonly AuditRun["attempts"][number][], status: "completed" | "cancelled" | "interrupted", now: Date): readonly AuditRun["attempts"][number][] {
  return attempts.map((attempt, index) => index === attempts.length - 1 && attempt.status === "running" ? { ...attempt, status, endedAt: now.toISOString() } : attempt);
}

function auditId(now: Date): string {
  const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
  return `audit-${stamp}-${randomBytes(4).toString("hex")}`;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
