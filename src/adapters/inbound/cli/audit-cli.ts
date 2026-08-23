/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { execFile } from "node:child_process";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";

import { AuditService, type AuditProjectContext } from "../../../application/audit/audit-service.js";
import { AUDIT_TOOL_CATALOG } from "../../../domain/audit/tool-catalog.js";
import { isAuditModuleId } from "../../../domain/audit/audit-types.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { LocalAuditCollector } from "../../outbound/audit/local-audit-collector.js";
import { ContainerAuditToolRunner } from "../../outbound/audit/container-audit-tool-runner.js";
import { FsAuditStore } from "../../outbound/filesystem/fs-audit-store.js";
import { readJson } from "../../outbound/filesystem/_shared/atomic-json.js";
import type { CliExecution } from "./cli-execution.js";
import { CliUsageError, parseStrictArguments, type StrictArgumentSpec } from "./strict-arguments.js";
import { jsonEnvelope } from "./cli-envelope.js";
import { formatBytes, formatNumber, translate } from "../../../application/localization/locale.js";

const execFileAsync = promisify(execFile);

export interface AuditCliContext {
  readonly cwd: string;
  readonly homeDir: string;
}

export function auditHelp(): string {
  return translate("cli.audit.help");
}

export async function runAuditCommand(argv: readonly string[], context: AuditCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `audit.${action ?? "unknown"}`;
  try {
    if (action === undefined || action === "help" || action === "--help" || action === "-h") return success(command, auditHelp(), auditHelp(), json);
    if (action === "kb") return await runKb(rest, context);
    if (action === "evidence") return await runEvidence(rest, context);
    if (action === "tools") return await runTools(rest, context);
    const parsed = parseStrictArguments(rest, argumentSpec(action));
    const resolved = await resolveAuditContext(parsed.values, context);
    const store = new FsAuditStore(resolved.context.projectRoot);
    const service = new AuditService(store, new LocalAuditCollector());
    if (action === "inspect") {
      const data = await service.inspect(resolved.context, [parsed.values.get("path") ?? resolved.defaultPath]);
      return success(command, data, humanInspection(data), json);
    }
    if (action === "prepare") {
      const requestPath = required(parsed.values, "request");
      const request = await readJson<unknown>(resolve(context.cwd, requestPath));
      if (request === undefined) throw new Error(`Audit request not found: ${requestPath}`);
      const data = await service.prepare(resolved.context, request);
      return success(command, data, humanRun(data), json);
    }
    if (action === "start") {
      const data = await service.start(resolved.context, parsed.positionals[0]!, required(parsed.values, "confirm"));
      return success(command, data, humanRun(data), json);
    }
    if (action === "status") {
      const data = await service.requiredRun(parsed.positionals[0]!);
      return success(command, data, humanRun(data), json);
    }
    if (action === "show") {
      const run = await service.requiredRun(parsed.positionals[0]!);
      const audit = await store.loadCanonical(run.id);
      const data = { run, audit, reportPath: audit === undefined ? null : resolve(run.inspection.projectRoot, ".arka-norn", "audits", run.id, "report.md") };
      return success(command, data, audit === undefined ? humanRun(run) : `${translate("cli.audit.summary", { id: run.id, status: run.status })}\n${translate("cli.audit.report", { path: data.reportPath ?? "" })}`, json);
    }
    if (action === "submit") {
      const moduleId = required(parsed.values, "module");
      if (!isAuditModuleId(moduleId)) throw new CliUsageError("--module must be M00..M11");
      const input = await readJson<unknown>(resolve(context.cwd, required(parsed.values, "input")));
      if (input === undefined) throw new Error("Audit module input not found");
      const data = await service.submit(parsed.positionals[0]!, moduleId, input);
      return success(command, data, translate("cli.audit.moduleSaved", { module: moduleId }), json);
    }
    if (action === "finalize") {
      const data = await service.finalize(parsed.positionals[0]!);
      return success(command, data, `${translate("cli.audit.summary", { id: data.run.id, status: data.run.status })}\n${translate("cli.audit.report", { path: data.reportPath })}`, json);
    }
    if (action === "cancel") {
      const data = await service.cancel(parsed.positionals[0]!);
      return success(command, data, humanRun(data), json);
    }
    if (action === "resume") {
      const data = await service.resume(resolved.context, parsed.positionals[0]!);
      return success(command, data, humanRun(data), json);
    }
    if (action === "list") {
      const data = await store.listRuns();
      const human = data.length === 0 ? translate("cli.audit.none") : data.map((entry) => `${entry.id} - ${entry.status} - ${entry.mode}`).join("\n");
      return success(command, data, human, json);
    }
    if (action === "compare") {
      const data = await service.compare(parsed.positionals[0]!, required(parsed.values, "baseline"));
      return success(command, data, translate("cli.audit.compare", { newCount: formatNumber(data.new.length), persisting: formatNumber(data.persisting.length), resolved: formatNumber(data.resolved.length), regressed: formatNumber(data.regressed.length) }), json);
    }
    if (action === "export") {
      const data = await store.exportAudit(parsed.positionals[0]!, resolve(context.cwd, required(parsed.values, "to")), parsed.booleans.has("include-evidence"));
      return success(command, data, translate("cli.audit.exported", { count: formatNumber(data.length) }), json);
    }
    throw new CliUsageError(`unknown audit action: ${action}\n\n${auditHelp()}`);
  } catch (error) {
    return failure(command, error, json);
  }
}

