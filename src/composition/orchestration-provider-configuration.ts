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

import { resolveAcpExecutable } from "../adapters/outbound/execution/secure-runtime.js";
import { delimiter, isAbsolute, resolve } from "node:path";
import { existsSync, realpathSync, statSync } from "node:fs";
import type { OrchestratedAgentRole } from "../ports/inbound/for-agent-orchestration.js";
import type { AgentExecutionMission } from "../ports/outbound/agent-execution-port.js";
import type { ExecutionProviderHealth, ExecutionRequirements } from "../domain/orchestration/execution-policy.js";
import type { ExecutionRecord } from "../domain/orchestration/execution-record.js";
import { containsSecretLikeText } from "../domain/orchestration/mission-order.js";
import type { ExecutionCapability, ExecutionPermission, ExecutionProvider } from "../domain/orchestration/types.js";

const WRITE_CAPABILITIES: readonly ExecutionCapability[] = ["inspect_workspace", "modify_workspace", "read_pipeline"];
const WRITE_WORKER_PERMISSIONS: readonly ExecutionPermission[] = ["read_workspace", "write_workspace"];
const READ_ONLY_CAPABILITIES: readonly ExecutionCapability[] = ["inspect_workspace", "read_pipeline"];
const READ_ONLY_WORKER_PERMISSIONS: readonly ExecutionPermission[] = ["read_workspace"];

export function configuredProviderHealth(environment: NodeJS.ProcessEnv = process.env): readonly ExecutionProviderHealth[] {
  return [
    {
      provider: "claude",
      healthy: configuredLocalCli(environment, "claude") !== undefined,
      capabilities: WRITE_CAPABILITIES,
    },
    {
      provider: "codex",
      healthy: configuredLocalCli(environment, "codex") !== undefined,
      capabilities: WRITE_CAPABILITIES,
    },
    {
      provider: "kimi",
      healthy: isConfiguredAcpExecutable(environment["ARKA_NORN_KIMI_ACP_COMMAND"]) && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_KIMI_API_KEY"]),
      capabilities: READ_ONLY_CAPABILITIES,
    },
    {
      provider: "zai",
      healthy: environment["ARKA_NORN_MASTRA_ZAI_ENABLED"] === "1" && hasExplicitProviderCredential(environment["ARKA_NORN_MASTRA_ZAI_API_KEY"]),
      capabilities: WRITE_CAPABILITIES,
    },
  ];
}

export function providerMission(record: ExecutionRecord, prompt: string, workspace: string, environment: NodeJS.ProcessEnv): AgentExecutionMission {
  const permissionPolicy = {
    mode: "preauthorized-workspace" as const,
    scopePaths: ["."],
    permissions: record.order.requiredPermissions.filter((permission): permission is "read_workspace" | "write_workspace" => permission === "read_workspace" || permission === "write_workspace"),
  };
  if (permissionPolicy.permissions.length === 0) throw new Error("The mission has no workspace permission.");
  if (record.target.source !== "user" || record.target.model === undefined) {
    throw new Error("A confirmed assistant and version are required for dispatch.");
  }
  if (record.target.provider === "zai") {
    return {
      provider: "claude",
      providerProfile: "zai" as const,
      executionId: record.id,
      mission: prompt,
      workspace,
      permissionPolicy,
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
    command: requiredAcpCommand(environment, "codex"),
    args: configuredAcpArguments(environment["ARKA_NORN_CODEX_ACP_ARGS"]),
    model: record.target.model,
  };
}

export function requirementsForExecution(role: OrchestratedAgentRole): ExecutionRequirements {
  return role === "audit"
    ? { capabilities: READ_ONLY_CAPABILITIES, permissions: READ_ONLY_WORKER_PERMISSIONS }
    : { capabilities: WRITE_CAPABILITIES, permissions: WRITE_WORKER_PERMISSIONS };
}

export function providerLabel(provider: ExecutionProvider): string {
  if (provider === "claude") return "Claude Code CLI";
  if (provider === "codex") return "Codex CLI";
  if (provider === "kimi") return "Kimi Platform";
  return "Z.AI Coding Plan";
}

function configuredLocalCli(environment: NodeJS.ProcessEnv, provider: "claude" | "codex"): string | undefined {
  const explicit = environment[provider === "claude" ? "ARKA_NORN_CLAUDE_CLI_COMMAND" : "ARKA_NORN_CODEX_CLI_COMMAND"];
  if (explicit !== undefined) {
    if (!safeConfigurationValue(explicit) || !isAbsolute(explicit)) return undefined;
    try {
      return resolveAcpExecutable(explicit);
    } catch {
      return undefined;
    }
  }
  const names = process.platform === "win32" ? [`${provider}.exe`, `${provider}.cmd`, provider] : [provider];
  for (const directory of (environment["PATH"] ?? "").split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = resolve(directory, name);
      try {
        if (!existsSync(candidate) || !statSync(candidate).isFile()) continue;
        return realpathSync(candidate);
      } catch {
        // Continue with the next deterministic PATH candidate.
      }
    }
  }
  return undefined;
}

