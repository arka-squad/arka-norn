#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";

if (process.env.ARKA_MASTRA_SMOKE !== "1") {
  console.error("Smoke Mastra désactivé. Définir ARKA_MASTRA_SMOKE=1 pour une exécution réelle explicite.");
  process.exitCode = 64;
} else {
  await runSmoke();
}

async function runSmoke() {
  const requestedProvider = process.env.ARKA_MASTRA_SMOKE_PROVIDER ?? "codex";
  const provider = normalizeProvider(requestedProvider);
  const workspace = resolve(process.env.ARKA_MASTRA_SMOKE_WORKSPACE ?? process.cwd());
  const executionId = "mastra-smoke-" + Date.now().toString(36);
  let createMastraExecutionPort;
  try {
    ({ createMastraExecutionPort } = await import("../dist/adapters/outbound/execution/mastra-agent-execution-adapter.js"));
  } catch {
    throw new Error("Build requis avant le smoke Mastra.");
  }
  const credentials = credentialsFor(provider);
  const port = createMastraExecutionPort({ providerCredentials: credentials });
  const base = {
    executionId,
    mission: "Reply with exactly ARKA_MASTRA_SMOKE_OK. Do not use tools or modify files.",
    workspace,
    timeoutMs: 60_000,
  };
  const mission = missionFor(provider, base);
  let outcome = await port.dispatch(mission);
  const deadline = Date.now() + 65_000;
  while (outcome.status === "running" && Date.now() < deadline) {
    await delay(100);
    outcome = await port.inspect({ executionId });
    if (outcome === undefined) throw new Error("Smoke execution disappeared.");
  }
  if (outcome.status === "running") outcome = await port.cancel({ executionId });
  console.log(JSON.stringify({
    executionId: outcome.executionId,
    provider,
    adapter: outcome.provider,
    status: outcome.status,
    outputLength: outcome.output?.length ?? 0,
    failureCode: outcome.failure?.code,
  }));
  if (outcome.status !== "completed") process.exitCode = 1;
}

function normalizeProvider(value) {
  if (value === "claude" || value === "codex" || value === "codex-acp" || value === "kimi" || value === "zai") {
    return value === "codex-acp" ? "codex" : value;
  }
  throw new Error("ARKA_MASTRA_SMOKE_PROVIDER must be one of: claude, codex, kimi, zai.");
}

function credentialsFor(provider) {
  if (provider === "claude") return { claudeApiKey: requiredSecretEnvironment("ARKA_NORN_MASTRA_CLAUDE_API_KEY") };
  if (provider === "codex") return { codexApiKey: requiredSecretEnvironment("ARKA_NORN_MASTRA_CODEX_API_KEY") };
  if (provider === "kimi") return { kimiApiKey: requiredSecretEnvironment("ARKA_NORN_MASTRA_KIMI_API_KEY") };
  return { zaiApiKey: requiredSecretEnvironment("ARKA_NORN_MASTRA_ZAI_API_KEY") };
}

function missionFor(provider, base) {
  const model = process.env.ARKA_MASTRA_SMOKE_MODEL;
  if (provider === "claude") {
    return { ...base, provider: "claude", ...(model === undefined ? {} : { model }) };
  }
  if (provider === "codex") {
    return {
      ...base,
      provider: "codex-acp",
      command: requiredAbsoluteEnvironment("ARKA_NORN_CODEX_ACP_COMMAND"),
      args: parseJsonArguments(process.env.ARKA_NORN_CODEX_ACP_ARGS),
      ...(model === undefined ? {} : { model }),
    };
  }
  if (provider === "kimi") {
    return {
      ...base,
      provider: "kimi-acp",
      command: requiredAbsoluteEnvironment("ARKA_NORN_KIMI_ACP_COMMAND"),
      args: ["acp"],
      ...(model === undefined ? {} : { model }),
    };
  }
  return {
    ...base,
    provider: "claude",
    providerProfile: "zai",
    ...(model === undefined ? {} : { model }),
  };
}

function requiredAbsoluteEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || !isAbsolute(value)) {
    throw new Error(name + " must contain an absolute, already installed ACP executable path.");
  }
  return value;
}

function requiredSecretEnvironment(name) {
  const value = process.env[name];
  if (value === undefined || value.length === 0 || value.includes("\u0000")) {
    throw new Error(name + " must be supplied explicitly for a real smoke run.");
  }
  return value;
}

function parseJsonArguments(value) {
  if (value === undefined || value === "") return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
      throw new Error("invalid");
    }
    return parsed;
  } catch {
    throw new Error("ARKA_NORN_CODEX_ACP_ARGS must be a JSON string array.");
  }
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => {
    setTimeout(resolveDelay, milliseconds);
  });
}
