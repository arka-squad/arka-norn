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

import { readWorkerRequest, writeWorkerResult } from "./mastra-worker-protocol.mjs";

const MAX_PROVIDER_OUTPUT_BYTES = 512 * 1024;
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
    writeWorkerResult({ status: "failed", failure: { code: request.provider === "claude-cli" ? "CLAUDE_CLI_FAILED" : "CODEX_CLI_FAILED" } });
  } else {
    writeWorkerResult({
      status: "completed",
      output: request.provider === "claude-cli" ? claudeResult(result.stdout) : result.stdout.trim(),
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

function runCli(input) {
  const canWrite = input.permissionPolicy !== "deny-all" && input.permissionPolicy.permissions.includes("write_workspace");
  const args = input.provider === "claude-cli"
    ? claudeArguments(input, canWrite)
    : codexArguments(input, canWrite);
  return new Promise((resolve, reject) => {
    providerProcess = spawn(input.command, args, {
      cwd: input.workspace,
      env: process.env,
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
    providerProcess.once("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
    providerProcess.stdin.end(input.mission);
  });
}

function claudeArguments(input, canWrite) {
  return [
    "-p",
    "--safe-mode",
    "--output-format", "json",
    "--no-session-persistence",
    "--strict-mcp-config",
    "--mcp-config", "{}",
    "--model", input.model,
    "--permission-mode", canWrite ? "acceptEdits" : "plan",
    "--tools", canWrite ? "Read,Glob,Grep,Edit,Write" : "Read,Glob,Grep",
    "--disallowedTools", "Bash,Task,Agent,WebFetch,WebSearch,NotebookEdit",
  ];
}

function codexArguments(input, canWrite) {
  return [
    "--sandbox", canWrite ? "workspace-write" : "read-only",
    "--ask-for-approval", "never",
    "--cd", input.workspace,
    "--model", input.model,
    "exec",
    "--ephemeral",
    "--ignore-user-config",
    "--ignore-rules",
    "--color", "never",
    "-",
  ];
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