function requiredLocalCli(environment: NodeJS.ProcessEnv, provider: "claude" | "codex"): string {
  const command = configuredLocalCli(environment, provider);
  if (command === undefined) {
    throw new Error(`${provider === "claude" ? "Claude Code" : "Codex"} CLI is not installed or not available on PATH.`);
  }
  return command;
}

export function matchesExecutionProvider(agentProvider: string, selectedProvider: ExecutionProvider): boolean {
  const normalized = agentProvider.trim().toLowerCase();
  if (selectedProvider === "claude") return normalized.includes("claude");
  if (selectedProvider === "codex") return normalized.includes("codex");
  if (selectedProvider === "kimi") return normalized.includes("kimi");
  return normalized.includes("z.ai") || normalized.includes("zai");
}

export function providerCredentialsFrom(environment: NodeJS.ProcessEnv): {
  readonly claudeApiKey?: string;
  readonly codexApiKey?: string;
  readonly kimiApiKey?: string;
  readonly zaiApiKey?: string;
} {
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

function isConfiguredAcpExecutable(value: string | undefined): boolean {
  if (value === undefined || !safeConfigurationValue(value)) return false;
  try {
    resolveAcpExecutable(value);
    return true;
  } catch {
    return false;
  }
}

function requiredAcpCommand(environment: NodeJS.ProcessEnv, provider: "codex" | "kimi"): string {
  const name = provider === "codex" ? "ARKA_NORN_CODEX_ACP_COMMAND" : "ARKA_NORN_KIMI_ACP_COMMAND";
  const value = environment[name];
  if (value === undefined || !safeConfigurationValue(value)) {
    throw new Error(`A configured absolute ${provider === "codex" ? "Codex" : "Kimi Code"} ACP executable is required.`);
  }
  return resolveAcpExecutable(value);
}

function configuredAcpArguments(value: string | undefined): readonly string[] {
  if (value === undefined || value.trim() === "") return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("ARKA_NORN_CODEX_ACP_ARGS must be a JSON string array.");
  }
  if (!Array.isArray(parsed)) throw new Error("ARKA_NORN_CODEX_ACP_ARGS contains an unsafe value.");
  return Object.freeze(parsed.map((item: unknown) => {
    if (typeof item !== "string" || !safeConfigurationValue(item)) {
      throw new Error("ARKA_NORN_CODEX_ACP_ARGS contains an unsafe value.");
    }
    return item;
  }));
}

function hasExplicitProviderCredential(value: string | undefined): boolean {
  return explicitProviderCredential(value) !== undefined;
}

function explicitProviderCredential(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  if (value.length === 0 || value.length > 16 * 1024 || value.includes("\u0000")) {
    throw new Error("An explicit provider credential is invalid.");
  }
  return value;
}

function safeConfigurationValue(value: string): boolean {
  return value.length <= 4_096
    && !value.includes("\u0000")
    && !containsSecretLikeText(value)
    && !/(?:token|secret|password|api[_-]?key|authorization|credential)/iu.test(value);
}
