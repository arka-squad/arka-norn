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

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { createMastraExecutionPort } from "../../src/adapters/outbound/execution/mastra-agent-execution-adapter.ts";
import type {
  AgentExecutionMission,
  AgentExecutionOutcome,
  AgentExecutionPort,
} from "../../src/ports/outbound/agent-execution-port.ts";
import type {
  MastraWorkerHandle,
  MastraWorkerLaunch,
  MastraWorkerResult,
  MastraWorkerRunner,
} from "../../src/adapters/outbound/execution/mastra-worker-runner.ts";

class ControlledWorkerRunner implements MastraWorkerRunner {
  public readonly launches: MastraWorkerLaunch[] = [];
  public cancellationCount = 0;
  private readonly controls: Array<{ resolve(result: MastraWorkerResult): void }> = [];

  public launch(input: MastraWorkerLaunch): MastraWorkerHandle {
    this.launches.push(input);
    let resolveResult: (result: MastraWorkerResult) => void = (): void => undefined;
    const result = new Promise<MastraWorkerResult>((resolve): void => {
      resolveResult = resolve;
    });
    this.controls.push({ resolve: resolveResult });
    return {
      result,
      cancel: (): Promise<void> => {
        this.cancellationCount += 1;
        resolveResult({ status: "cancelled", failure: { code: "CANCELLED" } });
        return Promise.resolve();
      },
    };
  }

  public complete(index: number, result: MastraWorkerResult): void {
    const control = this.controls[index];
    if (control === undefined) throw new Error("Unknown controlled worker launch.");
    control.resolve(result);
  }
}

test("le port transmet uniquement un environnement minimal et un lanceur ACP explicite", async (context) => {
  const workspace = createWorkspace(context);
  const runner = new ControlledWorkerRunner();
  const port = createMastraExecutionPort({ runner, now: fixedClock });

  const started = await port.dispatch(codexMission(workspace, "codex-run", {
    safeEnvironment: { LANG: "C", NO_COLOR: "1" },
  }));

  assert.equal(started.status, "running");
  assert.equal(started.retryStrategy, "new-run");
  assert.equal(runner.launches.length, 1);
  const launch = runner.launches[0];
  if (launch === undefined) throw new Error("Expected worker launch.");
  assert.deepEqual(launch.payload, {
    type: "run",
    executionId: "codex-run",
    provider: "codex-acp",
    mission: "Inspect the workspace and return a concise result.",
    workspace,
    permissionPolicy: "deny-all",
    command: process.execPath,
    args: ["--version"],
  });
  assert.equal(launch.environment["LANG"], "C");
  assert.equal(launch.environment["NO_COLOR"], "1");
  assert.equal(launch.environment["ANTHROPIC_API_KEY"], undefined);
  assert.equal(launch.environment["OPENAI_API_KEY"], undefined);
  assert.notEqual(launch.environment["HOME"], process.env["HOME"]);

  runner.complete(0, { status: "completed", output: "done", sessionId: "live-acp-session" });
  const completed = await waitForTerminalOutcome(port, "codex-run");
  assert.deepEqual(completed, {
    executionId: "codex-run",
    provider: "codex-acp",
    workspace,
    status: "completed",
    attempt: 1,
    retryStrategy: "new-run",
    startedAt: "2026-08-20T10:00:00.000Z",
    completedAt: "2026-08-20T10:00:00.000Z",
    output: "done",
    sessionId: "live-acp-session",
  });
});

test("un identifiant explicitement fourni reste éphémère et absent du payload worker", async (context) => {
  const workspace = createWorkspace(context);
  const runner = new ControlledWorkerRunner();
  const port = createMastraExecutionPort({
    runner,
    providerCredentials: { claudeApiKey: "ephemeral-test-credential" },
  });

  await port.dispatch({
    provider: "claude",
    executionId: "claude-credential",
    mission: "Read only the current workspace.",
    workspace,
  });

  const launch = runner.launches[0];
  if (launch === undefined) throw new Error("Expected worker launch.");
  assert.equal(launch.environment["ANTHROPIC_API_KEY"], "ephemeral-test-credential");
  assert.equal(launch.environment["OPENAI_API_KEY"], undefined);
  assert.equal(JSON.stringify(launch.payload).includes("ephemeral-test-credential"), false);
  runner.complete(0, { status: "cancelled", failure: { code: "CANCELLED" } });
  await waitForTerminalOutcome(port, "claude-credential");
});

