/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { access, chmod, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { basename, delimiter, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { writeFileAtomic } from "../filesystem/_shared/atomic-json.js";
const MAX_OUTPUT_BYTES = 512 * 1024;
const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
const SAFE_PATH = ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
export class LocalExecutionProfileRuntimeAdapter {
    homeDir;
    environment;
    constructor(homeDir, environment = process.env) {
        this.homeDir = homeDir;
        this.environment = environment;
    }
    async prepare(profile) {
        const props = profile.props;
        if (!props.enabled)
            throw coded("runtime_dependency_missing", "Execution profile is disabled.");
        if (props.gateway !== undefined && (props.gateway.endpoint === undefined || props.gateway.catalogRef === undefined))
            throw coded("gateway_profile_missing", "Gateway profiles require a controlled endpoint and catalog reference.");
        if (props.gateway?.endpoint !== undefined && !props.egressHosts.includes(new URL(props.gateway.endpoint).hostname))
            throw coded("gateway_profile_missing", "Gateway endpoint is absent from the profile egress allowlist.");
        const command = await this.resolveCommand(props.transport);
        const fingerprint = hash(JSON.stringify({ id: props.id, transport: props.transport, provider: props.provider, model: props.model, gateway: props.gateway, capabilities: props.capabilities, egressHosts: props.egressHosts }));
        const home = join(this.homeDir, ".arka-norn", "runtime-profiles", props.id, fingerprint.slice(0, 16));
        await mkdir(home, { recursive: true, mode: 0o700 });
        const credential = await this.resolveCredential(profile);
        const temporaryDirectory = join(home, "tmp");
        const runtimeEnvironment = {
            HOME: home,
            USERPROFILE: home,
            PATH: controlledPath(command),
            LANG: "C.UTF-8",
            LC_ALL: "C.UTF-8",
            TMPDIR: temporaryDirectory,
            TMP: temporaryDirectory,
            TEMP: temporaryDirectory,
            NO_COLOR: "1",
            ...windowsRuntimeEnvironment(),
            ...credential,
        };
        await mkdir(runtimeEnvironment["TMPDIR"], { recursive: true, mode: 0o700 });
        if (props.transport === "codex-cli") {
            runtimeEnvironment["CODEX_HOME"] = home;
            await this.writeCodexProfile(profile, home);
        }
        else if (props.transport === "claude-cli") {
            const claudeHome = join(home, "claude");
            await mkdir(claudeHome, { recursive: true, mode: 0o700 });
            runtimeEnvironment["CLAUDE_CONFIG_DIR"] = claudeHome;
        }
        return Object.freeze({ profileId: props.id, command, home, environment: Object.freeze(runtimeEnvironment), fingerprint });
    }
    async preflight(profile, workspace) {
        if (profile.transport === "api" || profile.transport === "gemini-cli")
            return Object.freeze({ profileId: profile.id, healthy: false, code: "runtime_dependency_missing", message: `The ${profile.transport} task worker adapter is not installed in Norn 2.3.0.` });
        let runtime;
        try {
            runtime = await this.prepare(profile);
        }
        catch (error) {
            return failure(profile.id, error);
        }
        const version = await run(runtime.command, ["--version"], workspace, runtime.environment);
        if (version.code !== 0)
            return result(profile.id, false, "runtime_failed", "The local runtime version probe failed.", version);
        const runtimeVersion = firstLine(version.stdout || version.stderr);
        const runtimeFingerprint = hash(JSON.stringify({ command: runtime.command, version: runtimeVersion, profile: runtime.fingerprint }));
        const exact = await this.exactProbe(profile, runtime, workspace);
        if (exact.code !== 0)
            return { ...result(profile.id, false, "model_unresolvable", "The selected gateway, provider or model could not complete the exact preflight.", exact), runtimeVersion, runtimeFingerprint };
        return Object.freeze({ profileId: profile.id, healthy: true, code: "profile_valid", message: "The exact worker profile resolved its runtime and model.", runtimeVersion, runtimeFingerprint, exitCode: 0 });
    }
    async exactProbe(profile, runtime, workspace) {
        const output = join(runtime.home, "preflight-output.txt");
        const prompt = "Reply with exactly NORN_PREFLIGHT_OK. Do not inspect or modify files and do not call tools.";
        if (profile.transport === "codex-cli") {
            return run(runtime.command, [
                "--sandbox", "read-only",
                "--ask-for-approval", "never",
                "--cd", workspace,
                "--model", profile.model,
                "--disable", "shell_tool",
                "--disable", "unified_exec",
                "--disable", "multi_agent",
                "--disable", "browser_use",
                "--disable", "computer_use",
                "--disable", "apps",
                "--strict-config",
                "exec",
                "--ephemeral",
                "--ignore-rules",
                "--color", "never",
                "--output-last-message", output,
                prompt,
            ], workspace, runtime.environment);
        }
        if (profile.transport === "claude-cli")
            return run(runtime.command, ["-p", prompt, "--model", profile.model, "--permission-mode", "plan", "--output-format", "text", "--no-session-persistence"], workspace, runtime.environment);
        return run(runtime.command, ["-p", prompt, "--model", profile.model], workspace, runtime.environment);
    }
    async writeCodexProfile(profile, home) {
        const props = profile.props;
        const lines = [`model = ${tomlString(props.model)}`];
        if (props.gateway !== undefined) {
            const catalogSource = props.gateway.catalogRef;
            if (!isAbsolute(catalogSource))
                throw coded("gateway_profile_missing", "Gateway catalog reference must be an absolute path.");
            const raw = await boundedRead(catalogSource, MAX_CATALOG_BYTES).catch(() => { throw coded("gateway_profile_missing", "Gateway catalog is unavailable."); });
            let catalog;
            try {
                catalog = JSON.parse(raw);
            }
            catch {
                throw coded("gateway_profile_missing", "Gateway catalog is not valid JSON.");
            }
            if (containsCredential(catalog))
                throw coded("gateway_profile_missing", "Gateway catalog contains credential-like values.");
            if (!catalogModelIdentifiers(catalog).has(props.model))
                throw coded("model_unresolvable", `Model ${props.model} is absent from the controlled gateway catalog.`);
            const expectedFingerprint = hash(JSON.stringify({ kind: props.gateway.kind, endpoint: props.gateway.endpoint, catalogSha256: hash(raw) }));
            if (expectedFingerprint !== props.gateway.fingerprint)
                throw coded("gateway_profile_missing", "Gateway fingerprint no longer matches its endpoint and catalog.");
            const target = join(home, "model-catalog.json");
            await writeFile(target, `${JSON.stringify(catalog, null, 2)}\n`, { mode: 0o600 });
            await chmod(target, 0o600);
            const providerKey = props.provider.toLocaleLowerCase("en").replace(/[^a-z0-9_-]+/gu, "-").replace(/^-+|-+$/gu, "") || "gateway";
            lines.push(`model_provider = ${tomlString(providerKey)}`);
            lines.push(`[model_providers.${providerKey}]`);
            lines.push(`name = ${tomlString(`OpenCodex ${props.provider}`)}`);
            lines.push(`base_url = ${tomlString(props.gateway.endpoint)}`);
            lines.push(`env_key = ${tomlString(props.credentialRef?.environmentVariable ?? "OPENAI_API_KEY")}`);
            lines.push('wire_api = "responses"');
        }
        await writeFileAtomic(join(home, "config.toml"), `${lines.join("\n")}\n`, { mode: 0o600 });
    }
    async resolveCredential(profile) {
        const reference = profile.props.credentialRef;
        if (reference === undefined)
            return {};
        if (reference.kind === "environment") {
            const value = this.environment[reference.name];
            if (value === undefined || value.length === 0)
                throw coded("credential_unavailable", `Credential environment reference ${reference.name} is unavailable.`);
            return { [reference.environmentVariable]: value };
        }
        if (process.platform !== "darwin")
            throw coded("credential_unavailable", "Keychain credential references require macOS Keychain.");
        const security = await findExecutable("security", ["/usr/bin", "/bin"]);
        const result = await run(security, ["find-generic-password", "-s", reference.name, "-w"], this.homeDir, { HOME: this.homeDir, PATH: "/usr/bin:/bin", LANG: "C", LC_ALL: "C" });
        const value = result.stdout.trim();
        if (result.code !== 0 || value.length === 0)
            throw coded("credential_unavailable", `Keychain reference ${reference.name} is unavailable.`);
        return { [reference.environmentVariable]: value };
    }
    async resolveCommand(transport) {
        const variable = transport === "codex-cli" ? "ARKA_NORN_CODEX_CLI_COMMAND" : transport === "claude-cli" ? "ARKA_NORN_CLAUDE_CLI_COMMAND" : transport === "gemini-cli" ? "ARKA_NORN_GEMINI_CLI_COMMAND" : "ARKA_NORN_API_COMMAND";
        const configured = this.environment[variable];
        if (configured !== undefined) {
            if (!isAbsolute(configured))
                throw coded("runtime_dependency_missing", `${variable} must be an absolute executable path.`);
            try {
                await access(configured, constants.X_OK);
            }
            catch {
                throw coded("runtime_dependency_missing", `Configured runtime is not executable: ${basename(configured)}.`);
            }
            try {
                return await normalizeExecutable(configured);
            }
            catch {
                throw coded("runtime_dependency_missing", `Configured runtime is not executable: ${basename(configured)}.`);
            }
        }
        const name = transport === "codex-cli" ? "codex" : transport === "claude-cli" ? "claude" : transport === "gemini-cli" ? "gemini" : "arka-norn-api-runtime";
        const configuredPath = this.environment[process.platform === "win32" ? "Path" : "PATH"] ?? this.environment["PATH"];
        const searchDirectories = [...SAFE_PATH, dirname(process.execPath), ...(configuredPath === undefined ? [] : configuredPath.split(delimiter))];
        try {
            return await normalizeExecutable(await findExecutable(name, searchDirectories));
        }
        catch {
            throw coded("runtime_dependency_missing", `Runtime dependency is missing: ${name}.`);
        }
    }
}
async function boundedRead(path, maximum) { const value = await readFile(path); if (value.byteLength > maximum)
    throw new Error("file too large"); return value.toString("utf8"); }
async function findExecutable(name, directories) {
    const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
    for (const directory of [...new Set(directories.filter((value) => value.length > 0))]) {
        for (const extension of extensions) {
            const candidate = join(directory, `${name}${extension}`);
            try {
                await access(candidate, constants.X_OK);
                return candidate;
            }
            catch {
                continue;
            }
        }
    }
    throw new Error(`Executable ${name} was not found.`);
}
async function normalizeExecutable(command) {
    const resolved = await realpath(command);
    if (!(await stat(resolved)).isFile())
        throw new Error("Runtime command is not a regular file.");
    if (process.platform !== "win32" || extname(resolved).toLowerCase() !== ".cmd")
        return resolved;
    const raw = await boundedRead(resolved, 64 * 1024);
    const matches = [...raw.matchAll(/"%dp0%\\([^"\r\n]+?\.(?:cjs|mjs|js))"/giu)];
    for (const match of matches) {
        const suffix = match[1];
        if (suffix === undefined)
            continue;
        const candidate = resolve(dirname(resolved), ...suffix.split(/[\\/]+/u));
        const relation = relative(dirname(resolved), candidate);
        if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation))
            continue;
        try {
            const script = await realpath(candidate);
            if ((await stat(script)).isFile())
                return script;
        }
        catch {
            continue;
        }
    }
    throw new Error("Windows command shim does not expose a bounded Node entrypoint.");
}
function controlledPath(command) { return [...new Set([dirname(command), dirname(process.execPath), ...SAFE_PATH])].join(delimiter); }
function windowsRuntimeEnvironment() {
    if (process.platform !== "win32")
        return {};
    const systemRoot = process.env["SystemRoot"] ?? process.env["SYSTEMROOT"];
    return systemRoot === undefined ? {} : { SystemRoot: systemRoot, SYSTEMROOT: systemRoot };
}
async function run(command, args, cwd, environment) {
    return new Promise((resolvePromise, reject) => {
        const invocation = nodeInvocation(command, args);
        const child = spawn(invocation.command, invocation.args, { cwd, env: { ...environment }, stdio: ["ignore", "pipe", "pipe"], shell: false, windowsHide: true });
        let stdout = "";
        let stderr = "";
        const append = (value, chunk) => { const next = value + chunk.toString("utf8"); if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
            child.kill("SIGTERM");
            return next.slice(0, MAX_OUTPUT_BYTES);
        } return next; };
        child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
        child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
        child.on("error", reject);
        child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
    });
}
function nodeInvocation(command, args) {
    return /\.(?:cjs|mjs|js)$/iu.test(command)
        ? { command: process.execPath, args: [command, ...args] }
        : { command, args };
}
function result(profileId, healthy, code, message, processResult) { return Object.freeze({ profileId, healthy, code, message, exitCode: processResult.code, ...(processResult.stderr.trim() === "" ? {} : { stderrExcerpt: sanitize(processResult.stderr) }) }); }
function failure(profileId, error) { const value = error instanceof ProfileRuntimeError ? error : coded("runtime_failed", error instanceof Error ? error.message : String(error)); return Object.freeze({ profileId, healthy: false, code: value.code, message: value.message }); }
class ProfileRuntimeError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
function coded(code, message) { return new ProfileRuntimeError(code, message); }
function firstLine(value) { return sanitize(value).split("\n")[0].slice(0, 240); }
function sanitize(value) { return value.replaceAll(/(?:Bearer\s+|sk-)[a-z0-9._-]+/giu, "[REDACTED]").replaceAll(/((?:api[_ -]?key|access[_ -]?token|password|secret))\s*[:=]\s*\S+/giu, "$1=[REDACTED]").replaceAll(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/gu, " ").trim().slice(0, 1_000); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function tomlString(value) { return JSON.stringify(value); }
function containsCredential(value) { if (typeof value === "string")
    return /(?:Bearer\s+|sk-)[a-z0-9._-]{12,}|(?:api[_ -]?key|access[_ -]?token|password|secret)\s*[:=]/iu.test(value); if (Array.isArray(value))
    return value.some(containsCredential); if (typeof value === "object" && value !== null)
    return Object.entries(value).some(([key, entry]) => /^(?:api[_-]?key|token|password|secret)$/iu.test(key) || containsCredential(entry)); return false; }
function catalogModelIdentifiers(value, identifiers = new Set()) { if (Array.isArray(value))
    for (const entry of value)
        catalogModelIdentifiers(entry, identifiers);
else if (typeof value === "object" && value !== null)
    for (const [key, entry] of Object.entries(value)) {
        if (["id", "model", "slug"].includes(key) && typeof entry === "string")
            identifiers.add(entry);
        catalogModelIdentifiers(entry, identifiers);
    } return identifiers; }
//# sourceMappingURL=execution-profile-runtime-adapter.js.map