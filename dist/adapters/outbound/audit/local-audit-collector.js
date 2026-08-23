/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import { isIP } from "node:net";
import { basename, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { AUDIT_MODULE_CATALOG, auditModuleDefinition } from "../../../domain/audit/module-catalog.js";
import { ContainerAuditToolRunner } from "./container-audit-tool-runner.js";
import { formatBytes, formatNumber, translate } from "../../../application/localization/locale.js";
const execFileAsync = promisify(execFile);
const MAX_FILES = 25_000;
const MAX_TEXT_BYTES = 256 * 1024;
const EXCLUDED_SEGMENTS = new Set([".git", ".arka-norn", "node_modules", "dist", "coverage", "vendor", "target", ".next", ".cache"]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs", ".java", ".kt", ".cs", ".rb", ".php", ".swift", ".cpp", ".c", ".h", ".vue", ".svelte"]);
export class LocalAuditCollector {
    toolRunnerFactory;
    constructor(toolRunnerFactory = (runtime) => new ContainerAuditToolRunner(runtime)) {
        this.toolRunnerFactory = toolRunnerFactory;
    }
    doctorTools(runtime, toolIds) {
        return this.toolRunnerFactory(runtime).doctor(toolIds);
    }
    async inspect(input) {
        const roots = input.paths.map((path) => containedRoot(input.projectRoot, path));
        const [git, inventory, sandbox] = await Promise.all([
            inspectGit(input.projectRoot),
            buildInventory(input.projectRoot, roots),
            inspectSandbox(),
        ]);
        const signals = inventory.signals.map((item) => item.id === "git" ? { ...item, detected: git.commit !== null, evidence: git.commit === null ? [] : item.evidence } : item);
        const fingerprint = hashJson({ commit: git.commit, status: git.status, paths: input.paths, files: inventory.fingerprint });
        return {
            schemaVersion: 1,
            projectId: input.projectId,
            projectName: input.projectName,
            projectRoot: input.projectRoot,
            featureId: input.featureId,
            scopePaths: input.paths,
            commitExact: git.commit,
            workspaceClean: git.clean,
            workspaceFingerprint: fingerprint,
            sandbox,
            signals,
            recommendations: recommendations(signals),
        };
    }
    async collect(moduleId, context) {
        const selection = context.request.modules.find((candidate) => candidate.moduleId === moduleId);
        const intent = moduleId === "M00" ? "discover" : selection?.intent ?? "discover";
        const depth = moduleId === "M00" ? "inventory" : selection?.depth ?? "inventory";
        const startedAt = context.now.toISOString();
        const observedAt = new Date().toISOString();
        const relevantSignals = context.inspection.signals.filter((signal) => auditModuleDefinition(moduleId).signalIds.includes(signal.id));
        const evidence = [...moduleEvidence(moduleId, relevantSignals, context, observedAt)];
        const limitations = [];
        const completed = relevantSignals.filter((signal) => signal.detected).map((signal) => signal.id);
        const requested = [...auditModuleDefinition(moduleId).signalIds];
        const missing = requested.filter((id) => !completed.includes(id));
        let status = missing.length === 0 ? "complete" : "partial";
        if (moduleId === "M00")
            status = "complete";
        if (depth === "dynamic" && !context.inspection.sandbox.available) {
            status = "partial";
            limitations.push(translate("audit.collector.dynamicUnavailable"));
        }
        const toolPlan = plannedTools(moduleId, depth, context.inspection);
        const tools = moduleId === "M01" ? [{ name: "git", version: await gitVersion(), dataVersion: null }] : [];
        const gitCollection = moduleId === "M01" && depth === "static" ? await collectGitMetrics(context, observedAt, evidence.length) : emptyCollection();
        requested.push(...gitCollection.requested);
        completed.push(...gitCollection.completed);
        evidence.push(...gitCollection.evidence);
        limitations.push(...gitCollection.limitations);
        if (gitCollection.limitations.length > 0)
            status = "partial";
        for (const invocation of toolPlan)
            requested.push(`tool:${invocation.id}`);
        const sandboxCollection = await collectSandboxTools(toolPlan, moduleId, depth, context, observedAt, evidence.length, this.toolRunnerFactory);
        tools.push(...sandboxCollection.tools);
        evidence.push(...sandboxCollection.evidence);
        completed.push(...sandboxCollection.completed);
        limitations.push(...sandboxCollection.limitations);
        if (sandboxCollection.limitations.length > 0)
            status = "partial";
        const declaredGaps = declaredCoverageGaps(moduleId, depth, context, toolPlan);
        requested.push(...declaredGaps.requested);
        limitations.push(...declaredGaps.limitations);
        if (declaredGaps.limitations.length > 0)
            status = "partial";
        const connected = await collectConnectedSources(moduleId, depth, context, observedAt, evidence.length);
        evidence.push(...connected.evidence);
        requested.push(...connected.requested);
        completed.push(...connected.completed);
        limitations.push(...connected.limitations);
        if (connected.limitations.length > 0)
            status = "partial";
        const imported = moduleId === "M00" ? emptyCollection() : await collectImportedSources(moduleId, context, observedAt, evidence.length);
        evidence.push(...imported.evidence);
        requested.push(...imported.requested);
        completed.push(...imported.completed);
        limitations.push(...imported.limitations);
        if (imported.limitations.length > 0)
            status = "partial";
        const missingAfterTools = requested.filter((id) => !completed.includes(id));
        if (missing.length > 0)
            limitations.push(translate("audit.collector.sourcesMissing", { sources: missing.join(", ") }));
        if (context.inspection.workspaceClean === false)
            limitations.push(translate("audit.collector.workspaceModified"));
        const title = auditModuleDefinition(moduleId).title;
        const summary = moduleId === "M00"
            ? `Project ${context.projectName}, commit ${context.inspection.commitExact ?? translate("audit.collector.unavailable")}, scope ${context.request.paths.join(", ")}.`
            : translate("audit.collector.coverage", { title, completed: formatNumber(completed.length), requested: formatNumber(requested.length) });
        return {
            schemaVersion: 1,
            auditId: context.auditId,
            moduleId,
            intent,
            depth,
            execution: { status, startedAt, endedAt: new Date().toISOString(), tools },
            assessment: intent === "discover" ? null : { status: "unknown", confidence: evidence.length > 0 ? "medium" : "low" },
            coverage: { requested, completed, missing: missingAfterTools },
            summary,
            strengths: [],
            findings: [],
            evidence,
            limitations,
            recommendations: [],
            decisionsRequired: [],
        };
    }
}
function declaredCoverageGaps(moduleId, depth, context, toolPlan) {
    const requested = [];
    const limitations = [];
    if (depth === "dynamic" && moduleId === "M02" && toolPlan.length === 0) {
        limitations.push(translate("audit.collector.testsSkipped"));
    }
    if (depth === "dynamic" && moduleId === "M09") {
        requested.push("probe:lighthouse", "probe:axe");
        limitations.push(translate("audit.collector.uxSkipped"));
    }
    if (depth === "dynamic" && moduleId === "M05" && context.request.capabilities.dynamicTargets.length > 0) {
        requested.push("probe:zap-baseline");
        limitations.push(translate("audit.collector.zapSkipped"));
    }
    if ((depth === "connected" || depth === "dynamic") && connectedModule(moduleId) && context.request.capabilities.allowedHosts.length === 0) {
        limitations.push(translate("audit.collector.connectedLimited"));
    }
    return { requested, limitations };
}
function emptyCollection() {
    return { evidence: [], completed: [], requested: [], limitations: [], tools: [] };
}
async function collectGitMetrics(context, observedAt, evidenceOffset) {
    const commands = [
        { id: "git-integrity", args: ["fsck", "--connectivity-only", "--no-progress"], summarize: () => translate("audit.collector.gitIntegrity") },
        { id: "git-history", args: ["rev-list", "--count", "HEAD"], summarize: (output) => translate("audit.collector.gitHistory", { count: formatNumber(Number.parseInt(output.trim(), 10) || 0) }) },
        { id: "git-concentration", args: ["shortlog", "-sne", "--all"], summarize: summarizeContributors },
        { id: "git-churn", args: ["log", "--numstat", "--format="], summarize: summarizeChurn },
    ];
    const evidence = [];
    const completed = [];
    const limitations = [];
    for (const command of commands) {
        try {
            const output = await git(context.projectRoot, command.args);
            evidence.push({
                id: `EV-M01-GIT-${String(evidenceOffset + evidence.length + 1).padStart(4, "0")}`,
                kind: "metric",
                summary: command.summarize(output),
                source: context.projectId,
                location: null,
                observedAt,
                producer: "arka-norn/git",
                toolVersion: await gitVersion(),
                dataVersion: context.inspection.commitExact,
                contentHash: createHash("sha256").update(output).digest("hex"),
                classification: "internal",
                redacted: true,
            });
            completed.push(command.id);
        }
        catch (error) {
            limitations.push(translate("audit.collector.commandFailed", { command: command.id, error: safeToolFailure(error instanceof Error ? error.message : String(error)) }));
        }
    }
    return { evidence, completed, requested: commands.map((command) => command.id), limitations, tools: [] };
}
function summarizeContributors(output) {
    const counts = output.split("\n").map((line) => Number.parseInt(line.trim().split(/\s+/)[0] ?? "0", 10)).filter((count) => Number.isFinite(count) && count > 0);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const dominant = total === 0 ? 0 : Math.round((Math.max(...counts) / total) * 100);
    return translate("audit.collector.contributors", { count: formatNumber(counts.length), percent: formatNumber(dominant) });
}
function summarizeChurn(output) {
    let additions = 0;
    let deletions = 0;
    let entries = 0;
    for (const line of output.split("\n")) {
        const [added, deleted] = line.split("\t");
        if (!/^\d+$/.test(added ?? "") || !/^\d+$/.test(deleted ?? ""))
            continue;
        additions += Number(added);
        deletions += Number(deleted);
        entries += 1;
    }
    return translate("audit.collector.churn", { count: formatNumber(entries), additions: formatNumber(additions), deletions: formatNumber(deletions) });
}
async function collectSandboxTools(plan, moduleId, depth, context, observedAt, evidenceOffset, runnerFactory) {
    if (plan.length === 0)
        return { evidence: [], completed: [], requested: [], limitations: [], tools: [] };
    const runtime = context.inspection.sandbox.runtime;
    if (runtime === null) {
        return { evidence: [], completed: [], requested: [], limitations: [translate("audit.collector.sandboxMissing", { tools: plan.map((item) => item.id).join(", ") })], tools: [] };
    }
    const evidence = [];
    const completed = [];
    const limitations = [];
    const tools = [];
    const runner = runnerFactory(runtime);
    for (const invocation of plan) {
        const result = await runner.run({
            toolId: invocation.id,
            projectRoot: context.projectRoot,
            arguments: invocation.arguments,
            allowPull: context.request.capabilities.allowImagePulls,
            allowNetwork: invocation.network && context.request.capabilities.allowedHosts.length > 0,
            writableWorkspace: invocation.writableWorkspace,
            timeoutMs: depth === "dynamic" ? 900_000 : 300_000,
        });
        tools.push({ name: invocation.id, version: null, dataVersion: null });
        evidence.push({
            id: `EV-${moduleId}-TOOL-${String(evidenceOffset + evidence.length + 1).padStart(4, "0")}`,
            kind: "command",
            summary: translate("audit.collector.toolSummary", { tool: invocation.id, status: result.status, code: result.exitCode ?? translate("audit.collector.unavailable"), truncation: result.truncated ? translate("audit.collector.truncated") : "" }),
            source: context.projectId,
            location: null,
            observedAt,
            producer: `arka-norn/container/${invocation.id}`,
            toolVersion: null,
            dataVersion: null,
            contentHash: createHash("sha256").update(`${result.stdout}\n${result.stderr}`).digest("hex"),
            classification: "internal",
            redacted: true,
        });
        if (result.status === "pass" || result.status === "findings")
            completed.push(`tool:${invocation.id}`);
        else
            limitations.push(`${invocation.id} non exploitable : ${safeToolFailure(result.stderr)}.`);
    }
    return { evidence, completed, requested: [], limitations, tools };
}
async function collectConnectedSources(moduleId, depth, context, observedAt, evidenceOffset) {
    if ((depth !== "connected" && depth !== "dynamic") || context.request.sources.urls.length === 0 || !connectedModule(moduleId)) {
        return { evidence: [], completed: [], requested: [], limitations: [], tools: [] };
    }
    const evidence = [];
    const completed = [];
    const requested = [];
    const limitations = [];
    for (const sourceUrl of context.request.sources.urls) {
        const host = new URL(sourceUrl).hostname.toLowerCase();
        requested.push(`source:${host}`);
        try {
            evidence.push(await fetchExternalEvidence(sourceUrl, context.request.capabilities.allowedHosts, context.request.capabilities.credentialRefs, observedAt, moduleId, evidenceOffset + evidence.length + 1));
            completed.push(`source:${host}`);
        }
        catch (error) {
            limitations.push(translate("audit.collector.connectedUnavailable", { host, error: safeToolFailure(error instanceof Error ? error.message : String(error)) }));
        }
    }
    return { evidence, completed, requested, limitations, tools: [] };
}
async function collectImportedSources(moduleId, context, observedAt, evidenceOffset) {
    const evidence = [];
    const completed = [];
    const requested = context.request.sources.paths.map((path) => `import:${path}`);
    const limitations = [];
    for (const path of context.request.sources.paths) {
        try {
            const absolute = containedRoot(context.projectRoot, path);
            const canonicalProject = await fs.realpath(context.projectRoot);
            const canonical = await fs.realpath(absolute);
            const canonicalRelative = relative(canonicalProject, canonical);
            if (canonicalRelative.startsWith("..") || resolve(canonicalProject, canonicalRelative) !== canonical)
                throw new Error("source hors Project");
            const stat = await fs.lstat(absolute);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_TEXT_BYTES)
                throw new Error(translate("audit.collector.fileRejected"));
            if (!/\.(?:json|md|ya?ml|csv|txt)$/i.test(path))
                throw new Error(translate("audit.collector.formatRejected"));
            const content = await fs.readFile(absolute, "utf8");
            if (/\.json$/i.test(path))
                JSON.parse(content);
            evidence.push({
                id: `EV-${moduleId}-IMPORT-${String(evidenceOffset + evidence.length + 1).padStart(4, "0")}`,
                kind: "file",
                summary: translate("audit.collector.imported", { path, bytes: formatBytes(Buffer.byteLength(content)) }),
                source: context.projectId,
                location: path,
                observedAt,
                producer: "arka-norn/import",
                toolVersion: null,
                dataVersion: null,
                contentHash: createHash("sha256").update(content).digest("hex"),
                classification: "internal",
                redacted: true,
            });
            completed.push(`import:${path}`);
        }
        catch (error) {
            limitations.push(translate("audit.collector.importRejected", { path, error: safeToolFailure(error instanceof Error ? error.message : String(error)) }));
        }
    }
    return { evidence, completed, requested, limitations, tools: [] };
}
function plannedTools(moduleId, depth, inspection) {
    if (depth === "inventory")
        return [];
    if (moduleId === "M02" && depth === "dynamic")
        return runnerTools(inspection);
    if (moduleId === "M04")
        return [{ id: "syft", arguments: ["dir:/workspace", "-o", "json"], network: false, writableWorkspace: false }];
    if (moduleId === "M05") {
        const local = [{ id: "gitleaks", arguments: ["dir", "/workspace", "--no-banner", "--report-format", "json", "--report-path", "/dev/stdout"], network: false, writableWorkspace: false }];
        return depth === "connected" || depth === "dynamic"
            ? [...local, { id: "trivy", arguments: ["fs", "--format", "json", "/workspace"], network: true, writableWorkspace: false }, { id: "grype", arguments: ["dir:/workspace", "-o", "json"], network: true, writableWorkspace: false }]
            : local;
    }
    if (moduleId === "M08")
        return [{ id: "syft", arguments: ["dir:/workspace", "-o", "spdx-json"], network: false, writableWorkspace: false }];
    if (moduleId === "M10" && depth === "dynamic")
        return [{ id: "terraform", arguments: ["validate", "-json"], network: false, writableWorkspace: true }];
    return [];
}
function runnerTools(inspection) {
    const manifests = inspection.signals.find((signal) => signal.id === "manifest")?.evidence ?? [];
    const tools = [];
    if (manifests.some((path) => path.endsWith("package.json")))
        tools.push({ id: "node", arguments: ["npm", "test", "--if-present"], network: false, writableWorkspace: true });
    if (manifests.some((path) => /(?:pyproject\.toml|requirements[^/]*\.txt)$/.test(path)))
        tools.push({ id: "python", arguments: ["python", "-m", "pytest", "-q"], network: false, writableWorkspace: true });
    if (manifests.some((path) => path.endsWith("go.mod")))
        tools.push({ id: "go", arguments: ["go", "test", "./..."], network: false, writableWorkspace: true });
    if (manifests.some((path) => path.endsWith("Cargo.toml")))
        tools.push({ id: "rust", arguments: ["cargo", "test", "--locked"], network: false, writableWorkspace: true });
    if (manifests.some((path) => path.endsWith("pom.xml")))
        tools.push({ id: "maven", arguments: ["mvn", "-B", "test"], network: false, writableWorkspace: true });
    if (manifests.some((path) => /build\.gradle(?:\.kts)?$/.test(path)))
        tools.push({ id: "gradle", arguments: ["gradle", "test", "--no-daemon"], network: false, writableWorkspace: true });
    return tools;
}
function safeToolFailure(value) {
    const line = value.trim().split("\n")[0] ?? translate("audit.collector.unknownError");
    return redact(line).slice(0, 240) || translate("audit.collector.unknownError");
}
function connectedModule(moduleId) {
    return ["M04", "M05", "M06", "M07", "M08", "M09", "M10", "M11"].includes(moduleId);
}
async function fetchExternalEvidence(sourceUrl, allowedHosts, credentialRefs, observedAt, moduleId, index) {
    let current = new URL(sourceUrl);
    let response;
    for (let redirect = 0; redirect <= 3; redirect += 1) {
        await assertPublicAllowedUrl(current, allowedHosts);
        response = await fetch(current, {
            method: "GET",
            redirect: "manual",
            headers: connectorHeaders(current.hostname.toLowerCase(), credentialRefs),
            signal: AbortSignal.timeout(15_000),
        });
        if (![301, 302, 303, 307, 308].includes(response.status))
            break;
        const location = response.headers.get("location");
        if (location === null || redirect === 3)
            throw new Error(translate("audit.collector.redirectRejected"));
        current = new URL(location, current);
    }
    if (response === undefined)
        throw new Error(translate("audit.collector.responseMissing"));
    if (!response.ok)
        throw new Error(translate("audit.collector.httpError", { status: response.status }));
    const contentLength = Number(response.headers.get("content-length") ?? "0");
    if (Number.isFinite(contentLength) && contentLength > MAX_TEXT_BYTES)
        throw new Error("source trop volumineuse");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_TEXT_BYTES)
        throw new Error("source trop volumineuse");
    const summary = translate("audit.collector.httpSummary", { host: current.hostname, status: response.status, bytes: formatBytes(bytes.byteLength), type: response.headers.get("content-type") ?? translate("audit.collector.typeUnknown") });
    return {
        id: `EV-${moduleId}-EXT-${String(index).padStart(4, "0")}`,
        kind: "external",
        summary,
        source: current.hostname,
        location: current.toString(),
        observedAt,
        producer: current.hostname === "api.github.com" || current.hostname === "github.com" ? "arka-norn/github" : current.hostname.endsWith("npmjs.org") ? "arka-norn/npm" : "arka-norn/http",
        toolVersion: null,
        dataVersion: response.headers.get("etag"),
        contentHash: createHash("sha256").update(bytes).digest("hex"),
        classification: "internal",
        redacted: true,
    };
}
function connectorHeaders(host, credentialRefs) {
    const headers = { accept: "application/json,text/plain,text/html;q=0.5", "user-agent": "arka-norn-audit/1" };
    const credentialName = host === "github.com" || host === "api.github.com"
        ? "GITHUB_TOKEN"
        : host.endsWith("npmjs.org") ? "NPM_TOKEN" : undefined;
    if (credentialName !== undefined && credentialRefs.includes(credentialName) && process.env[credentialName] !== undefined) {
        headers["authorization"] = `Bearer ${process.env[credentialName]}`;
    }
    return headers;
}
async function assertPublicAllowedUrl(url, allowedHosts) {
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" && url.protocol !== "http:")
        throw new Error(translate("audit.collector.protocolRejected"));
    if (!allowedHosts.includes(host))
        throw new Error(translate("audit.collector.hostNotAllowed"));
    if (host === "localhost" || host.endsWith(".localhost") || host === "metadata.google.internal")
        throw new Error(translate("audit.collector.localHostRejected"));
    const addresses = isIP(host) === 0 ? await lookup(host, { all: true, verbatim: true }) : [{ address: host, family: isIP(host) }];
    if (addresses.length === 0 || addresses.some((entry) => isPrivateAddress(entry.address)))
        throw new Error(translate("audit.collector.privateAddressRejected"));
}
function isPrivateAddress(address) {
    const normalized = address.toLowerCase();
    if (normalized === "::1" || normalized === "::" || normalized.startsWith("fe80:") || normalized.startsWith("fc") || normalized.startsWith("fd"))
        return true;
    const mapped = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
    const parts = mapped.split(".").map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255))
        return false;
    return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254)
        || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168)
        || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) || parts[0] >= 224;
}
async function buildInventory(projectRoot, roots) {
    const files = [];
    for (const root of roots)
        await walk(projectRoot, root, files);
    files.sort();
    const detected = (predicate) => files.filter(predicate).slice(0, 20);
    const source = detected((path) => SOURCE_EXTENSIONS.has(extension(path)));
    const tests = detected((path) => /(?:^|\/)(?:test|tests|__tests__|spec)(?:\/|\.)|\.(?:test|spec)\./i.test(path));
    const manifests = detected((path) => /(?:^|\/)(?:package\.json|pyproject\.toml|requirements[^/]*\.txt|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(?:\.kts)?|composer\.json)$/.test(path));
    const packageMetadata = await readPackageMetadata(projectRoot, files);
    const signals = [
        signal("git", true, [".git"]),
        signal("source", source.length > 0, source),
        signal("tests", tests.length > 0, tests),
        signal("manifest", manifests.length > 0, manifests),
        signal("security", detected((path) => /(?:SECURITY\.md|dependabot|codeql|gitleaks|trivy|renovate)/i.test(path)).length > 0, detected((path) => /(?:SECURITY\.md|dependabot|codeql|gitleaks|trivy|renovate)/i.test(path))),
        signal("cicd", detected((path) => /(?:^|\/)\.github\/workflows\/|\.gitlab-ci\.yml$|Jenkinsfile$|azure-pipelines\.yml$/i.test(path)).length > 0, detected((path) => /(?:^|\/)\.github\/workflows\/|\.gitlab-ci\.yml$|Jenkinsfile$|azure-pipelines\.yml$/i.test(path))),
        signal("observability", detected((path) => /(?:otel|opentelemetry|prometheus|grafana|datadog|sentry|runbook|slo)/i.test(path)).length > 0, detected((path) => /(?:otel|opentelemetry|prometheus|grafana|datadog|sentry|runbook|slo)/i.test(path))),
        signal("license", detected((path) => /(?:^|\/)(?:LICENSE|NOTICE)(?:\.[^/]*)?$/i.test(path)).length > 0, detected((path) => /(?:^|\/)(?:LICENSE|NOTICE)(?:\.[^/]*)?$/i.test(path))),
        signal("product", detected((path) => /(?:README|ROADMAP|CHANGELOG|concept|product|feature|ux|persona)/i.test(path)).length > 0, detected((path) => /(?:README|ROADMAP|CHANGELOG|concept|product|feature|ux|persona)/i.test(path))),
        signal("web", detected((path) => /(?:index\.html|next\.config|vite\.config|astro\.config|playwright|cypress)/i.test(path)).length > 0, detected((path) => /(?:index\.html|next\.config|vite\.config|astro\.config|playwright|cypress)/i.test(path))),
        signal("iac", detected((path) => /(?:\.tf$|Pulumi\.|cloudformation|kustomization|helm|Chart\.yaml)/i.test(path)).length > 0, detected((path) => /(?:\.tf$|Pulumi\.|cloudformation|kustomization|helm|Chart\.yaml)/i.test(path))),
        signal("containers", detected((path) => /(?:Dockerfile|compose\.ya?ml|\.dockerignore)$/i.test(path)).length > 0, detected((path) => /(?:Dockerfile|compose\.ya?ml|\.dockerignore)$/i.test(path))),
        signal("github", packageMetadata.github !== null, packageMetadata.github === null ? [] : [packageMetadata.github]),
        signal("npm", packageMetadata.packageName !== null, packageMetadata.packageName === null ? [] : [packageMetadata.packageName]),
    ];
    const fingerprint = createHash("sha256");
    for (const path of files) {
        const stat = await fs.stat(join(projectRoot, path));
        fingerprint.update(`${path}\0${stat.size}\0${stat.mtimeMs}\n`);
    }
    return { files, signals, counts: { files: files.length, source: source.length, tests: tests.length, manifests: manifests.length }, fingerprint: fingerprint.digest("hex") };
}
async function readPackageMetadata(projectRoot, files) {
    const packagePath = files.find((path) => path === "package.json" || path.endsWith("/package.json"));
    if (packagePath === undefined)
        return { packageName: null, github: null };
    const raw = await readBoundedText(join(projectRoot, packagePath));
    if (raw === undefined)
        return { packageName: null, github: null };
    try {
        const value = JSON.parse(raw);
        if (typeof value !== "object" || value === null || Array.isArray(value))
            return { packageName: null, github: null };
        const record = value;
        const packageName = typeof record["name"] === "string" && record["name"].length <= 214 ? record["name"] : null;
        const repositoryValue = typeof record["repository"] === "string"
            ? record["repository"]
            : typeof record["repository"] === "object" && record["repository"] !== null && !Array.isArray(record["repository"])
                ? record["repository"]["url"] : null;
        const github = typeof repositoryValue === "string" && /github\.com[/:]/i.test(repositoryValue) ? repositoryValue.slice(0, 512) : null;
        return { packageName, github };
    }
    catch {
        return { packageName: null, github: null };
    }
}
async function walk(projectRoot, directory, files) {
    if (files.length >= MAX_FILES)
        return;
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
        if (files.length >= MAX_FILES || entry.isSymbolicLink() || EXCLUDED_SEGMENTS.has(entry.name))
            continue;
        const absolute = join(directory, entry.name);
        if (entry.isDirectory())
            await walk(projectRoot, absolute, files);
        else if (entry.isFile())
            files.push(relative(projectRoot, absolute).replaceAll("\\", "/"));
    }
}
function recommendations(signals) {
    const byId = new Map(signals.map((item) => [item.id, item]));
    return AUDIT_MODULE_CATALOG.filter((definition) => definition.id !== "M00").map((definition) => {
        const matching = definition.signalIds.map((id) => byId.get(id)).filter((item) => item !== undefined);
        const found = matching.filter((item) => item.detected).length;
        const state = found === matching.length && found > 0
            ? "recommended"
            : found > 0 ? "available" : definition.id === "M05" || definition.id === "M08" ? "limited" : "probably_not_applicable";
        return {
            moduleId: definition.id,
            state,
            reason: found > 0 ? translate("audit.collector.signalsFound", { found: formatNumber(found), total: formatNumber(matching.length) }) : translate("audit.collector.noSpecificSource"),
            suggestedDepth: suggestedDepth(definition.id, state),
        };
    });
}
function suggestedDepth(moduleId, state) {
    if (state === "probably_not_applicable")
        return "inventory";
    if (["M05", "M06", "M07", "M08"].includes(moduleId))
        return "connected";
    return "static";
}
function moduleEvidence(moduleId, signals, context, observedAt) {
    return signals.filter((item) => item.detected).map((item, index) => {
        const summary = translate("audit.collector.signalSummary", { id: item.id, evidence: item.evidence.slice(0, 5).join(", ") });
        return {
            id: `EV-${moduleId}-${String(index + 1).padStart(4, "0")}`,
            kind: "file",
            summary: redact(summary),
            source: context.projectId,
            location: item.evidence[0] ?? null,
            observedAt,
            producer: "arka-norn/local-inventory",
            toolVersion: null,
            dataVersion: null,
            contentHash: createHash("sha256").update(summary).digest("hex"),
            classification: "internal",
            redacted: summary !== redact(summary),
        };
    });
}
async function inspectGit(root) {
    try {
        const commit = (await git(root, ["rev-parse", "HEAD"])).trim();
        const status = await git(root, ["status", "--porcelain=v1", "--untracked-files=normal", "--", ".", ":(exclude).arka-norn/audits"]);
        return { commit: /^[0-9a-f]{40,64}$/i.test(commit) ? commit : null, status, clean: status.trim().length === 0 };
    }
    catch {
        return { commit: null, status: "git-unavailable", clean: null };
    }
}
async function git(root, args) {
    const result = await execFileAsync("git", ["-c", "core.fsmonitor=false", "-c", "protocol.ext.allow=never", "--no-pager", ...args], {
        cwd: root,
        timeout: 30_000,
        maxBuffer: 2 * 1024 * 1024,
        encoding: "utf8",
        env: safeEnvironment({ GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" }),
    });
    return result.stdout;
}
async function gitVersion() {
    try {
        return (await execFileAsync("git", ["--version"], { timeout: 5_000, encoding: "utf8", env: safeEnvironment() })).stdout.trim();
    }
    catch {
        return null;
    }
}
async function inspectSandbox() {
    for (const runtime of ["docker", "podman"]) {
        try {
            await execFileAsync(runtime, ["--version"], { timeout: 5_000, encoding: "utf8", env: safeEnvironment() });
            return { runtime, available: true };
        }
        catch {
            // Continue to the next supported runtime.
        }
    }
    return { runtime: null, available: false };
}
function containedRoot(projectRoot, value) {
    if (value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.split(/[\\/]/).includes(".."))
        throw new Error(`Audit path is outside the Project: ${value}`);
    const target = resolve(projectRoot, value);
    const rel = relative(projectRoot, target);
    if (rel.startsWith("..") || resolve(projectRoot, rel) !== target)
        throw new Error(`Audit path is outside the Project: ${value}`);
    return target;
}
function signal(id, detected, evidence) {
    return { id, detected, evidence };
}
function extension(path) {
    const name = basename(path);
    const index = name.lastIndexOf(".");
    return index < 0 ? "" : name.slice(index).toLowerCase();
}
function hashJson(value) {
    return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function redact(value) {
    return value
        .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
        .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
        .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "Bearer [REDACTED]");
}
function safeEnvironment(extra = {}) {
    const environment = {};
    for (const name of ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "NO_COLOR", "TZ"]) {
        if (process.env[name] !== undefined)
            environment[name] = process.env[name];
    }
    return { ...environment, ...extra };
}
export async function readBoundedText(path) {
    try {
        const stat = await fs.stat(path);
        if (!stat.isFile() || stat.size > MAX_TEXT_BYTES)
            return undefined;
        return await fs.readFile(path, "utf8");
    }
    catch {
        return undefined;
    }
}
//# sourceMappingURL=local-audit-collector.js.map