#!/usr/bin/env node
import { isAbsolute, resolve } from "node:path";

if (process.env.ARKA_MASTRA_SMOKE !== "1") {
  console.error("Smoke Mastra désactivé. Définir ARKA_MASTRA_SMOKE=1 pour une exécution réelle explicite.");
  process.exitCode = 64;
} else {
  await runSmoke();
}

async function runSmoke() {
  const provider = process.env.ARKA_MASTRA_SMOKE_PROVIDER === "claude" ? "claude" : "codex-acp";
  const workspace = resolve(process.env.ARKA_MASTRA_SMOKE_WORKSPACE ?? process.cwd());
  const executionId = "mastra-smoke-" + Date.now().toString(36);
  let createMastraExecutionPort;
  try {
    ({ createMastraExecutionPort } = await import("../dist/adapters/outbound/execution/mastra-agent-execution-adapter.js"));
  } catch {
    throw new Error("Build requis avant le smoke Mastra.");
  }
  const credentials = provider === "claude"
    ? { claudeApiKey: requiredSecretEnvironment("ARKA_NORN_MASTRA_CLAUDE_API_KEY") }
    : { codexApiKey: requiredSecretEnvironment("ARKA_NORN_MASTRA_CODEX_API_KEY") };
  const port = createMastraExecutionPort({ providerCredentials: credentials });
  const base = {
    executionId,
    mission: "Reply with exactly ARKA_MASTRA_SMOKE_OK. Do not use tools or modify files.",
    workspace,
    timeoutMs: 60_000,
  };
  const mission = provider === "claude"
    ? {
      ...base,
      provider: "claude",
      ...(process.env.ARKA_MASTRA_SMOKE_MODEL === undefined ? {} : { model: process.env.ARKA_MASTRA_SMOKE_MODEL }),
    }
    : {
      ...base,
      provider: "codex-acp",
      command: requiredAbsoluteEnvironment("ARKA_NORN_CODEX_ACP_COMMAND"),
      args: parseJsonArguments(process.env.ARKA_NORN_CODEX_ACP_ARGS),
      ...(process.env.ARKA_MASTRA_SMOKE_MODEL === undefined ? {} : { model: process.env.ARKA_MASTRA_SMOKE_MODEL }),
    };
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
    provider: outcome.provider,
    status: outcome.status,
    outputLength: outcome.output?.length ?? 0,
    failureCode: outcome.failure?.code,
  }));
  if (outcome.status !== "completed") process.exitCode = 1;
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
