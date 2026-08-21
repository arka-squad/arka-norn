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

import { readWorkerRequest, writeWorkerResult } from "./mastra-worker-protocol.mjs";

const request = await readWorkerRequest("kimi-acp");
const abortController = new AbortController();
let cancelled = false;
let approvalRequested = false;
let agent;

const stop = () => {
  cancelled = true;
  abortController.abort();
  if (agent !== undefined) {
    void agent.connection.cancel().catch(() => undefined);
    agent.connection.disconnect();
  }
};

process.once("SIGTERM", stop);
process.once("SIGINT", stop);

try {
  const { AcpAgent } = await import("@mastra/acp");
  agent = new AcpAgent({
    id: "arka-kimi-" + request.executionId,
    name: "Arka Kimi ACP",
    description: "Bounded Arka execution with deny-by-default permissions.",
    command: request.command,
    args: request.args,
    cwd: request.workspace,
    persistSession: false,
    ...(request.authMethodId === undefined ? {} : { authMethodId: request.authMethodId }),
    ...(request.model === undefined ? {} : { model: request.model }),
    async onPermissionRequest() {
      approvalRequested = true;
      return { outcome: { outcome: "cancelled" } };
    },
  });
  const output = await agent.connection.prompt(request.mission, abortController.signal);
  const sessionId = agent.connection.sessionId;
  if (cancelled) writeWorkerResult({ status: "cancelled", failure: { code: "CANCELLED" } });
  else if (approvalRequested) writeWorkerResult({ status: "awaiting_approval", failure: { code: "PERMISSION_REQUESTED" } });
  else writeWorkerResult({ status: "completed", output, ...(sessionId === undefined ? {} : { sessionId }) });
} catch {
  writeWorkerResult(cancelled
    ? { status: "cancelled", failure: { code: "CANCELLED" } }
    : approvalRequested
      ? { status: "awaiting_approval", failure: { code: "PERMISSION_REQUESTED" } }
      : { status: "failed", failure: { code: "KIMI_ACP_FAILED" } });
} finally {
  if (agent !== undefined) agent.connection.disconnect();
  process.off("SIGTERM", stop);
  process.off("SIGINT", stop);
}
