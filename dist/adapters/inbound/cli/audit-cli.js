/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { execFile } from "node:child_process";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import { AuditService } from "../../../application/audit/audit-service.js";
import { AUDIT_TOOL_CATALOG } from "../../../domain/audit/tool-catalog.js";
import { isAuditModuleId } from "../../../domain/audit/audit-types.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createManagementRuntime } from "../../../composition/management-runtime.js";
import { LocalAuditCollector } from "../../outbound/audit/local-audit-collector.js";
import { ContainerAuditToolRunner } from "../../outbound/audit/container-audit-tool-runner.js";
import { FsAuditStore } from "../../outbound/filesystem/fs-audit-store.js";
import { readJson } from "../../outbound/filesystem/_shared/atomic-json.js";
import { CliUsageError, parseStrictArguments } from "./strict-arguments.js";
const execFileAsync = promisify(execFile);
export const AUDIT_HELP = `Audit et découverte assistés (hors Pipeline)

  audit inspect --project <id> [--feature <id>] [--path <rel>] [--json]
  audit prepare --project <id> --request <request.json> [--feature <id>] [--json]
  audit start <audit-id> --project <id> --confirm <empreinte> [--json]
  audit status <audit-id> --project <id> [--json]
  audit submit <audit-id> --project <id> --module <M00..M11> --input <result.json> [--json]
  audit finalize <audit-id> --project <id> [--json]
  audit cancel|resume <audit-id> --project <id> [--json]
  audit list --project <id> [--json]
  audit show <audit-id> --project <id> [--json]
  audit compare <audit-id> --baseline <audit-id> --project <id> [--json]
  audit kb search --project <id> [--domain <Mxx>] [--severity <niveau>] [--priority <valeur>] [--status <état>] [--type <type>] [--scope <scope>] [--audit <id>] [--commit <sha>] [--confidence <niveau>] [--origin <origine>] [--json]
  audit evidence show <evidence-id> --audit <audit-id> --project <id> [--json]
  audit export <audit-id> --project <id> --to <dossier> [--include-evidence] [--json]
  audit tools doctor --project <id> [--json]
`;
export async function runAuditCommand(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    const command = `audit.${action ?? "unknown"}`;
    try {
        if (action === undefined || action === "help" || action === "--help" || action === "-h")
            return success(command, AUDIT_HELP, AUDIT_HELP, json);
        if (action === "kb")
            return await runKb(rest, context);
        if (action === "evidence")
            return await runEvidence(rest, context);
        if (action === "tools")
            return await runTools(rest, context);
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
            const request = await readJson(resolve(context.cwd, requestPath));
            if (request === undefined)
                throw new Error(`Audit request not found: ${requestPath}`);
            const data = await service.prepare(resolved.context, request);
            return success(command, data, humanRun(data), json);
        }
        if (action === "start") {
            const data = await service.start(resolved.context, parsed.positionals[0], required(parsed.values, "confirm"));
            return success(command, data, humanRun(data), json);
        }
        if (action === "status") {
            const data = await service.requiredRun(parsed.positionals[0]);
            return success(command, data, humanRun(data), json);
        }
        if (action === "show") {
            const run = await service.requiredRun(parsed.positionals[0]);
            const audit = await store.loadCanonical(run.id);
            const data = { run, audit, reportPath: audit === undefined ? null : resolve(run.inspection.projectRoot, ".arka-norn", "audits", run.id, "report.md") };
            return success(command, data, audit === undefined ? humanRun(run) : `Audit ${run.id} · ${run.status}\nRapport : ${data.reportPath}`, json);
        }
        if (action === "submit") {
            const moduleId = required(parsed.values, "module");
            if (!isAuditModuleId(moduleId))
                throw new CliUsageError("--module must be M00..M11");
            const input = await readJson(resolve(context.cwd, required(parsed.values, "input")));
            if (input === undefined)
                throw new Error("Audit module input not found");
            const data = await service.submit(parsed.positionals[0], moduleId, input);
            return success(command, data, `${moduleId} enregistré et validé.`, json);
        }
        if (action === "finalize") {
            const data = await service.finalize(parsed.positionals[0]);
            return success(command, data, `Audit ${data.run.id} · ${data.run.status}\nRapport : ${data.reportPath}`, json);
        }
        if (action === "cancel") {
            const data = await service.cancel(parsed.positionals[0]);
            return success(command, data, humanRun(data), json);
        }
        if (action === "resume") {
            const data = await service.resume(resolved.context, parsed.positionals[0]);
            return success(command, data, humanRun(data), json);
        }
        if (action === "list") {
            const data = await store.listRuns();
            const human = data.length === 0 ? "Aucun audit local." : data.map((entry) => `${entry.id} · ${entry.status} · ${entry.mode}`).join("\n");
            return success(command, data, human, json);
        }
        if (action === "compare") {
            const data = await service.compare(parsed.positionals[0], required(parsed.values, "baseline"));
            return success(command, data, `Nouveaux ${data.new.length} · persistants ${data.persisting.length} · résolus ${data.resolved.length} · régressions ${data.regressed.length}`, json);
        }
        if (action === "export") {
            const data = await store.exportAudit(parsed.positionals[0], resolve(context.cwd, required(parsed.values, "to")), parsed.booleans.has("include-evidence"));
            return success(command, data, `Export terminé : ${data.length} fichier(s).`, json);
        }
        throw new CliUsageError(`unknown audit action: ${action}\n\n${AUDIT_HELP}`);
    }
    catch (error) {
        return failure(command, error, json);
    }
}
async function runKb(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    const command = `audit.kb.${action ?? "unknown"}`;
    try {
        if (action !== "search")
            throw new CliUsageError("audit kb action must be search");
        const parsed = parseStrictArguments(rest, { options: { project: "string", domain: "string", severity: "string", priority: "string", status: "string", type: "string", scope: "string", audit: "string", commit: "string", confidence: "string", origin: "string", json: "boolean" }, minPositionals: 0, maxPositionals: 0 });
        const resolved = await resolveAuditContext(parsed.values, context);
        const aliases = { domain: "moduleId", audit: "auditId", commit: "commitExact" };
        const filters = Object.fromEntries(["domain", "severity", "priority", "status", "type", "scope", "audit", "commit", "confidence", "origin"].flatMap((name) => parsed.values.get(name) === undefined ? [] : [[aliases[name] ?? name, parsed.values.get(name)]]));
        const data = await new FsAuditStore(resolved.context.projectRoot).searchKb(filters);
        const human = data.length === 0 ? "Aucune entrée KB correspondante." : data.map((record) => `${record.id} · ${record.moduleId} · ${record.severity ?? "n/a"} · ${record.title}`).join("\n");
        return success(command, data, human, json);
    }
    catch (error) {
        return failure(command, error, json);
    }
}
async function runEvidence(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    const command = `audit.evidence.${action ?? "unknown"}`;
    try {
        if (action !== "show")
            throw new CliUsageError("audit evidence action must be show");
        const parsed = parseStrictArguments(rest, { options: { project: "string", audit: "string", json: "boolean" }, minPositionals: 1, maxPositionals: 1 });
        const resolved = await resolveAuditContext(parsed.values, context);
        const data = await new FsAuditStore(resolved.context.projectRoot).loadEvidence(required(parsed.values, "audit"), parsed.positionals[0]);
        if (data === undefined)
            throw new Error(`Evidence not found: ${parsed.positionals[0]}`);
        return success(command, data, `${data.id} · ${data.kind} · ${data.summary}`, json);
    }
    catch (error) {
        return failure(command, error, json);
    }
}
async function runTools(argv, context) {
    const action = argv[0];
    const rest = argv.slice(1);
    const json = rest.includes("--json");
    const command = `audit.tools.${action ?? "unknown"}`;
    try {
        if (action !== "doctor")
            throw new CliUsageError("audit tools action must be doctor");
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
    }
    catch (error) {
        return failure(command, error, json);
    }
}
async function resolveAuditContext(values, cli) {
    const management = createManagementRuntime({ homeDir: cli.homeDir });
    const project = await management.projects.show(ProjectId.of(required(values, "project")));
    const featureIdValue = values.get("feature");
    if (featureIdValue === undefined)
        return { context: { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: null, featurePath: null }, defaultPath: "." };
    const feature = await management.features.show(FeatureId.of(featureIdValue));
    if (!feature.belongsTo(project.id))
        throw new Error(`Feature ${featureIdValue} does not belong to Project ${project.id.value}`);
    const featurePath = relative(project.root, feature.root).replaceAll("\\", "/");
    return { context: { projectId: project.id.value, projectName: project.name, projectRoot: project.root, featureId: feature.id.value, featurePath }, defaultPath: featurePath };
}
function argumentSpec(action) {
    const project = { project: "string", feature: "string", json: "boolean" };
    const specs = {
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
function success(command, data, human, json) {
    return { code: 0, stdout: json ? `${JSON.stringify({ schemaVersion: 1, command, ok: true, data, errors: [], warnings: [] })}\n` : `${human.trimEnd()}\n`, stderr: "" };
}
function failure(command, error, json) {
    const message = error instanceof Error ? error.message : String(error);
    const code = error instanceof CliUsageError ? 64 : /not found/i.test(message) ? 4 : 3;
    return json
        ? { code, stdout: `${JSON.stringify({ schemaVersion: 1, command, ok: false, data: null, errors: [message], warnings: [] })}\n`, stderr: "" }
        : { code, stdout: "", stderr: `ERREUR — ${message}\n` };
}
function humanInspection(data) {
    return [
        `Project ${data.projectId} · commit ${data.commitExact ?? "inconnu"} · workspace ${data.workspaceClean === true ? "propre" : data.workspaceClean === false ? "modifié" : "inconnu"}`,
        `Sandbox : ${data.sandbox.runtime ?? "indisponible"}`,
        ...data.recommendations.map((item) => `${item.state === "recommande" ? "✓" : item.state === "limite" ? "!" : "○"} ${item.moduleId} · ${item.state} · ${item.reason}`),
    ].join("\n");
}
function humanRun(data) {
    return [
        `Audit ${data.id} · ${data.status}`,
        `Modules : ${data.selectedModules.join(", ")}`,
        ...(data.moduleStatuses === undefined ? [] : data.selectedModules.map((moduleId) => progressLine(moduleId, data.moduleStatuses?.[moduleId] ?? "pending"))),
        ...(data.plan === undefined ? [] : [
            `Commandes logiques : ${data.plan.logicalCommands.join(", ")}`,
            `Images : ${data.plan.images.length === 0 ? "aucune" : data.plan.images.map((item) => `${item.reference} (${item.installed === true ? "présente" : item.installed === false ? "absente" : "état inconnu"}${item.sizeBytes === null ? "" : `, ${formatBytes(item.sizeBytes)}`})`).join(", ")}`,
            `Hôtes : ${data.plan.hosts.length === 0 ? "aucun" : data.plan.hosts.join(", ")}`,
            `Durée indicative : ${data.plan.estimatedDuration}`,
            `Confirmation sensible : ${data.plan.requiresAdditionalConfirmation ? "requise" : "non requise"}`,
        ]),
        `Empreinte : ${data.fingerprint}`,
        ...data.warnings.map((warning) => `! ${warning}`),
    ].join("\n");
}
function formatBytes(value) {
    if (value < 1_024)
        return `${value} o`;
    if (value < 1_048_576)
        return `${Math.round(value / 1_024)} Kio`;
    return `${Math.round(value / 1_048_576)} Mio`;
}
function progressLine(moduleId, status) {
    const icon = status === "complete" ? "✓" : status === "pending" ? "○" : status === "partial" || status === "skipped" ? "!" : "×";
    return `${icon} ${moduleId} · ${status}`;
}
async function probe(name) {
    try {
        const result = await execFileAsync(name, ["--version"], { timeout: 5_000, encoding: "utf8" });
        return { name, available: true, version: result.stdout.trim().split("\n")[0] ?? null };
    }
    catch {
        return { name, available: false, version: null };
    }
}
function required(values, name) {
    const value = values.get(name);
    if (value === undefined)
        throw new CliUsageError(`--${name} is required`);
    return value;
}
//# sourceMappingURL=audit-cli.js.map