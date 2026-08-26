#!/usr/bin/env node

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

import { spawn } from "node:child_process";
import { mkdir, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readWorkerRequest, writeWorkerResult } from "./mastra-worker-protocol.mjs";

const MAX_PROVIDER_OUTPUT_BYTES = 512 * 1024;
const TOOL_SERVER = fileURLToPath(new URL("./orchestration-tool-server.mjs", import.meta.url));
const request = await readWorkerRequest(["claude-cli", "codex-cli"]);
let providerProcess;
let cancelled = false;

const stop = () => {
  cancelled = true;
  if (providerProcess !== undefined && providerProcess.exitCode === null) providerProcess.kill("SIGTERM");
};

process.once("SIGTERM", stop);
process.once("SIGINT", stop);

try {
  const result = await runCli(request);
  if (cancelled) {
    writeWorkerResult({ status: "cancelled", failure: { code: "CANCELLED" } });
  } else if (result.code !== 0) {
    writeWorkerResult({ status: "failed", failure: {
      code: request.provider === "claude-cli" ? "CLAUDE_CLI_FAILED" : "CODEX_CLI_FAILED",
      message: "The provider CLI exited unsuccessfully.",
      exitCode: result.code,
      stderrExcerpt: redact(result.stderr),
    } });
  } else {
    writeWorkerResult({
      status: "completed",
      output: request.provider === "claude-cli" ? claudeResult(result.stdout) : result.stdout.trim(),
      receipts: result.receipts,
      ...(result.sessionId === undefined ? {} : { sessionId: result.sessionId }),
    });
  }
} catch (error) {
  writeWorkerResult(cancelled
    ? { status: "cancelled", failure: { code: "CANCELLED" } }
    : { status: "failed", failure: { code: error instanceof OutputLimitError ? "WORKER_OUTPUT_LIMIT" : "CLI_WORKER_FAILED" } });
} finally {
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
}

async function runCli(input) {
  const canWrite = input.permissionPolicy !== "deny-all" && input.permissionPolicy.permissions.includes("write_workspace");
  const canRunRecipe = input.frameworkContext?.capabilities?.includes("run_commands") === true;
  const scopePaths = input.permissionPolicy === "deny-all" ? ["."] : input.permissionPolicy.scopePaths;
  const receiptDirectory = join(process.env.TMPDIR ?? process.env.TMP ?? dirname(input.workspace), "arka-norn-receipts", input.executionId);
  const toolArguments = [
    TOOL_SERVER,
    "--workspace", input.workspace,
    "--receipts", receiptDirectory,
    "--execution", input.executionId,
    "--scope", JSON.stringify(scopePaths),
    "--write", canWrite ? "1" : "0",
    "--recipes", canRunRecipe ? "1" : "0",
    ...(input.frameworkContext === undefined ? [] : ["--framework", JSON.stringify(input.frameworkContext)]),
  ];
  const args = input.provider === "claude-cli"
    ? claudeArguments(input, canWrite, canRunRecipe, toolArguments)
    : codexArguments(input, toolArguments);
  await mkdir(receiptDirectory, { recursive: true, mode: 0o700 });
  return new Promise((resolve, reject) => {
    const invocation = nodeInvocation(input.command, args);
    providerProcess = spawn(invocation.command, invocation.args, {
      cwd: input.workspace,
      env: providerEnvironment(input.provider),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => {
      const next = current + chunk.toString("utf8");
      if (Buffer.byteLength(next, "utf8") > MAX_PROVIDER_OUTPUT_BYTES) {
        providerProcess.kill("SIGTERM");
        reject(new OutputLimitError());
      }
      return next;
    };
    providerProcess.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    providerProcess.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    providerProcess.once("error", reject);
    providerProcess.once("close", async (code) => resolve({ code: code ?? 1, stdout, stderr, receipts: await receiptIds(receiptDirectory) }));
    providerProcess.stdin.end(input.mission);
  });
}

function nodeInvocation(command, args) {
  return /\.(?:cjs|mjs|js)$/iu.test(command)
    ? { command: process.execPath, args: [command, ...args] }
    : { command, args };
}

function providerEnvironment(provider) {
  const common = ["PATH", "HOME", "USERPROFILE", "TMPDIR", "TMP", "TEMP", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "NO_COLOR", "TZ", "SystemRoot", "SYSTEMROOT"];
  const specific = provider === "claude-cli" ? ["CLAUDE_CONFIG_DIR"] : ["CODEX_HOME"];
  const credentials = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "KIMI_MODEL_API_KEY"];
  return Object.fromEntries([...common, ...specific, ...credentials]
    .map((name) => [name, process.env[name]])
    .filter((entry) => entry[1] !== undefined));
}

function claudeArguments(input, canWrite, canRunRecipe, toolArguments) {
  const mcpConfig = JSON.stringify({ mcpServers: { norn: { command: process.execPath, args: toolArguments } } });
  const writeTools = "mcp__norn__propose_change,mcp__norn__delete_path";
  return [
    "-p",
    "--safe-mode",
    "--output-format", "json",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config", mcpConfig,
    "--model", input.model,
    "--permission-mode", "dontAsk",
    "--tools", `mcp__norn__framework_state,mcp__norn__search,mcp__norn__read_file${canRunRecipe ? ",mcp__norn__run_recipe" : ""},mcp__norn__submit_evidence,mcp__norn__report_blocker,mcp__norn__request_decision${canWrite ? `,${writeTools}` : ""}`,
    "--disallowedTools", "Bash,Task,Agent,Read,Glob,Grep,Edit,Write,WebFetch,WebSearch,NotebookEdit",
  ];
}

function codexArguments(input, toolArguments) {
  return [
    "--sandbox", "read-only",
    "--ask-for-approval", "never",
    "--cd", input.workspace,
    "--model", input.model,
    "--disable", "shell_tool",
    "--disable", "unified_exec",
    "--disable", "shell_snapshot",
    "--disable", "shell_zsh_fork",
    "--disable", "unified_exec_zsh_fork",
    "--disable", "multi_agent",
    "--disable", "browser_use",
    "--disable", "computer_use",
    "--disable", "apps",
    "--strict-config",
    "--config", `mcp_servers.norn.command=${JSON.stringify(process.execPath)}`,
    "--config", `mcp_servers.norn.args=${JSON.stringify(toolArguments)}`,
    "exec",
    "--ephemeral",
    "--ignore-rules",
    "--color", "never",
    "-",
  ];
}

async function receiptIds(directory) {
  try {
    const entries = await readdir(directory);
    return entries.filter((name) => /^receipt-[A-Za-z0-9-]+\.json$/u.test(name)).map((name) => name.slice(0, -5)).sort().slice(0, 100);
  } catch {
    return [];
  }
}

function claudeResult(stdout) {
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error("Claude CLI returned invalid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || parsed.is_error === true || typeof parsed.result !== "string") {
    throw new Error("Claude CLI did not return a successful result.");
  }
  return parsed.result;
}

class OutputLimitError extends Error {}

function redact(value) {
  return value.replace(/(?:Bearer\s+|sk-)[A-Za-z0-9._-]+/gu, "[REDACTED]")
    .replace(/((?:api[_ -]?key|access[_ -]?token|password|secret))\s*[:=]\s*\S+/giu, "$1=[REDACTED]")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/gu, " ").trim().slice(0, 1_000);
}
