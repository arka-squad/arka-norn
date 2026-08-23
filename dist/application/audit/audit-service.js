/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { createHash, randomBytes } from "node:crypto";
import { expandAuditModuleDependencies } from "../../domain/audit/module-catalog.js";
import { auditToolDefinition } from "../../domain/audit/tool-catalog.js";
import { buildCanonicalAudit, compareAudits, kbRecordsFromAudit, renderAuditReport } from "./audit-report.js";
import { parseAuditRequest, parseModuleResult } from "./audit-validation.js";
export class AuditService {
    store;
    collector;
    now;
    constructor(store, collector, now = () => new Date()) {
        this.store = store;
        this.collector = collector;
        this.now = now;
    }
    inspect(context, paths) {
        return this.collector.inspect({ ...context, paths });
    }
    async prepare(context, requestValue) {
        const request = parseAuditRequest(requestValue);
        if (context.featureId !== null && context.featurePath !== undefined && context.featurePath !== null)
            assertFeatureScope(request.paths, context.featurePath);
        const inspection = await this.inspect(context, request.paths);
        const selectedModules = expandAuditModuleDependencies(request.modules.map((module) => module.moduleId));
        const normalizedRequest = addDependencySelections(request, selectedModules);
        const toolIds = [...plannedToolIds(normalizedRequest, selectedModules, inspection)];
        const toolStatuses = toolIds.length === 0 || inspection.sandbox.runtime === null || this.collector.doctorTools === undefined ? [] : await this.collector.doctorTools(inspection.sandbox.runtime, toolIds);
        const plan = buildExecutionPlan(inspection, normalizedRequest, selectedModules, toolStatuses);
        const createdAt = this.now();
        const id = auditId(createdAt);
        const fingerprint = hashJson({ context: { projectId: context.projectId, featureId: context.featureId }, inspection, request: normalizedRequest, selectedModules, plan });
        const moduleStatuses = Object.fromEntries(selectedModules.map((moduleId) => [moduleId, "pending"]));
        const run = {
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
    async start(context, auditIdValue, confirmation) {
        return this.store.withRunLock(auditIdValue, () => this.startUnlocked(context, auditIdValue, confirmation));
    }
    async startUnlocked(context, auditIdValue, confirmation) {
        const current = await this.requiredRun(auditIdValue);
        if (current.projectId !== context.projectId || current.fingerprint !== confirmation)
            throw new Error("Audit confirmation does not match the immutable plan");
        if (current.status !== "planned" && current.status !== "interrupted")
            throw new Error(`Audit ${current.id} cannot start from ${current.status}`);
        const inspection = await this.inspect(context, current.request.paths);
        if (inspection.workspaceFingerprint !== current.inspection.workspaceFingerprint)
            throw new Error("Audit workspace changed after confirmation; prepare a new audit");
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
                if (current.status === "interrupted" && existing?.execution.status === "complete")
                    continue;
                const cached = await this.findReusableModule(run, moduleId);
                const result = cached ?? await this.collector.collect(moduleId, { ...context, auditId: run.id, request: run.request, inspection, now: this.now() });
                await this.store.saveModuleResult(result);
                run = withModuleStatus(run, moduleId, result.execution.status, this.now());
                await this.store.saveRun(run);
            }
            run = withRun(run, { status: "analyzing", updatedAt: this.now().toISOString(), attempts: closeAttempt(run.attempts, "completed", this.now()) });
            await this.store.saveRun(run);
            return run;
        }
        catch (error) {
            run = withRun(run, { status: "interrupted", updatedAt: this.now().toISOString(), attempts: closeAttempt(run.attempts, "interrupted", this.now()) });
            await this.store.saveRun(run);
            throw error;
        }
    }
    async submit(auditIdValue, moduleId, value) {
        return this.store.withRunLock(auditIdValue, () => this.submitUnlocked(auditIdValue, moduleId, value));
    }
    async submitUnlocked(auditIdValue, moduleId, value) {
        const run = await this.requiredRun(auditIdValue);
        if (run.status !== "analyzing" && run.status !== "collecting")
            throw new Error(`Audit ${run.id} does not accept analyses in ${run.status}`);
        if (!run.selectedModules.includes(moduleId))
            throw new Error(`Audit ${run.id} does not include ${moduleId}`);
        const result = parseModuleResult(value, run.id, moduleId);
        await this.store.saveModuleResult(result);
        await this.store.saveRun(withModuleStatus(run, moduleId, result.execution.status, this.now()));
        return result;
    }
    async finalize(auditIdValue) {
        return this.store.withRunLock(auditIdValue, () => this.finalizeUnlocked(auditIdValue));
    }
    async finalizeUnlocked(auditIdValue) {
        const run = await this.requiredRun(auditIdValue);
        if (run.status !== "analyzing")
            throw new Error(`Audit ${run.id} cannot be finalized from ${run.status}`);
        const results = await this.store.loadModuleResults(run.id);
        const missing = run.selectedModules.filter((moduleId) => !results.some((result) => result.moduleId === moduleId));
        if (missing.length > 0)
            throw new Error(`Audit modules are missing: ${missing.join(", ")}`);
        const audit = buildCanonicalAudit(run, results, this.now());
        await this.store.saveCanonical(audit);
        await this.store.saveKbRecords(kbRecordsFromAudit(audit));
        const reportPath = await this.store.saveReport(run.id, renderAuditReport(run, audit));
        const finalRun = withRun(run, { status: audit.status, updatedAt: this.now().toISOString() });
        await this.store.saveRun(finalRun);
        return { run: finalRun, audit, reportPath };
    }
    async cancel(auditIdValue) {
        return this.store.withRunLock(auditIdValue, () => this.cancelUnlocked(auditIdValue));
    }
    async cancelUnlocked(auditIdValue) {
        const run = await this.requiredRun(auditIdValue);
        if (["completed", "partial", "failed", "cancelled"].includes(run.status))
            throw new Error(`Audit ${run.id} cannot be cancelled from ${run.status}`);
        const cancelled = withRun(run, { status: "cancelled", updatedAt: this.now().toISOString(), attempts: closeAttempt(run.attempts, "cancelled", this.now()) });
        await this.store.saveRun(cancelled);
        return cancelled;
    }
    async resume(context, auditIdValue) {
        const run = await this.requiredRun(auditIdValue);
        if (run.status !== "interrupted")
            throw new Error(`Audit ${run.id} is not interrupted`);
        return this.start(context, run.id, run.fingerprint);
    }
    async compare(currentId, baselineId) {
        const current = await this.store.loadCanonical(currentId);
        const baseline = await this.store.loadCanonical(baselineId);
        if (current === undefined || baseline === undefined)
            throw new Error("Both audits must be finalized before comparison");
        if (current.projectId !== baseline.projectId)
            throw new Error("Audits from different Projects cannot be compared");
        return compareAudits(baseline, current);
    }
    async requiredRun(auditIdValue) {
        const run = await this.store.loadRun(auditIdValue);
        if (run === undefined)
            throw new Error(`Audit not found: ${auditIdValue}`);
        return run;
    }
    async findReusableModule(run, moduleId) {
        const selection = moduleId === "M00" ? { intent: "discover", depth: "inventaire" } : run.request.modules.find((candidate) => candidate.moduleId === moduleId);
        if (selection === undefined || selection.depth !== "inventaire")
            return undefined;
        for (const entry of await this.store.listRuns()) {
            if (entry.id === run.id || entry.projectId !== run.projectId || (entry.status !== "completed" && entry.status !== "partial"))
                continue;
            const previous = await this.store.loadRun(entry.id);
            if (previous === undefined || previous.inspection.commitExact !== run.inspection.commitExact || previous.inspection.workspaceFingerprint !== run.inspection.workspaceFingerprint)
                continue;
            if (JSON.stringify(previous.request.paths) !== JSON.stringify(run.request.paths))
                continue;
            const previousSelection = moduleId === "M00" ? { intent: "discover", depth: "inventaire" } : previous.request.modules.find((candidate) => candidate.moduleId === moduleId);
            if (previousSelection?.intent !== selection.intent || previousSelection.depth !== selection.depth)
                continue;
            const result = await this.store.loadModuleResult(entry.id, moduleId);
            if (result === undefined || result.execution.status !== "complete" || result.evidence.some((evidence) => evidence.kind === "external" || evidence.producer.startsWith("arka-norn/container/")))
                continue;
            return { ...result, auditId: run.id, strengths: [...result.strengths, `Collecte locale compatible réutilisée depuis ${entry.id}.`] };
        }
        return undefined;
    }
}
function assertFeatureScope(paths, featurePath) {
    const normalizedFeature = featurePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (paths.some((path) => path !== normalizedFeature && !path.startsWith(`${normalizedFeature}/`))) {
        throw new Error(`Audit paths must remain inside Feature scope: ${normalizedFeature}`);
    }
}
function buildExecutionPlan(inspection, request, selected, toolStatuses) {
    const toolIds = plannedToolIds(request, selected, inspection);
    const images = [...toolIds].map((toolId) => {
        const reference = auditToolDefinition(toolId).image;
        const status = toolStatuses.find((candidate) => candidate.image === reference);
        return { reference, installed: status?.installed ?? null, sizeBytes: status?.sizeBytes ?? null };
    });
    const logicalCommands = [
        "inventaire-local-lecture-seule",
        ...selected.filter((moduleId) => moduleId !== "M00").map((moduleId) => `collecte-${moduleId.toLowerCase()}`),
    ];
    const sensitive = images.length > 0 || request.capabilities.allowedHosts.length > 0 || request.capabilities.credentialRefs.length > 0
        || request.capabilities.dynamicTargets.length > 0 || request.modules.some((module) => module.depth === "dynamique");
    return {
        scopePaths: request.paths,
        commitExact: inspection.commitExact,
        images,
        hosts: request.capabilities.allowedHosts,
        credentialRefs: request.capabilities.credentialRefs,
        dynamicTargets: request.capabilities.dynamicTargets,
        logicalCommands,
        timeoutMs: request.modules.some((module) => module.depth === "dynamique") ? 900_000 : 300_000,
        estimatedDuration: request.modules.some((module) => module.depth === "dynamique") ? "10–30 min" : "1–10 min",
        requiresAdditionalConfirmation: sensitive,
    };
}
function plannedToolIds(request, selected, inspection) {
    const depths = new Map(request.modules.map((module) => [module.moduleId, module.depth]));
    const toolIds = new Set();
    for (const moduleId of selected) {
        const depth = depths.get(moduleId);
        if (depth === undefined || depth === "inventaire")
            continue;
        if (moduleId === "M02" && depth === "dynamique")
            for (const toolId of runnerToolIds(inspection))
                toolIds.add(toolId);
        if (moduleId === "M04" || moduleId === "M08")
            toolIds.add("syft");
        if (moduleId === "M05") {
            toolIds.add("gitleaks");
            if (depth === "connecte" || depth === "dynamique") {
                toolIds.add("trivy");
                toolIds.add("grype");
            }
        }
        if (moduleId === "M10" && depth === "dynamique")
            toolIds.add("terraform");
    }
    return toolIds;
}
function runnerToolIds(inspection) {
    const manifests = inspection.signals.find((signal) => signal.id === "manifest")?.evidence ?? [];
    const ids = [];
    if (manifests.some((path) => path.endsWith("package.json")))
        ids.push("node");
    if (manifests.some((path) => /(?:pyproject\.toml|requirements[^/]*\.txt)$/.test(path)))
        ids.push("python");
    if (manifests.some((path) => path.endsWith("go.mod")))
        ids.push("go");
    if (manifests.some((path) => path.endsWith("Cargo.toml")))
        ids.push("rust");
    if (manifests.some((path) => path.endsWith("pom.xml")))
        ids.push("maven");
    if (manifests.some((path) => /build\.gradle(?:\.kts)?$/.test(path)))
        ids.push("gradle");
    return ids;
}
function addDependencySelections(request, selected) {
    const byId = new Map(request.modules.map((module) => [module.moduleId, module]));
    const dependencyIntent = request.mode === "audit" ? "audit" : "discover";
    const modules = selected.filter((id) => id !== "M00").map((moduleId) => byId.get(moduleId) ?? { moduleId, intent: dependencyIntent, depth: "statique", criteria: [] });
    return { ...request, modules };
}
function preparationWarnings(inspection, request) {
    const warnings = [];
    if (inspection.workspaceClean === false)
        warnings.push("Le workspace est modifié et sera identifié comme non commité.");
    if (request.modules.some((module) => module.depth === "dynamique") && !inspection.sandbox.available)
        warnings.push("Docker ou Podman est requis pour les modules dynamiques.");
    return warnings;
}
function withModuleStatus(run, moduleId, status, now) {
    return withRun(run, { moduleStatuses: { ...run.moduleStatuses, [moduleId]: status }, updatedAt: now.toISOString() });
}
function withRun(run, patch) {
    return { ...run, ...patch };
}
function closeAttempt(attempts, status, now) {
    return attempts.map((attempt, index) => index === attempts.length - 1 && attempt.status === "running" ? { ...attempt, status, endedAt: now.toISOString() } : attempt);
}
function auditId(now) {
    const stamp = now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "z").toLowerCase();
    return `audit-${stamp}-${randomBytes(4).toString("hex")}`;
}
function hashJson(value) {
    return createHash("sha256").update(stableJson(value)).digest("hex");
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(",")}]`;
    if (value !== null && typeof value === "object") {
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
//# sourceMappingURL=audit-service.js.map