test("Claude Code CLI réutilise le home local sans injecter de clé API", async (context) => {
  const workspace = createWorkspace(context);
  const runner = new ControlledWorkerRunner();
  const port = createMastraExecutionPort({
    runner,
    localCliEnvironment: { HOME: workspace, USERPROFILE: workspace, PATH: process.env.PATH },
  });

  await port.dispatch({
    provider: "claude-cli",
    executionId: "claude-cli-subscription",
    mission: "Read the bounded workspace.",
    workspace,
    command: process.execPath,
    model: "opus",
  });

  const launch = runner.launches[0];
  if (launch === undefined) throw new Error("Expected Claude Code CLI worker launch.");
  assert.equal(launch.payload.provider, "claude-cli");
  assert.equal(launch.payload.command, process.execPath);
  assert.equal(launch.environment["HOME"], workspace);
  assert.equal(launch.environment["ANTHROPIC_API_KEY"], undefined);
  assert.equal(JSON.stringify(launch.payload).includes("Read the bounded workspace."), true);
  runner.complete(0, { status: "cancelled", failure: { code: "CANCELLED" } });
  await waitForTerminalOutcome(port, "claude-cli-subscription");
});

test("Kimi Platform et Z.AI utilisent seulement leurs profils fixes et ne sérialisent aucun secret", async (context) => {
  const workspace = createWorkspace(context);
  const runner = new ControlledWorkerRunner();
  const port = createMastraExecutionPort({
    runner,
    providerCredentials: {
      kimiApiKey: "kimi-ephemeral-credential",
      zaiApiKey: "zai-ephemeral-credential",
    },
  });

  await port.dispatch({
    provider: "kimi-acp",
    executionId: "kimi-profile",
    mission: "Inspect the workspace.",
    workspace,
    command: process.execPath,
    args: ["--version"],
    model: "kimi-coding",
  });
  const kimi = runner.launches[0];
  if (kimi === undefined) throw new Error("Expected Kimi worker launch.");
  assert.equal(kimi.environment["KIMI_MODEL_API_KEY"], "kimi-ephemeral-credential");
  assert.equal(kimi.environment["KIMI_MODEL_BASE_URL"], "https://api.kimi.com/coding/v1");
  assert.equal(kimi.environment["KIMI_MODEL_NAME"], "kimi-coding");
  assert.equal(JSON.stringify(kimi.payload).includes("kimi-ephemeral-credential"), false);
  runner.complete(0, { status: "cancelled", failure: { code: "CANCELLED" } });
  await waitForTerminalOutcome(port, "kimi-profile");

  await port.dispatch({
    provider: "claude",
    providerProfile: "zai",
    executionId: "zai-profile",
    mission: "Inspect the workspace.",
    workspace,
    model: "glm-coding-plan",
  });
  const zai = runner.launches[1];
  if (zai === undefined) throw new Error("Expected Z.AI worker launch.");
  assert.equal(zai.environment["ANTHROPIC_API_KEY"], "zai-ephemeral-credential");
  assert.equal(zai.environment["ANTHROPIC_BASE_URL"], "https://api.z.ai/api/anthropic");
  assert.equal(JSON.stringify(zai.payload).includes("zai-ephemeral-credential"), false);
  assert.equal("providerProfile" in zai.payload, false);
  runner.complete(1, { status: "cancelled", failure: { code: "CANCELLED" } });
  await waitForTerminalOutcome(port, "zai-profile");
});

