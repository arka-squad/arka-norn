import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";

import { serializeExecutionRegistry } from "../../src/adapters/outbound/filesystem/fs-orchestration-execution-registry-store.ts";
import { serializeOrchestrationPolicy } from "../../src/adapters/outbound/filesystem/fs-orchestration-policy-store.ts";
import {
  ExecutionPolicy,
  selectBestEligibleProvider,
  selectBestEligibleTarget,
} from "../../src/domain/orchestration/execution-policy.ts";
import { configuredProviderHealth } from "../../src/composition/orchestration-runtime.ts";
import { ExecutionRecord, executionSuspensionReason } from "../../src/domain/orchestration/execution-record.ts";
import { ExecutionRegistry } from "../../src/domain/orchestration/execution-registry.ts";
import { MissionOrder } from "../../src/domain/orchestration/mission-order.ts";
import { userExecutionTarget } from "../../src/domain/orchestration/types.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

const at = new Date("2026-08-20T10:00:00.000Z");
const ROOT = resolve(import.meta.dirname, "..", "..");

test("le sélecteur choisit seulement un provider autorisé, sain et capable avec départage stable", () => {
  const policy = ExecutionPolicy.create({
    schemaVersion: 2,
    projectId: ProjectId.of("project"),
    selectionMode: "assisted",
    providers: [
      {
        provider: "codex",
        adapter: "acp",
        enabled: true,
        priority: 20,
        capabilities: ["inspect_workspace", "read_pipeline"],
        permissions: ["read_workspace"],
        models: [
          { id: "codex-mini", enabled: true, priority: 10 },
          { id: "codex-max", enabled: true, priority: 20 },
        ],
      },
      {
        provider: "claude",
        adapter: "claude-sdk",
        enabled: true,
        priority: 20,
        capabilities: ["inspect_workspace", "read_pipeline"],
        permissions: ["read_workspace"],
        models: [{ id: "claude-sonnet", enabled: true, priority: 10 }],
      },
    ],
    createdAt: at,
    updatedAt: at,
  });

  const selection = selectBestEligibleProvider(
    policy,
    { capabilities: ["inspect_workspace"], permissions: ["read_workspace"] },
    [
      { provider: "codex", healthy: true, capabilities: ["inspect_workspace", "read_pipeline"] },
      { provider: "claude", healthy: true, capabilities: ["inspect_workspace", "read_pipeline"] },
    ],
  );

  assert.equal(selection.selected, "claude");
  assert.deepEqual(selection.candidates.map((candidate) => candidate.provider), ["claude", "codex"]);

  const unhealthy = selectBestEligibleProvider(
    policy,
    { capabilities: ["inspect_workspace"], permissions: ["read_workspace"] },
    [
      { provider: "codex", healthy: false, capabilities: ["inspect_workspace", "read_pipeline"] },
      { provider: "claude", healthy: true, capabilities: ["read_pipeline"] },
    ],
  );
  assert.equal(unhealthy.selected, undefined);
  assert.deepEqual(unhealthy.candidates[0]?.reasons, ["missing_capability"]);
  assert.deepEqual(unhealthy.candidates[1]?.reasons, ["unhealthy"]);

  const targetSelection = selectBestEligibleTarget(
    policy,
    { capabilities: ["inspect_workspace"], permissions: ["read_workspace"] },
    [
      { target: userExecutionTarget("codex", "codex-mini"), healthy: true, capabilities: ["inspect_workspace", "read_pipeline"] },
      { target: userExecutionTarget("codex", "codex-max"), healthy: true, capabilities: ["inspect_workspace", "read_pipeline"] },
      { target: userExecutionTarget("claude", "claude-sonnet"), healthy: true, capabilities: ["inspect_workspace", "read_pipeline"] },
    ],
  );
  assert.deepEqual(targetSelection.selected, userExecutionTarget("codex", "codex-max"));
  assert.deepEqual(targetSelection.candidates.map((candidate) => candidate.target.model), ["codex-max", "claude-sonnet", "codex-mini"]);
});

test("la santé provider lit les variables runtime ARKA_NORN sans accepter les anciens noms smoke", () => {
  const configured = configuredProviderHealth({
    ARKA_NORN_MASTRA_CLAUDE_ENABLED: "1",
    ARKA_NORN_MASTRA_CLAUDE_API_KEY: "test-claude-credential",
    ARKA_NORN_MASTRA_CODEX_API_KEY: "test-codex-credential",
    ARKA_NORN_CODEX_ACP_COMMAND: process.execPath,
  });
  assert.equal(configured.find((entry) => entry.provider === "claude")?.healthy, true);
  assert.equal(configured.find((entry) => entry.provider === "codex")?.healthy, true);

  const legacyOnly = configuredProviderHealth({
    ARKA_MASTRA_CODEX_ACP_COMMAND: process.execPath,
    ARKA_MASTRA_CODEX_API_KEY: "test-codex-credential",
  });
  assert.equal(legacyOnly.find((entry) => entry.provider === "codex")?.healthy, false);
});

