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

import { join } from "node:path";

import { readWorkerRequest, writeWorkerResult } from "./mastra-worker-protocol.mjs";
import { claudeToolsForPermissionPolicy, createWorkspacePermissionGate } from "./mastra-permission-gate.mjs";

const request = await readWorkerRequest("claude");
const abortController = new AbortController();
let cancelled = false;
let approvalRequested = false;
const permissionGate = createWorkspacePermissionGate(request);

const stop = () => {
  cancelled = true;
  abortController.abort();
};

process.once("SIGTERM", stop);
process.once("SIGINT", stop);

try {
  const { ClaudeSDKAgent } = await import("@mastra/claude");
  const home = process.env.HOME;
  if (home === undefined) throw new Error("Isolated home is unavailable.");
  const agent = new ClaudeSDKAgent({
    id: "arka-claude-" + request.executionId,
    name: "Arka Claude",
    description: "Bounded Arka execution with deny-by-default permissions.",
    sdkOptions: {
      cwd: request.workspace,
      env: {
        ...process.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: "arka-norn-mastra-spike",
        CLAUDE_CONFIG_DIR: join(home, ".claude"),
      },
      // Only structured filesystem tools are exposed. In particular, Bash,
      // network and sub-agent tools cannot turn the Feature workspace into an
      // implicit sandbox escape.
      tools: claudeToolsForPermissionPolicy(request.permissionPolicy),
      allowedTools: [],
      disallowedTools: ["Bash", "Task", "Agent", "WebFetch", "WebSearch", "NotebookEdit", "ExitPlanMode", "AskUserQuestion"],
      permissionMode: "default",
      async canUseTool(toolName, input) {
        const decision = permissionGate(toolName, input);
        if (decision.behavior === "deny") approvalRequested = true;
        return decision;
      },
      persistSession: false,
      settingSources: [],
      strictMcpConfig: true,
      plugins: [],
      skills: [],
      ...(request.model === undefined ? {} : { model: request.model }),
    },
  });
  const result = await agent.generate(request.mission, {
    runId: request.executionId,
    abortSignal: abortController.signal,
  });
  if (result.error !== undefined) throw result.error;
  if (cancelled) {
    writeWorkerResult({ status: "cancelled", failure: { code: "CANCELLED" } });
  } else if (approvalRequested) {
    writeWorkerResult({ status: "awaiting_approval", failure: { code: "PERMISSION_REQUESTED" } });
  } else {
    writeWorkerResult({ status: "completed", output: result.text });
  }
} catch {
  writeWorkerResult(cancelled
    ? { status: "cancelled", failure: { code: "CANCELLED" } }
    : approvalRequested
      ? { status: "awaiting_approval", failure: { code: "PERMISSION_REQUESTED" } }
      : { status: "failed", failure: { code: "CLAUDE_FAILED" } });
} finally {
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
}