async function runKb(argv: readonly string[], context: AuditCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `audit.kb.${action ?? "unknown"}`;
  try {
    if (action !== "search") throw new CliUsageError("audit kb action must be search");
    const parsed = parseStrictArguments(rest, { options: { project: "string", domain: "string", severity: "string", priority: "string", status: "string", type: "string", scope: "string", audit: "string", commit: "string", confidence: "string", origin: "string", json: "boolean" }, minPositionals: 0, maxPositionals: 0 });
    const resolved = await resolveAuditContext(parsed.values, context);
    const aliases: Readonly<Record<string, string>> = { domain: "moduleId", audit: "auditId", commit: "commitExact" };
    const filters = Object.fromEntries(["domain", "severity", "priority", "status", "type", "scope", "audit", "commit", "confidence", "origin"].flatMap((name) => parsed.values.get(name) === undefined ? [] : [[aliases[name] ?? name, parsed.values.get(name)!]]));
    const data = await new FsAuditStore(resolved.context.projectRoot).searchKb(filters);
    const human = data.length === 0 ? translate("cli.audit.kb.none") : data.map((record) => `${record.id} - ${record.moduleId} - ${record.severity ?? "n/a"} - ${record.title}`).join("\n");
    return success(command, data, human, json);
  } catch (error) {
    return failure(command, error, json);
  }
}

