/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

import type { TaskWorkerPort, TaskWorkerResult } from "../../../ports/outbound/task-worker.js";
import { NodeMastraWorkerRunner, type MastraWorkerPayload, type MastraWorkerRunner, type MastraWorkerScripts } from "./mastra-worker-runner.js";

export class MastraTaskWorkerAdapter implements TaskWorkerPort {
  private readonly runner: MastraWorkerRunner;
  private readonly now: () => Date;

  public constructor(options: { readonly runner?: MastraWorkerRunner; readonly now?: () => Date } = {}) {
    this.runner = options.runner ?? new NodeMastraWorkerRunner(workerScripts());
    this.now = options.now ?? (() => new Date());
  }

  public async execute(input: Parameters<TaskWorkerPort["execute"]>[0]): Promise<TaskWorkerResult> {
    const startedAt = this.now();
    if (input.profile.transport !== "codex-cli" && input.profile.transport !== "claude-cli") {
      return failed(input.executionId, "transport_unsupported", `The ${input.profile.transport} task worker adapter is not installed.`, startedAt, this.now());
    }
    const payload: MastraWorkerPayload = {
      type: "run",
      executionId: input.executionId,
      provider: input.profile.transport,
      mission: mission(input),
      workspace: input.workspace,
      command: input.runtime.command,
      model: input.profile.model,
      permissionPolicy: {
        mode: "preauthorized-workspace",
        scopePaths: [...new Set([...input.task.readScopes, ...input.task.writeScopes])],
        permissions: ["read_workspace", "write_workspace"],
      },
      frameworkContext: frameworkContext(input),
    };
    const environment = { ...input.runtime.environment, ARKA_NORN_MASTRA_ISOLATED: "1" };
    const handle = this.runner.launch({ payload, environment, timeoutMs: input.timeoutMs });
    const onAbort = (): void => { void handle.cancel(); };
    input.signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const result = await handle.result;
      const endedAt = this.now();
      const usage = { durationSeconds: Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1_000), measurement: "unknown" as const };
      if (result.status === "completed") return Object.freeze({ executionId: input.executionId, status: "succeeded", proofReferences: Object.freeze([...(result.receipts ?? [])]), usage: Object.freeze(usage) });
      const status = result.status === "cancelled" ? "cancelled" : result.status === "awaiting_approval" ? "blocked" : "failed";
      return Object.freeze({
        executionId: input.executionId,
        status,
        proofReferences: Object.freeze([...(result.receipts ?? [])]),
        usage: Object.freeze(usage),
        failure: Object.freeze({
          code: result.failure?.code ?? "worker_failed",
          message: result.failure?.message ?? "The isolated task worker failed.",
          ...(result.failure?.exitCode === undefined ? {} : { exitCode: result.failure.exitCode }),
          ...(result.failure?.stderrExcerpt === undefined ? {} : { stderrExcerpt: result.failure.stderrExcerpt }),
        }),
      });
    } finally {
      input.signal?.removeEventListener("abort", onAbort);
    }
  }
}

function mission(input: Parameters<TaskWorkerPort["execute"]>[0]): string {
  return [
    `Campaign ${input.campaignId}; task ${input.task.id}; role ${input.task.role}.`,
    `Deliverables: ${input.task.deliverables.join(" | ")}`,
    `Validations: ${input.task.validations.join(" | ")}`,
    `Read scopes: ${input.task.readScopes.join(", ")}`,
    `Write scopes: ${input.task.writeScopes.join(", ")}`,
    "Use only the norn MCP tools. You have no shell, Git, network, publishing or sub-agent authority.",
    "All file mutations must use propose_change/delete_path and all tests/builds must use run_recipe.",
    "Submit mechanical evidence for the completed task. Report a blocker instead of widening scope or changing provider, model or budget.",
  ].join("\n");
}

function frameworkContext(input: Parameters<TaskWorkerPort["execute"]>[0]): NonNullable<MastraWorkerPayload["frameworkContext"]> {
  const unsigned = {
    contractVersion: 1 as const,
    frameworkVersion: "2.3.0",
    project: { id: input.projectId, logicalRoot: input.workspace, orchestrationMode: "automatic" as const },
    productAgent: { sessionId: "main" as const, agentId: input.task.agentId },
    feature: { id: input.featureId, pipelineId: "orchestration-v23" },
    pipelineState: { nextStepId: input.task.id },
    expectedRole: input.task.role,
    expectedSkill: "methode-dev",
    workspace: { logicalRoot: input.workspace, realization: "domain_managed" as const },
    allowedActions: ["read_workspace", "propose_change", "run_recipe", "submit_evidence"],
    forbiddenActions: ["shell", "git", "network", "subagent", "publish", "deploy", "change_scope"],
    capabilities: [...input.profile.props.capabilities],
    decisionGate: "continue" as const,
  };
  return { ...unsigned, integrityFingerprint: createHash("sha256").update(JSON.stringify(unsigned)).digest("hex") };
}

function failed(executionId: string, code: string, message: string, startedAt: Date, endedAt: Date): TaskWorkerResult { return Object.freeze({ executionId, status: "failed", proofReferences: Object.freeze([]), usage: Object.freeze({ durationSeconds: Math.max(0, (endedAt.getTime() - startedAt.getTime()) / 1_000), measurement: "unknown" }), failure: Object.freeze({ code, message }) }); }
function workerScripts(): MastraWorkerScripts { const cli = fileURLToPath(new URL("../../../../scripts/mastra-cli-worker.mjs", import.meta.url)); return { "codex-cli": cli, "claude-cli": cli, "codex-acp": cli, "kimi-acp": cli, claude: cli }; }
