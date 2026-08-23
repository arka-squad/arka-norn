/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { AUDIT_TOOL_CATALOG, auditToolDefinition } from "../../../domain/audit/tool-catalog.js";
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_COPY_FILES = 50_000;
const MAX_COPY_BYTES = 1024 * 1024 * 1024;
export class ContainerAuditToolRunner {
    runtime;
    constructor(runtime) {
        this.runtime = runtime;
    }
    async doctor(toolIds) {
        const statuses = [];
        for (const definition of AUDIT_TOOL_CATALOG.filter((candidate) => toolIds === undefined || toolIds.includes(candidate.id))) {
            const result = await execute(this.runtime, ["image", "inspect", "--format", "{{.Size}}", definition.image], 15_000);
            const sizeBytes = Number.parseInt(result.stdout.trim(), 10);
            statuses.push({ id: definition.id, image: definition.image, installed: result.exitCode === 0, sizeBytes: result.exitCode === 0 && Number.isFinite(sizeBytes) ? sizeBytes : null });
        }
        return statuses;
    }
    async run(invocation) {
        validateInvocation(invocation);
        const definition = auditToolDefinition(invocation.toolId);
        const installed = (await execute(this.runtime, ["image", "inspect", definition.image], 15_000)).exitCode === 0;
        if (!installed && !invocation.allowPull)
            return { status: "not_executed", exitCode: null, stdout: "", stderr: "Image absente et téléchargement non autorisé.", truncated: false };
        if (!installed) {
            const pull = await execute(this.runtime, ["pull", definition.image], Math.max(invocation.timeoutMs, 120_000));
            if (pull.exitCode !== 0)
                return { ...pull, status: "error" };
        }
        if (definition.network === "allowlisted") {
            const reason = invocation.allowNetwork
                ? "Collecteur connecté suspendu : aucun proxy d'egress à allowlist n'est configuré."
                : "Accès réseau requis mais non autorisé.";
            return { status: "not_executed", exitCode: null, stdout: "", stderr: reason, truncated: false };
        }
        const projectRoot = await fs.realpath(invocation.projectRoot);
        let temporaryRoot;
        try {
            const workspace = invocation.writableWorkspace ? await createWorkspaceCopy(projectRoot) : projectRoot;
            if (invocation.writableWorkspace)
                temporaryRoot = workspace;
            const mountMode = invocation.writableWorkspace ? "" : ",readonly";
            const args = [
                "run", "--rm", "--network", "none", "--read-only", "--pids-limit", "128", "--memory", "2g", "--cpus", "2",
                "--security-opt", "no-new-privileges", "--cap-drop", "ALL", "--env", "HOME=/tmp", "--env", "CI=1",
                "--mount", `type=bind,src=${workspace},dst=/workspace${mountMode}`,
                "--tmpfs", "/tmp:rw,nosuid,nodev,size=536870912", "--workdir", "/workspace",
                definition.image, ...invocation.arguments,
            ];
            const result = await execute(this.runtime, args, invocation.timeoutMs);
            return { ...result, status: result.exitCode === 0 ? "pass" : result.exitCode === 1 ? "findings" : "error" };
        }
        catch (error) {
            return { status: "error", exitCode: null, stdout: "", stderr: redact(error instanceof Error ? error.message : String(error)), truncated: false };
        }
        finally {
            if (temporaryRoot !== undefined)
                await fs.rm(temporaryRoot, { recursive: true, force: true });
        }
    }
}
async function createWorkspaceCopy(projectRoot) {
    const temporaryRoot = await fs.mkdtemp(join(tmpdir(), "arka-norn-audit-workspace-"));
    const counters = { files: 0, bytes: 0 };
    try {
        await copyDirectoryBounded(projectRoot, temporaryRoot, counters);
        return temporaryRoot;
    }
    catch (error) {
        await fs.rm(temporaryRoot, { recursive: true, force: true });
        throw error;
    }
}
async function copyDirectoryBounded(source, destination, counters) {
    await fs.mkdir(destination, { recursive: true, mode: 0o700 });
    for (const entry of await fs.readdir(source, { withFileTypes: true })) {
        if (entry.name === ".git" || entry.name === ".arka-norn")
            continue;
        const from = join(source, entry.name);
        const to = join(destination, basename(entry.name));
        if (entry.isSymbolicLink())
            continue;
        if (entry.isDirectory()) {
            await copyDirectoryBounded(from, to, counters);
            continue;
        }
        if (!entry.isFile())
            continue;
        const stat = await fs.stat(from);
        counters.files += 1;
        counters.bytes += stat.size;
        if (counters.files > MAX_COPY_FILES || counters.bytes > MAX_COPY_BYTES)
            throw new Error("Audit workspace copy exceeds the configured bounds");
        await fs.copyFile(from, to);
    }
}
function validateInvocation(invocation) {
    const definition = auditToolDefinition(invocation.toolId);
    if (!Array.isArray(invocation.arguments) || invocation.arguments.length > definition.maximumArguments)
        throw new Error("Audit tool arguments exceed the catalog limit");
    for (const argument of invocation.arguments) {
        if (typeof argument !== "string" || argument.length > 4_096 || /[\u0000-\u001f\u007f]/.test(argument))
            throw new Error("Audit tool argument is invalid");
        if (/^(?:--entrypoint|--privileged|--volume|-v|--mount|--network|--cap-add|--security-opt)$/i.test(argument))
            throw new Error("Container control arguments are forbidden");
    }
    if (!Number.isInteger(invocation.timeoutMs) || invocation.timeoutMs < 1_000 || invocation.timeoutMs > 3_600_000)
        throw new Error("Audit tool timeout is invalid");
}
async function execute(command, args, timeoutMs) {
    return await new Promise((resolveResult) => {
        const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"], env: safeEnvironment(), shell: false });
        let stdout = Buffer.alloc(0);
        let stderr = Buffer.alloc(0);
        let truncated = false;
        const append = (current, chunk) => {
            if (current.length >= MAX_OUTPUT_BYTES) {
                truncated = true;
                return current;
            }
            const remaining = MAX_OUTPUT_BYTES - current.length;
            if (chunk.length > remaining)
                truncated = true;
            return Buffer.concat([current, chunk.subarray(0, remaining)]);
        };
        child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
        const timer = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
        child.on("error", (error) => {
            clearTimeout(timer);
            resolveResult({ exitCode: null, stdout: "", stderr: redact(error.message), truncated });
        });
        child.on("close", (code) => {
            clearTimeout(timer);
            resolveResult({ exitCode: code, stdout: redact(stdout.toString("utf8")), stderr: redact(stderr.toString("utf8")), truncated });
        });
    });
}
function safeEnvironment() {
    const environment = {};
    for (const name of ["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "NO_COLOR", "TZ"]) {
        if (process.env[name] !== undefined)
            environment[name] = process.env[name];
    }
    return environment;
}
function redact(value) {
    return value
        .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "[REDACTED]")
        .replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED]")
        .replace(/\bBearer\s+[A-Za-z0-9._-]{12,}\b/gi, "Bearer [REDACTED]")
        .replace(/((?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]\s*)\S+/gi, "$1[REDACTED]");
}
//# sourceMappingURL=container-audit-tool-runner.js.map