test("MissionOrder fige le scope et refuse une précondition Pipeline obsolète", () => {
  const paths = ["src"];
  const order = createOrder({ paths });
  paths.push("docs");

  assert.deepEqual(order.scope.paths, ["src"]);
  const current = order.checkPreconditions({
    scope: { projectId: ProjectId.of("project"), featureId: FeatureId.of("feature"), paths: ["./src/"] },
    pipelineId: "standard",
    nextStepId: "concept",
  });
  assert.equal(current.current, true);
  assert.throws(() => order.assertCurrent({
    scope: { projectId: ProjectId.of("project"), featureId: FeatureId.of("feature"), paths: ["src"] },
    pipelineId: "standard",
    nextStepId: "plan",
  }), (error: unknown) => error instanceof Error && "code" in error && error.code === "MISSION_PRECONDITION_FAILED");
  assert.throws(() => MissionOrder.create({
    ...order.toProps(),
    id: "mission-secret",
    summary: "api_key=not-allowed",
  }));
});

test("ExecutionRecord borne les événements, exige des preuves et garde la cible initiale pendant retry", () => {
  const order = createOrder();
  let record = ExecutionRecord.planned("execution-one", order, userExecutionTarget("codex", "codex-max"), at)
    .begin({ at, providerSessionId: "session-1" })
    .recordProviderSession("session-1-live", at)
    .awaitApproval(executionSuspensionReason("permission_requested", "Network access needs explicit approval."), at)
    .approve(at)
    .begin({ at, providerSessionId: "session-2" });

  assert.equal(record.status, "running");
  assert.equal(record.attempts.length, 2);
  assert.equal(record.attempts[0]?.status, "interrupted");
  assert.equal(record.attempts[0]?.providerSessionId, "session-1-live");
  assert.equal(record.attempts[1]?.status, "running");

  for (let index = 0; index < 100; index += 1) {
    record = record.appendEvent("worker_event", `event ${index}`, at);
  }
  assert.equal(record.events.length, 100);
  assert.equal(record.truncatedEventCount, 7);
  assert.throws(() => record.succeed([], at));

  const succeeded = record.succeed(["docs/concept.json"], at);
  assert.equal(succeeded.status, "succeeded");
  assert.equal(succeeded.provider, "codex");
  assert.equal(succeeded.target.model, "codex-max");
  assert.throws(() => succeeded.retry(at));

  const legacy = ExecutionRecord.planned("execution-legacy", order, "codex", at)
    .begin({ at })
    .interrupt(executionSuspensionReason("interrupted", "The old worker stopped."), at);
  assert.throws(() => legacy.retry(at), /legacy execution target/);
});

test("le registre refuse toute modification de la cible ou de l'ordre d'une exécution existante", () => {
  const order = createOrder();
  const record = ExecutionRecord.planned("execution-fixed", order, userExecutionTarget("claude", "claude-sonnet"), at);
  const registry = ExecutionRegistry.empty(ProjectId.of("project"), at).add(record, at);

  assert.throws(() => registry.replace(ExecutionRecord.planned("execution-fixed", order, userExecutionTarget("claude", "claude-opus"), at), at));
  assert.throws(() => registry.replace(ExecutionRecord.planned("execution-fixed", createOrder({ id: "other-order" }), userExecutionTarget("claude", "claude-sonnet"), at), at));
});

test("les schémas de politique et de registre refusent les champs secrets et respectent les bornes", () => {
  const policy = ExecutionPolicy.defaultFor(ProjectId.of("project"), at);
  const registry = ExecutionRegistry.empty(ProjectId.of("project"), at)
    .add(ExecutionRecord.planned("execution-schema", createOrder(), userExecutionTarget("claude", "claude-sonnet"), at), at);
  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
  const validatePolicy = ajv.compile(json("schemas/orchestration-policy.schema.json"));
  const validateRegistry = ajv.compile(json("schemas/executions-registry.schema.json"));
  const policyPayload = serializeOrchestrationPolicy(policy);

  assert.equal(validatePolicy(policyPayload), true, JSON.stringify(validatePolicy.errors));
  assert.equal(validateRegistry(serializeExecutionRegistry(registry)), true, JSON.stringify(validateRegistry.errors));
  assert.equal(validatePolicy({ ...policyPayload, token: "forbidden" }), false);
  for (const provider of policy.providers) {
    assert.equal(provider.capabilities.includes("run_commands"), false);
    assert.equal(provider.permissions.includes("shell"), false);
  }
});

function createOrder(overrides: Partial<{
  readonly id: string;
  readonly paths: readonly string[];
}> = {}): MissionOrder {
  return MissionOrder.create({
    id: overrides.id ?? "mission-one",
    scope: {
      projectId: ProjectId.of("project"),
      featureId: FeatureId.of("feature"),
      paths: overrides.paths ?? ["src"],
    },
    preconditions: { pipelineId: "standard", nextStepId: "concept" },
    requiredCapabilities: ["inspect_workspace", "read_pipeline"],
    requiredPermissions: ["read_workspace"],
    summary: "Prepare the current Concept document.",
    issuedAt: at,
  });
}

function json(relativePath: string): AnySchema {
  return JSON.parse(readFileSync(resolve(ROOT, relativePath), "utf8")) as AnySchema;
}
