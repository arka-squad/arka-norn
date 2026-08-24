/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolveAcpExecutable } from "../adapters/outbound/execution/secure-runtime.js";
import { delimiter, dirname, isAbsolute, resolve } from "node:path";
import { existsSync, realpathSync, statSync } from "node:fs";
import { containsSecretLikeText } from "../domain/orchestration/mission-order.js";
const WRITE_CAPABILITIES = ["inspect_workspace", "modify_workspace", "read_pipeline"];
const RECIPE_CAPABILITIES = [...WRITE_CAPABILITIES, "run_commands"];
const WRITE_WORKER_PERMISSIONS = ["read_workspace", "write_workspace"];
const READ_ONLY_CAPABILITIES = ["inspect_workspace", "read_pipeline"];
const READ_ONLY_WORKER_PERMISSIONS = ["read_workspace"];
export function configuredProviderHealth(environment = process.env) {
    const claude = localCliIdentity(environment, "claude");
    const codex = localCliIdentity(environment, "codex");
    return [
        {
            provider: "claude",
            healthy: claude !== undefined,
            capabilities: RECIPE_CAPABILITIES,
            ...(claude === undefined ? {} : { runtimeVersion: claude.version, runtimeFingerprint: claude.fingerprint }),
        },
        {
            provider: "codex",
            healthy: codex !== undefined,
            capabilities: RECIPE_CAPABILITIES,
            ...(codex === undefined ? {} : { runtimeVersion: codex.version, runtimeFingerprint: codex.fingerprint }),
        },
        {
            provider: "kimi",
            healthy: isConfiguredAcpExecutable(environment["ARKA_NORN_KIMI_ACP_COMMAND"]) && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_KIMI_API_KEY"]),
            capabilities: READ_ONLY_CAPABILITIES,
        },
        {
            provider: "zai",
            healthy: environment["ARKA_NORN_MASTRA_ZAI_ENABLED"] === "1" && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_ZAI_API_KEY"]),
            capabilities: RECIPE_CAPABILITIES,
        },
    ];
}
function localCliIdentity(environment, provider) {
    const command = configuredLocalCli(environment, provider);
    if (command === undefined)
        return undefined;
    try {
        const info = statSync(command);
        const result = spawnSync(command, ["--version"], {
            encoding: "utf8",
            timeout: 3_000,
            maxBuffer: 64 * 1024,
            windowsHide: true,
            env: controlledVersionEnvironment(environment, command),
        });
        if (result.error !== undefined || result.status !== 0)
            return undefined;
        const version = `${result.stdout ?? ""}\n${result.stderr ?? ""}`.replace(/[\u0000-\u001f\u007f]+/gu, " ").trim().slice(0, 240);
        if (version.length === 0)
            return undefined;
        const fingerprint = createHash("sha256").update(JSON.stringify({
            command,
            version,
            size: info.size,
            modifiedAt: info.mtimeMs,
            device: info.dev,
            inode: info.ino,
        })).digest("hex");
        return { version, fingerprint };
    }
    catch {
        return undefined;
    }
}
function controlledVersionEnvironment(environment, command) {
    const result = {
        PATH: [dirname(command), "/usr/bin", "/bin"].join(delimiter),
        LANG: environment["LANG"] ?? "C.UTF-8",
        LC_ALL: environment["LC_ALL"] ?? environment["LANG"] ?? "C.UTF-8",
    };
    if (process.platform === "win32" && environment["SystemRoot"] !== undefined)
        result["SystemRoot"] = environment["SystemRoot"];
    return result;
}
export function providerMission(record, prompt, workspace, environment, frameworkContext) {
    const permissionPolicy = {
        mode: "preauthorized-workspace",
        scopePaths: record.order.scope.paths,
        permissions: record.order.requiredPermissions.filter((permission) => permission === "read_workspace" || permission === "write_workspace"),
    };
    if (permissionPolicy.permissions.length === 0)
        throw new Error("The mission has no workspace permission.");
    const governed = frameworkContext === undefined ? {} : { frameworkContext };
    if (record.target.source !== "user" || record.target.model === undefined) {
        throw new Error("A confirmed assistant and version are required for dispatch.");
    }
    if (record.target.provider === "zai") {
        return {
            provider: "claude",
            providerProfile: "zai",
            executionId: record.id,
            mission: prompt,
            workspace,
            permissionPolicy,
            ...governed,
            model: record.target.model,
        };
    }
    if (record.target.provider === "claude" || record.target.provider === "codex") {
        return {
            provider: record.target.provider === "claude" ? "claude-cli" : "codex-cli",
            executionId: record.id,
            mission: prompt,
            workspace,
            permissionPolicy,
            ...governed,
            command: requiredLocalCli(environment, record.target.provider),
            model: record.target.model,
        };
    }
    if (record.target.provider === "kimi") {
        return {
            provider: "kimi-acp",
            executionId: record.id,
            mission: prompt,
            workspace,
            permissionPolicy,
            ...governed,
            command: requiredAcpCommand(environment, "kimi"),
            args: ["acp"],
            model: record.target.model,
        };
    }
    return {
        provider: "codex-acp",
        executionId: record.id,
        mission: prompt,
        workspace,
        permissionPolicy,
        ...governed,
        command: requiredAcpCommand(environment, "codex"),
        args: configuredAcpArguments(environment["ARKA_NORN_CODEX_ACP_ARGS"]),
        model: record.target.model,
    };
}
export function requirementsForExecution(role) {
    if (role === "audit")
        return { capabilities: READ_ONLY_CAPABILITIES, permissions: READ_ONLY_WORKER_PERMISSIONS };
    return { capabilities: role === "dev" || role === "qa" ? RECIPE_CAPABILITIES : WRITE_CAPABILITIES, permissions: WRITE_WORKER_PERMISSIONS };
}
export function providerLabel(provider) {
    if (provider === "claude")
        return "Claude Code CLI";
    if (provider === "codex")
        return "Codex CLI";
    if (provider === "kimi")
        return "Kimi Platform";
    return "Z.AI Coding Plan";
}
function configuredLocalCli(environment, provider) {
    const explicit = environment[provider === "claude" ? "ARKA_NORN_CLAUDE_CLI_COMMAND" : "ARKA_NORN_CODEX_CLI_COMMAND"];
    if (explicit !== undefined) {
        if (!safeConfigurationValue(explicit) || !isAbsolute(explicit))
            return undefined;
        try {
            return resolveAcpExecutable(explicit);
        }
        catch {
            return undefined;
        }
    }
    const names = process.platform === "win32" ? [`${provider}.exe`, `${provider}.cmd`, provider] : [provider];
    for (const directory of (environment["PATH"] ?? "").split(delimiter).filter(Boolean)) {
        for (const name of names) {
            const candidate = resolve(directory, name);
            try {
                if (!existsSync(candidate) || !statSync(candidate).isFile())
                    continue;
                return realpathSync(candidate);
            }
            catch {
                // Continue with the next deterministic PATH candidate.
            }
        }
    }
    return undefined;
}
function requiredLocalCli(environment, provider) {
    const command = configuredLocalCli(environment, provider);
    if (command === undefined) {
        throw new Error(`${provider === "claude" ? "Claude Code" : "Codex"} CLI is not installed or not available on PATH.`);
    }
    return command;
}
export function matchesExecutionProvider(agentProvider, selectedProvider) {
    const normalized = agentProvider.trim().toLowerCase();
    if (selectedProvider === "claude")
        return normalized.includes("claude");
    if (selectedProvider === "codex")
        return normalized.includes("codex");
    if (selectedProvider === "kimi")
        return normalized.includes("kimi");
    return normalized.includes("z.ai") || normalized.includes("zai");
}
export function providerCredentialsFrom(environment) {
    const claudeApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_CLAUDE_API_KEY"]);
    const codexApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_CODEX_API_KEY"]);
    const kimiApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_KIMI_API_KEY"]);
    const zaiApiKey = explicitProviderCredential(environment["ARKA_NORN_MASTRA_ZAI_API_KEY"]);
    return {
        ...(claudeApiKey === undefined ? {} : { claudeApiKey }),
        ...(codexApiKey === undefined ? {} : { codexApiKey }),
        ...(kimiApiKey === undefined ? {} : { kimiApiKey }),
        ...(zaiApiKey === undefined ? {} : { zaiApiKey }),
    };
}
function isConfiguredAcpExecutable(value) {
    if (value === undefined || !safeConfigurationValue(value))
        return false;
    try {
        resolveAcpExecutable(value);
        return true;
    }
    catch {
        return false;
    }
}
function requiredAcpCommand(environment, provider) {
    const name = provider === "codex" ? "ARKA_NORN_CODEX_ACP_COMMAND" : "ARKA_NORN_KIMI_ACP_COMMAND";
    const value = environment[name];
    if (value === undefined || !safeConfigurationValue(value)) {
        throw new Error(`A configured absolute ${provider === "codex" ? "Codex" : "Kimi Code"} ACP executable is required.`);
    }
    return resolveAcpExecutable(value);
}
function configuredAcpArguments(value) {
    if (value === undefined || value.trim() === "")
        return [];
    let parsed;
    try {
        parsed = JSON.parse(value);
    }
    catch {
        throw new Error("ARKA_NORN_CODEX_ACP_ARGS must be a JSON string array.");
    }
    if (!Array.isArray(parsed))
        throw new Error("ARKA_NORN_CODEX_ACP_ARGS contains an unsafe value.");
    return Object.freeze(parsed.map((item) => {
        if (typeof item !== "string" || !safeConfigurationValue(item)) {
            throw new Error("ARKA_NORN_CODEX_ACP_ARGS contains an unsafe value.");
        }
        return item;
    }));
}
function hasExplicitProviderCredential(value) {
    return explicitProviderCredential(value) !== undefined;
}
function explicitProviderCredential(value) {
    if (value === undefined)
        return undefined;
    if (value.length === 0 || value.length > 16 * 1024 || value.includes("\u0000")) {
        throw new Error("An explicit provider credential is invalid.");
    }
    return value;
}
function safeConfigurationValue(value) {
    return value.length <= 4_096
        && !value.includes("\u0000")
        && !containsSecretLikeText(value)
        && !/(?:token|secret|password|api[_-]?key|authorization|credential)/iu.test(value);
}
//# sourceMappingURL=orchestration-provider-configuration.js.map