test("une permission provider devient awaiting_approval sans choix ACP automatique et le retry crée un nouveau run", async (context) => {
  const workspace = createWorkspace(context);
  const runner = new ControlledWorkerRunner();
  const port = createMastraExecutionPort({ runner, now: fixedClock });
  const policy = {
    mode: "preauthorized-workspace" as const,
    scopePaths: ["src", "tests/unit"],
    permissions: ["read_workspace", "write_workspace"] as const,
  };

  await port.dispatch(codexMission(workspace, "codex-approval", { permissionPolicy: policy }));
  const firstLaunch = runner.launches[0];
  if (firstLaunch === undefined) throw new Error("Expected first worker launch.");
  assert.deepEqual(firstLaunch.payload.permissionPolicy, policy);
  runner.complete(0, { status: "awaiting_approval", failure: { code: "PERMISSION_REQUESTED" } });

  const awaitingApproval = await waitForTerminalOutcome(port, "codex-approval");
  assert.equal(awaitingApproval.status, "awaiting_approval");
  assert.equal(awaitingApproval.failure?.code, "PERMISSION_REQUESTED");
  assert.deepEqual(awaitingApproval.approval, {
    code: "permission_requested",
    message: "The provider requested a permission that this adapter cannot safely prove is within scope.",
    retryStrategy: "new-run",
  });

  const retry = await port.retry({ executionId: "codex-approval", newExecutionId: "codex-approval-retry" });
  assert.equal(retry.status, "running");
  assert.equal(retry.attempt, 2);
  const secondLaunch = runner.launches[1];
  if (secondLaunch === undefined) throw new Error("Expected retry worker launch.");
  assert.equal(secondLaunch.payload.executionId, "codex-approval-retry");
  assert.deepEqual(secondLaunch.payload.permissionPolicy, policy);
  assert.equal("sessionId" in secondLaunch.payload, false);
});

test("annulation par AbortSignal termine le worker et conserve une issue cancelled", async (context) => {
  const workspace = createWorkspace(context);
  const runner = new ControlledWorkerRunner();
  const port = createMastraExecutionPort({ runner, now: fixedClock });
  const controller = new AbortController();

  await port.dispatch({
    provider: "claude",
    executionId: "claude-cancel",
    mission: "Return a short response.",
    workspace,
    signal: controller.signal,
  });
  controller.abort(new Error("caller cancelled"));

  const cancelled = await waitForTerminalOutcome(port, "claude-cancel");
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.failure?.code, "CANCELLED");
  assert.equal(runner.cancellationCount, 1);
});

test("le port refuse les lanceurs implicites et les environnements contenant des secrets", async (context) => {
  const workspace = createWorkspace(context);
  const port = createMastraExecutionPort({ runner: new ControlledWorkerRunner() });

  await assert.rejects(
    async (): Promise<void> => {
      await port.dispatch({
        provider: "codex-acp",
        executionId: "invalid-command",
        mission: "No operation.",
        workspace,
        command: "npx",
      });
    },
    /absolute executable path/,
  );
  await assert.rejects(
    async (): Promise<void> => {
      await port.dispatch(codexMission(workspace, "secret-environment", {
        safeEnvironment: { ANTHROPIC_API_KEY: "must-not-pass" },
      }));
    },
    /unsupported variable/,
  );
  await assert.rejects(
    async (): Promise<void> => {
      await port.dispatch(codexMission(workspace, "unsafe-scope", {
        permissionPolicy: {
          mode: "preauthorized-workspace",
          scopePaths: ["../outside"],
          permissions: ["write_workspace"],
        },
      }));
    },
    /stay relative/,
  );
});

function codexMission(
  workspace: string,
  executionId: string,
  overrides: Partial<Omit<Extract<AgentExecutionMission, { readonly provider: "codex-acp" }>, "provider" | "executionId" | "mission" | "workspace" | "command" | "args">> = {},
): Extract<AgentExecutionMission, { readonly provider: "codex-acp" }> {
  return {
    provider: "codex-acp",
    executionId,
    mission: "Inspect the workspace and return a concise result.",
    workspace,
    command: process.execPath,
    args: ["--version"],
    ...overrides,
  };
}

function createWorkspace(context: { after(callback: () => void): void }): string {
  const directory = mkdtempSync(join(tmpdir(), "arka-norn-mastra-unit-"));
  mkdirSync(join(directory, "src"));
  mkdirSync(join(directory, "tests", "unit"), { recursive: true });
  context.after(() => rmSync(directory, { recursive: true, force: true }));
  return realpathSync(directory);
}

async function waitForTerminalOutcome(port: AgentExecutionPort, executionId: string): Promise<AgentExecutionOutcome> {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const outcome = await port.inspect({ executionId });
    if (outcome !== undefined && outcome.status !== "running") return outcome;
    await new Promise<void>((resolveDelay): void => {
      setTimeout(resolveDelay, 1);
    });
  }
  throw new Error("Agent execution did not settle.");
}

function fixedClock(): Date {
  return new Date("2026-08-20T10:00:00.000Z");
}