async function runEvidence(argv: readonly string[], context: AuditCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `audit.evidence.${action ?? "unknown"}`;
  try {
    if (action !== "show") throw new CliUsageError("audit evidence action must be show");
    const parsed = parseStrictArguments(rest, { options: { project: "string", audit: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
    const resolved = await resolveAuditContext(parsed.values, context);
    const data = await new FsAuditStore(resolved.context.projectRoot).loadEvidence(required(parsed.values, "audit"), parsed.positionals[0]!);
    if (data === undefined) throw new Error(`Evidence not found: ${parsed.positionals[0]!}`);
    return success(command, data, `${data.id} · ${data.kind} · ${data.summary}`, json);
  } catch (error) {
    return failure(command, error, json);
  }
}

async function runTools(argv: readonly string[], context: AuditCliContext): Promise<CliExecution> {
  const action = argv[0];
  const rest = argv.slice(1);
  const json = rest.includes("--json");
  const command = `audit.tools.${action ?? "unknown"}`;
  try {
    if (action !== "doctor") throw new CliUsageError("audit tools action must be doctor");
    const parsed = parseStrictArguments(rest, { options: { project: "string", json: "boolean" }, minPositionals: 0, maxPositionals: 0 });
    await resolveAuditContext(parsed.values, context);
    const probes = await Promise.all(["docker", "podman", "git", "gh"].map(probe));
    const sandbox = probes.find((item) => (item.name === "docker" || item.name === "podman") && item.available)?.name;
    const images = sandbox === "docker" || sandbox === "podman"
      ? await new ContainerAuditToolRunner(sandbox).doctor()
      : AUDIT_TOOL_CATALOG.map((definition) => ({ id: definition.id, image: definition.image, installed: false, sizeBytes: null }));
    const data = { sandbox: sandbox ?? null, tools: probes, images };
    const human = [
      ...probes.map((item) => `${item.available ? "✓" : "!"} ${item.name}${item.version === null ? "" : ` · ${item.version}`}`),
      ...images.map((item) => `${item.installed ? "✓" : "○"} ${item.id} · ${item.image}${item.sizeBytes === null ? "" : ` · ${formatBytes(item.sizeBytes)}`}`),
    ].join("\n");
    return success(command, data, human, json);
  } catch (error) {
    return failure(command, error, json);
  }
}

async function resolveAuditContext(values: ReadonlyMap<string, string>, cli: AuditCliContext): Promise<{ readonly context: AuditProjectContext; readonly defaultPath: string }> {
  const management = createManagementRuntime({ homeDir: cli.homeDir });
  const project = await management.projects.show(ProjectId.of(required(values, "project")));
  const featureIdValue = values.get("feature");
  if (featureIdValue === undefined) return { context: { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: null, featurePath: null }, defaultPath: "." };
  const feature = await management.features.show(FeatureId.of(featureIdValue));
  if (!feature.belongsTo(project.id)) throw new Error(`Feature ${featureIdValue} does not belong to Project ${project.id.value}`);
  const featurePath = relative(project.root, feature.root).replaceAll("\\", "/");
  return { context: { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: feature.id.value, featurePath }, defaultPath: featurePath };
}

function argumentSpec(action: string): StrictArgumentSpec {
  const project = { project: "string" as const, feature: "string" as const, json: "boolean" as const };
  const specs: Readonly<Record<string, StrictArgumentSpec>> = {
    inspect: { options: { ...project, path: "string" }, minPositionals: 0, maxPositionals: 0 },
    prepare: { options: { ...project, request: "string" }, minPositionals: 0, maxPositionals: 0 },
    start: { options: { ...project, confirm: "string" }, minPositionals: 1, maxPositionals: 1 },
    status: { options: project, minPositionals: 1, maxPositionals: 1 },
    show: { options: project, minPositionals: 1, maxPositionals: 1 },
    submit: { options: { ...project, module: "string", input: "string" }, minPositionals: 1, maxPositionals: 1 },
    finalize: { options: project, minPositionals: 1, maxPositionals: 1 },
    cancel: { options: project, minPositionals: 1, maxPositionals: 1 },
    resume: { options: project, minPositionals: 1, maxPositionals: 1 },
    list: { options: project, minPositionals: 0, maxPositionals: 0 },
    compare: { options: { ...project, baseline: "string" }, minPositionals: 1, maxPositionals: 1 },
    export: { options: { ...project, to: "string", "include-evidence": "boolean" }, minPositionals: 1, maxPositionals: 1 },
  };
  return specs[action] ?? { options: project };
}

function success(command: string, data: unknown, human: string, json: boolean): CliExecution {
  return { code: 0, stdout: json ? jsonEnvelope({ command, ok: true, data, message: human }) : `${human.trimEnd()}\n`, stderr: "" };
}

function failure(command: string, error: unknown, json: boolean): CliExecution {
  const message = error instanceof Error ? error.message : String(error);
  const code = error instanceof CliUsageError ? 64 : /not found/i.test(message) ? 4 : 3;
  return json
    ? { code, stdout: jsonEnvelope({ command, ok: false, data: null, errors: [message], errorCode: "audit_command_failed" }), stderr: "" }
    : { code, stdout: "", stderr: `${translate("common.error", { message })}\n` };
}

function humanInspection(data: Awaited<ReturnType<AuditService["inspect"]>>): string {
  return [
    translate("cli.audit.inspection", {
      project: data.projectId,
      commit: data.commitExact ?? translate("cli.audit.unknown"),
      workspace: translate(data.workspaceClean === true ? "cli.audit.workspace.clean" : data.workspaceClean === false ? "cli.audit.workspace.modified" : "cli.audit.unknown"),
    }),
    translate("cli.audit.sandbox", { runtime: data.sandbox.runtime ?? translate("cli.audit.unavailable") }),
    ...data.recommendations.map((item) => `${item.state === "recommended" ? "+" : item.state === "limited" ? "!" : "-"} ${item.moduleId} - ${item.state} - ${item.reason}`),
  ].join("\n");
}

function humanRun(data: { readonly id: string; readonly status: string; readonly fingerprint: string; readonly selectedModules: readonly string[]; readonly warnings: readonly string[]; readonly moduleStatuses?: Readonly<Record<string, string>>; readonly plan?: { readonly images: readonly { readonly reference: string; readonly installed: boolean | null; readonly sizeBytes: number | null }[]; readonly hosts: readonly string[]; readonly logicalCommands: readonly string[]; readonly estimatedDuration: string; readonly requiresAdditionalConfirmation: boolean } }): string {
  return [
    translate("cli.audit.summary", { id: data.id, status: data.status }),
    translate("cli.audit.modules", { modules: data.selectedModules.join(", ") }),
    ...(data.moduleStatuses === undefined ? [] : data.selectedModules.map((moduleId) => progressLine(moduleId, data.moduleStatuses?.[moduleId] ?? "pending"))),
    ...(data.plan === undefined ? [] : [
      translate("cli.audit.logicalCommands", { commands: data.plan.logicalCommands.join(", ") }),
      translate("cli.audit.images", { images: data.plan.images.length === 0 ? translate("cli.audit.images.none") : data.plan.images.map((item) => `${item.reference} (${translate(item.installed === true ? "cli.audit.image.present" : item.installed === false ? "cli.audit.image.absent" : "cli.audit.image.unknown")}${item.sizeBytes === null ? "" : `, ${formatBytes(item.sizeBytes)}`})`).join(", ") }),
      translate("cli.audit.hosts", { hosts: data.plan.hosts.length === 0 ? translate("cli.audit.hosts.none") : data.plan.hosts.join(", ") }),
      translate("cli.audit.duration", { duration: data.plan.estimatedDuration }),
      translate("cli.audit.confirmation", { state: translate(data.plan.requiresAdditionalConfirmation ? "cli.audit.required" : "cli.audit.notRequired") }),
    ]),
    translate("cli.audit.fingerprint", { fingerprint: data.fingerprint }),
    ...data.warnings.map((warning) => `! ${warning}`),
  ].join("\n");
}

function progressLine(moduleId: string, status: string): string {
  const icon = status === "complete" ? "+" : status === "pending" ? "-" : status === "partial" || status === "skipped" ? "!" : "x";
  return `${icon} ${moduleId} - ${status}`;
}

async function probe(name: string): Promise<{ readonly name: string; readonly available: boolean; readonly version: string | null }> {
  try {
    const result = await execFileAsync(name, ["--version"], { timeout: 5_000, encoding: "utf8" });
    return { name, available: true, version: result.stdout.trim().split("\n")[0] ?? null };
  } catch {
    return { name, available: false, version: null };
  }
}

function required(values: ReadonlyMap<string, string>, name: string): string {
  const value = values.get(name);
  if (value === undefined) throw new CliUsageError(`--${name} is required`);
  return value;
}
