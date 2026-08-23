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
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createOrchestrationRuntime, type OrchestrationWorkerLaunch } from "../../src/composition/orchestration-runtime.ts";
import { FsOrchestrationWorkerStateStore, type OrchestrationWorkerState } from "../../src/adapters/outbound/filesystem/fs-orchestration-worker-state-store.ts";
import { FsOrchestrationPolicyStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-policy-store.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { ExecutionPolicy, type ExecutionProviderHealth } from "../../src/domain/orchestration/execution-policy.ts";
import type { AgentInitializationPrompt, AgentOrchestrationAdvice, ForAgentOrchestration, ProductHandoffPrompt } from "../../src/ports/inbound/for-agent-orchestration.ts";
import type { ForPipeline, PipelineDocumentValidation, PipelineScaffoldResult } from "../../src/ports/inbound/for-pipeline.ts";
import type { AgentExecutionMission, AgentExecutionOutcome, AgentExecutionPort } from "../../src/ports/outbound/agent-execution-port.ts";
import type { Clock } from "../../src/ports/outbound/clock.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CAPABILITIES = ["inspect_workspace", "modify_workspace", "read_pipeline"] as const;
const READ_ONLY_CAPABILITIES = ["inspect_workspace", "read_pipeline"] as const;
const CLAUDE_SELECTION = { provider: "claude", model: "claude-test" } as const;

test("le contrôle Arka arme le mode automatique, garde le provider choisi et n'accepte le succès qu'après preuve Pipeline", async (context) => {
  const harness = await createHarness(context, "completed");

  const planned = await startConfirmed(harness);
  assert.equal(planned.status, "planned");
  assert.equal(planned.provider, "claude");
  assert.equal(harness.launches.length, 1);
  assert.equal((await harness.management.projects.show(harness.project.id)).orchestrationMode, "automatic");
  assert.equal(existsSync(resolve(harness.project.root, ".arka-norn", "orchestration.json")), true);
  assert.equal(existsSync(resolve(harness.project.root, ".arka-norn", "executions.json")), true);

  // The user may return to manual while an already valid mission is active;
  // this stops chaining, never silently cancels this mission.
  await harness.management.projects.setOrchestrationMode({ id: harness.project.id, orchestrationMode: "manual" });
  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.orchestrationMode, "manual");
  assert.equal(status.activeExecution, undefined);
  assert.equal(status.latestExecution?.status, "succeeded");
  assert.deepEqual(status.latestExecution?.proofReferences, ["pipeline:next-step:plan", "document:concept.json"]);
  assert.equal(status.latestExecution?.providerSessionId, "fake-provider-session");
  const selection = planned.events.find((event) => event.type === "target_selected" && event.detail.includes("target=claude/claude-test"));
  assert.equal(selection?.detail.includes("target=claude/claude-test"), true);
  assert.equal(harness.port.missions.length, 1);
  assert.equal(harness.port.missions[0]?.provider, "claude");
  assert.deepEqual(harness.port.missions[0]?.permissionPolicy, {
    mode: "preauthorized-workspace",
    scopePaths: ["."],
    permissions: ["read_workspace", "write_workspace"],
  });
  assert.match(harness.port.missions[0]?.mission ?? "", /ARKA_NORN_PROOF:execution-/);
  const audit = readFileSync(resolve(harness.home, ".arka-norn", "logs", "audit.jsonl"), "utf8");
  assert.match(audit, /orchestration\.start/);
  assert.match(audit, /orchestration\.succeed/);
});

test("la préparation est strictement en lecture seule et une confirmation obsolète n'arme rien", async (context) => {
  const harness = await createHarness(context, "completed");
  const policyPath = resolve(harness.project.root, ".arka-norn", "orchestration.json");
  const registryPath = resolve(harness.project.root, ".arka-norn", "executions.json");

  const beforeConfiguration = await harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id });
  assert.equal(beforeConfiguration.candidates.length, 0);
  assert.equal(existsSync(policyPath), false);
  assert.equal(existsSync(registryPath), false);
  assert.equal((await harness.management.projects.show(harness.project.id)).orchestrationMode, "manual");
  assert.equal(harness.launches.length, 0);

  await harness.runtime.configure({ projectId: harness.project.id, selection: CLAUDE_SELECTION });
  const preview = await harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id });
  harness.pipelineState.step = "plan";
  await assert.rejects(
    harness.runtime.start({
      projectId: harness.project.id,
      featureId: harness.feature.id,
      selection: CLAUDE_SELECTION,
      previewFingerprint: preview.fingerprint,
    }),
    /preview changed/i,
  );
  assert.equal(existsSync(registryPath), false);
  assert.equal((await harness.management.projects.show(harness.project.id)).orchestrationMode, "manual");
  assert.equal(harness.launches.length, 0);
});

test("une mission d’audit est préparée en lecture seule, y compris dans son ordre immuable", async (context) => {
  const harness = await createHarness(context, "completed", {
    agentRole: "audit",
    initialStep: "audit_etat_reel",
  });
  await harness.runtime.configure({ projectId: harness.project.id, selection: CLAUDE_SELECTION });

  const preview = await harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id });
  assert.equal(preview.role, "audit");
  assert.deepEqual(preview.requiredCapabilities, READ_ONLY_CAPABILITIES);
  assert.deepEqual(preview.requiredPermissions, ["read_workspace"]);

  const planned = await harness.runtime.start({
    projectId: harness.project.id,
    featureId: harness.feature.id,
    selection: CLAUDE_SELECTION,
    previewFingerprint: preview.fingerprint,
  });
  assert.deepEqual(planned.order.requiredCapabilities, READ_ONLY_CAPABILITIES);
  assert.deepEqual(planned.order.requiredPermissions, ["read_workspace"]);
});

test("une analyse lecture seule produit seulement un verdict sûr et attend la validation manuelle du Pipeline", async (context) => {
  const harness = await createHarness(context, "completed", {
    agentRole: "audit",
    initialStep: "audit_etat_reel",
  });
  await harness.runtime.configure({ projectId: harness.project.id, selection: CLAUDE_SELECTION });
  const preview = await harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id });
  const planned = await harness.runtime.start({
    projectId: harness.project.id,
    featureId: harness.feature.id,
    selection: CLAUDE_SELECTION,
    previewFingerprint: preview.fingerprint,
  });

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "succeeded");
  assert.deepEqual(status.latestExecution?.proofReferences, ["analysis:verdict:findings_require_review"]);
  assert.equal(status.actionRequired?.kind, "inspect");
  assert.equal(status.latestExecution?.events.some((event) => event.type === "read_only_analysis_ready"), true);
  assert.equal(status.latestExecution?.events.some((event) => event.type === "manual_pipeline_validation_required"), true);
  assert.deepEqual(harness.port.missions[0]?.permissionPolicy, {
    mode: "preauthorized-workspace",
    scopePaths: ["."],
    permissions: ["read_workspace"],
  });
  assert.match(harness.port.missions[0]?.mission ?? "", /ARKA_NORN_ANALYSIS:<no_blocker\|findings_require_review\|scope_change_required\|inconclusive>/);
  assert.doesNotMatch(JSON.stringify(status), /PROVIDER_OUTPUT_MUST_NOT_PERSIST|test-secret/);
  await assert.rejects(
    harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id }),
    /read-only analysis awaits manual Pipeline validation/i,
  );
});

test("une analyse lecture seule sans verdict fermé est arrêtée sans persister sa sortie", async (context) => {
  const harness = await createHarness(context, "completed_invalid_read_only", {
    agentRole: "audit",
    initialStep: "audit_etat_reel",
  });
  await harness.runtime.configure({ projectId: harness.project.id, selection: CLAUDE_SELECTION });
  const preview = await harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id });
  const planned = await harness.runtime.start({
    projectId: harness.project.id,
    featureId: harness.feature.id,
    selection: CLAUDE_SELECTION,
    previewFingerprint: preview.fingerprint,
  });

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "failed");
  assert.equal(status.latestExecution?.suspensionReason?.code, "missing_proof");
  assert.deepEqual(status.latestExecution?.proofReferences, []);
  assert.doesNotMatch(JSON.stringify(status), /PROVIDER_OUTPUT_MUST_NOT_PERSIST|test-secret|not_a_verdict/);
});

test("choisir un modèle ne peut pas élargir une politique Project restée en lecture seule", async (context) => {
  const harness = await createHarness(context, "completed");
  const store = new FsOrchestrationPolicyStore();
  const baseline = ExecutionPolicy.defaultFor(harness.project.id, new Date("2026-08-20T10:00:00.000Z"));
  const readOnlyClaude = baseline.withProviders(
    baseline.providers.map((provider) => provider.provider === "claude"
      ? { ...provider, capabilities: [...READ_ONLY_CAPABILITIES], permissions: ["read_workspace"] }
      : provider),
    new Date("2026-08-20T10:01:00.000Z"),
  );
  await store.save(harness.project, readOnlyClaude);

  await harness.runtime.configure({ projectId: harness.project.id, selection: CLAUDE_SELECTION });
  const configured = await store.load(harness.project);
  const claude = configured?.providers.find((provider) => provider.provider === "claude");
  assert.deepEqual(claude?.capabilities, READ_ONLY_CAPABILITIES);
  assert.deepEqual(claude?.permissions, ["read_workspace"]);
  assert.equal(claude?.models.some((model) => model.id === "claude-test" && model.enabled), true);
});

test("le Pilote assisté n'enchaîne jamais une seconde mission sans une nouvelle préparation", async (context) => {
  const harness = await createHarness(context, "completed");
  const planned = await startConfirmed(harness);
  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.orchestrationMode, "automatic");
  assert.equal(status.executions.length, 1);
  assert.equal(status.latestExecution?.status, "succeeded");
  assert.equal(status.latestExecution?.events.some((event) => event.type === "next_preview_required"), true);
  assert.equal(harness.launches.length, 1);
});

test("la relance garde exactement l'assistant et la version confirmés", async (context) => {
  const harness = await createHarness(context, "awaiting_approval");
  const planned = await startConfirmed(harness);
  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });
  const retry = await harness.runtime.retry({ projectId: harness.project.id, executionId: planned.id });

  assert.deepEqual(retry.target, planned.target);
  assert.equal(retry.target.model, "claude-test");
  assert.equal(harness.launches.length, 2);
});

test("Z.AI Coding Plan est routé par le worker Claude borné, tandis que Kimi ACP reste arrêté pour les écritures", async (context) => {
  const zaiSelection = { provider: "zai", model: "glm-coding-plan" } as const;
  const zai = await createHarness(context, "completed", {
    agentProvider: "Z.AI Coding Plan",
    providerHealth: () => [{ provider: "zai", healthy: true, capabilities: CAPABILITIES }],
  });
  await zai.runtime.configure({ projectId: zai.project.id, selection: zaiSelection });
  const zaiPreview = await zai.runtime.preview({ projectId: zai.project.id, featureId: zai.feature.id });
  const zaiCandidate = zaiPreview.candidates.find((candidate) => candidate.target.provider === "zai");
  assert.equal(zaiCandidate?.eligible, true);
  const zaiPlanned = await zai.runtime.start({
    projectId: zai.project.id,
    featureId: zai.feature.id,
    selection: zaiSelection,
    previewFingerprint: zaiPreview.fingerprint,
  });
  await zai.runtime.runWorker({ projectId: zai.project.id.value, executionId: zaiPlanned.id });
  const zaiMission = zai.port.missions[0];
  assert.equal(zaiMission?.provider, "claude");
  if (zaiMission?.provider !== "claude") throw new Error("Z.AI mission was not routed through the Claude worker.");
  assert.equal(zaiMission.providerProfile, "zai");
  assert.equal(zaiMission.model, "glm-coding-plan");

  const kimi = await createHarness(context, "completed", {
    agentProvider: "Kimi Platform",
    providerHealth: () => [{ provider: "kimi", healthy: true, capabilities: CAPABILITIES }],
  });
  await kimi.runtime.configure({ projectId: kimi.project.id, selection: { provider: "kimi", model: "kimi-coding" } });
  const kimiPreview = await kimi.runtime.preview({ projectId: kimi.project.id, featureId: kimi.feature.id });
  const kimiCandidate = kimiPreview.candidates.find((candidate) => candidate.target.provider === "kimi");
  assert.equal(kimiCandidate?.eligible, false);
  assert.ok(kimiCandidate?.reasons.includes("missing_capability"));
  assert.ok(kimiCandidate?.reasons.includes("missing_permission"));
});

test("une permission opaque est refusée sans boucle d'approbation", async (context) => {
  const harness = await createHarness(context, "awaiting_approval");
  const planned = await startConfirmed(harness);
  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const suspended = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(suspended.activeExecution, undefined);
  assert.equal(suspended.latestExecution?.status, "failed");
  assert.equal(suspended.latestExecution?.suspensionReason?.code, "permission_not_preapproved");
  assert.equal(suspended.actionRequired?.kind, "inspect");
  await assert.rejects(
    harness.runtime.approve({ projectId: harness.project.id, executionId: planned.id }),
    /expected awaiting_approval status/,
  );
  assert.equal(harness.launches.length, 1);
});

test("un changement Pipeline externe sans marqueur de preuve lié à l'exécution ne suffit pas", async (context) => {
  const harness = await createHarness(context, "completed_without_proof");
  const planned = await startConfirmed(harness);

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "failed");
  assert.equal(status.latestExecution?.suspensionReason?.code, "missing_proof");
});

test("un document Pipeline nouveau mais signé par un autre Agent ne vaut pas preuve de la mission", async (context) => {
  const harness = await createHarness(context, "completed");
  harness.pipelineState.document.authorAgentId = "OpenAI-Codex_qa_20260821";
  const planned = await startConfirmed(harness);

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "failed");
  assert.equal(status.latestExecution?.suspensionReason?.code, "missing_proof");
});

test("un document Pipeline nouveau d'un autre type ne vaut pas preuve de la mission", async (context) => {
  const harness = await createHarness(context, "completed");
  harness.pipelineState.document.type = "plan";
  const planned = await startConfirmed(harness);

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "failed");
  assert.equal(status.latestExecution?.suspensionReason?.code, "missing_proof");
});

test("une identité Agent d'un autre provider rejette la mission avant dispatch", async (context) => {
  const harness = await createHarness(context, "completed", { agentProvider: "Fake Codex" });
  const planned = await startConfirmed(harness);

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "rejected");
  assert.equal(status.latestExecution?.suspensionReason?.code, "precondition_changed");
  assert.equal(harness.port.missions.length, 0);
});

test("une précondition Pipeline devenue obsolète rejette l'ordre avant tout dispatch", async (context) => {
  const harness = await createHarness(context, "completed");
  const planned = await startConfirmed(harness);
  harness.pipelineState.step = "plan";

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "rejected");
  assert.equal(status.latestExecution?.suspensionReason?.code, "precondition_changed");
  assert.equal(harness.port.missions.length, 0);
});

test("un worker sans heartbeat est récupéré comme interrompu sans signaler son PID", async (context) => {
  let now = new Date("2026-08-20T10:00:00.000Z");
  const harness = await createHarness(context, "completed", { clock: { now: () => new Date(now.getTime()) } });
  const stale = await startConfirmed(harness);
  now = new Date(now.getTime() + 61_000);

  const replacement = await startConfirmed(harness);
  const status = await harness.runtime.status({ projectId: harness.project.id });
  const recovered = status.executions.find((execution) => execution.id === stale.id);

  assert.equal(recovered?.status, "rejected");
  assert.equal(recovered?.suspensionReason?.code, "worker_unavailable");
  assert.notEqual(replacement.id, stale.id);
  assert.equal(harness.launches.length, 2);
});

test("une panne avant dispatch rejette la mission et laisse une trace d’audit", async (context) => {
  const harness = await createHarness(context, "completed", {
    workerStateStoreFactory: (home) => new FailingWorkerStateStore(home),
  });
  const planned = await startConfirmed(harness);

  await assert.rejects(
    harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id }),
    /terminated safely after an internal failure/,
  );

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.latestExecution?.status, "rejected");
  assert.equal(status.latestExecution?.suspensionReason?.code, "worker_unavailable");
  const audit = readFileSync(resolve(harness.home, ".arka-norn", "logs", "audit.jsonl"), "utf8");
  assert.match(audit, /orchestration\.worker/);
});

interface Harness {
  readonly home: string;
  readonly project: Awaited<ReturnType<ReturnType<typeof createManagementRuntime>["projects"]["create"]>>;
  readonly feature: Awaited<ReturnType<ReturnType<typeof createManagementRuntime>["features"]["create"]>>;
  readonly management: ReturnType<typeof createManagementRuntime>;
  readonly runtime: ReturnType<typeof createOrchestrationRuntime>;
  readonly launches: OrchestrationWorkerLaunch[];
  readonly port: FakeExecutionPort;
  readonly pipelineState: PipelineState;
}

interface PipelineState {
  step: "concept" | "plan" | "audit_etat_reel";
  document: { type: string; authorAgentId: string };
}

interface HarnessRuntimeOptions {
  readonly clock?: Clock;
  readonly agentProvider?: string;
  readonly agentRole?: "product" | "audit";
  readonly initialStep?: PipelineState["step"];
  readonly providerHealth?: () => readonly ExecutionProviderHealth[];
  readonly workerStateStoreFactory?: (home: string) => FsOrchestrationWorkerStateStore;
}

async function startConfirmed(harness: Harness) {
  await harness.runtime.configure({ projectId: harness.project.id, selection: CLAUDE_SELECTION });
  const preview = await harness.runtime.preview({ projectId: harness.project.id, featureId: harness.feature.id });
  return harness.runtime.start({
    projectId: harness.project.id,
    featureId: harness.feature.id,
    selection: CLAUDE_SELECTION,
    previewFingerprint: preview.fingerprint,
  });
}

async function createHarness(
  context: { after(callback: () => void): void },
  result: "completed" | "completed_without_proof" | "completed_invalid_read_only" | "awaiting_approval",
  runtimeOptions: HarnessRuntimeOptions = {},
): Promise<Harness> {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-orchestration-runtime-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(projectRoot, "feature");
  mkdirSync(featureRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: home });
  const project = await management.projects.create({
    id: ProjectId.of("project"),
    name: "Project",
    root: projectRoot,
    orchestrationMode: "manual",
  });
  const feature = await management.features.create({
    id: FeatureId.of("feature"),
    projectId: project.id,
    name: "Feature",
    root: featureRoot,
    pipelineId: "arka-norn-default",
  });
  const agentManagement = runtimeOptions.agentRole === "audit"
    ? createManagementRuntime({ homeDir: home, sessionId: AgentSessionId.of("audit-feature") })
    : management;
  const agent = await agentManagement.agents.register({
    project,
    provider: runtimeOptions.agentProvider ?? "Fake Claude",
    role: runtimeOptions.agentRole ?? "product",
    featureIds: [feature.id],
  });

  const pipelineState: PipelineState = {
    step: runtimeOptions.initialStep ?? "concept",
    document: { type: "concept", authorAgentId: agent.id.value },
  };
  const port = new FakeExecutionPort(result, pipelineState);
  const launches: OrchestrationWorkerLaunch[] = [];
  const workerStateStore = runtimeOptions.workerStateStoreFactory?.(home);
  const runtime = createOrchestrationRuntime({
    ...management,
    agents: agentManagement.agents,
    pipeline: fakePipeline(pipelineState),
    homeDir: home,
    frameworkRoot: ROOT,
    agentOrchestration: fakeAgentOrchestration(),
    executionPort: port,
    workerLauncher: { async launch(input): Promise<void> { launches.push(input); } },
    providerHealth: runtimeOptions.providerHealth ?? (() => [{ provider: "claude", healthy: true, capabilities: CAPABILITIES }]),
    environment: { ARKA_NORN_MASTRA_CLAUDE_ENABLED: "1" },
    ...(runtimeOptions.clock === undefined ? {} : { clock: runtimeOptions.clock }),
    ...(workerStateStore === undefined ? {} : { workerStateStore }),
  });
  return { home, project, feature, management, runtime, launches, port, pipelineState };
}

class FailingWorkerStateStore extends FsOrchestrationWorkerStateStore {
  public override async start(_input: Parameters<FsOrchestrationWorkerStateStore["start"]>[0]): Promise<OrchestrationWorkerState> {
    throw new Error("forced worker state failure");
  }
}

class FakeExecutionPort implements AgentExecutionPort {
  public readonly missions: AgentExecutionMission[] = [];
  private readonly outcomes = new Map<string, AgentExecutionOutcome>();

  public constructor(
    private readonly result: "completed" | "completed_without_proof" | "completed_invalid_read_only" | "awaiting_approval",
    private readonly pipelineState: PipelineState,
  ) {}

  public async dispatch(mission: AgentExecutionMission): Promise<AgentExecutionOutcome> {
    this.missions.push(mission);
    const permissions = mission.permissionPolicy === undefined || mission.permissionPolicy === "deny-all"
      ? []
      : mission.permissionPolicy.permissions;
    const readOnly = !permissions.includes("write_workspace");
    const expectedStep = mission.mission.match(/Étape Pipeline immuable: ([a-z0-9_]+)/u)?.[1] ?? "concept";
    if (!readOnly && (this.result === "completed" || this.result === "completed_without_proof" || this.result === "completed_invalid_read_only")) this.pipelineState.step = "plan";
    const outcome: AgentExecutionOutcome = {
      executionId: mission.executionId,
      provider: mission.provider,
      workspace: mission.workspace,
      status: this.result === "awaiting_approval" ? "awaiting_approval" : "completed",
      attempt: 1,
      retryStrategy: "new-run",
      startedAt: "2026-08-20T10:00:00.000Z",
      completedAt: "2026-08-20T10:00:01.000Z",
      ...(this.result === "awaiting_approval" ? {
        approval: { code: "permission_requested" as const, message: "Permission required.", retryStrategy: "new-run" as const },
        failure: { code: "PERMISSION_REQUESTED", message: "Permission required.", retryable: true },
      } : {
        output: this.result === "completed"
          ? readOnly
            ? `PROVIDER_OUTPUT_MUST_NOT_PERSIST test-secret\nARKA_NORN_ANALYSIS:findings_require_review\nARKA_NORN_PROOF:${mission.executionId}:${expectedStep}`
            : `ARKA_NORN_PROOF:${mission.executionId}:${expectedStep}`
          : this.result === "completed_invalid_read_only"
            ? `PROVIDER_OUTPUT_MUST_NOT_PERSIST test-secret\nARKA_NORN_ANALYSIS:not_a_verdict\nARKA_NORN_PROOF:${mission.executionId}:${expectedStep}`
            : "completed by an unrelated worker",
        sessionId: "fake-provider-session",
      }),
    };
    this.outcomes.set(mission.executionId, outcome);
    return outcome;
  }

  public async inspect(input: { readonly executionId: string }): Promise<AgentExecutionOutcome | undefined> {
    return this.outcomes.get(input.executionId);
  }

  public async cancel(input: { readonly executionId: string }): Promise<AgentExecutionOutcome> {
    const current = this.outcomes.get(input.executionId);
    if (current === undefined) throw new Error("missing fake execution");
    const cancelled: AgentExecutionOutcome = { ...current, status: "cancelled", completedAt: "2026-08-20T10:00:01.000Z" };
    this.outcomes.set(input.executionId, cancelled);
    return cancelled;
  }

  public async retry(input: { readonly executionId: string; readonly newExecutionId: string }): Promise<AgentExecutionOutcome> {
    const current = this.outcomes.get(input.executionId);
    if (current === undefined) throw new Error("missing fake execution");
    const retried: AgentExecutionOutcome = { ...current, executionId: input.newExecutionId, status: "running" };
    this.outcomes.set(input.newExecutionId, retried);
    return retried;
  }
}

function fakePipeline(state: PipelineState): ForPipeline {
  return {
    async inspect(input) {
      return {
        schemaVersion: 1,
        pipelineId: input.pipelineId ?? "arka-norn-default",
        featureRoot: input.featureRoot,
        ...(input.featureId === undefined ? {} : { featureId: input.featureId }),
        selectedDocuments: {},
        overallStatus: "incomplete",
        steps: state.step === "plan" ? [{
          id: "concept",
          order: 1,
          required: true,
          multiple: false,
          presenceStatus: "present",
          schemaStatus: "valid",
          businessStatus: "passed",
          dependencyStatus: "satisfied",
          completionStatus: "completed",
          documents: [{
            id: "concept-proof",
            type: state.document.type,
            filePath: join(input.featureRoot, "concept.json"),
            valid: true,
            errors: [],
            authorAgentId: state.document.authorAgentId,
            dependencyDocumentIds: [],
          }],
          nextActions: [],
        }] : [],
        transversalDocuments: [],
        nextActions: [{ kind: "create_document", stepId: state.step, reason: "Fake deterministic Pipeline step." }],
        errors: [],
        warnings: [],
        unknownFiles: [],
      };
    },
    async validate(_input): Promise<PipelineDocumentValidation> { return { valid: true, errors: [] }; },
    async scaffold(_input): Promise<PipelineScaffoldResult> { return { stepId: "concept", outputPath: "", sentinelPaths: [] }; },
    async listSteps(_pipelineId) { return []; },
    async listWorkflows() { return []; },
    async showWorkflow(_pipelineId) { throw new Error("not used"); },
    async defaultWorkflowId() { return "arka-norn-essentiel"; },
  };
}

function fakeAgentOrchestration(): ForAgentOrchestration {
  return {
    async advise(_input): Promise<AgentOrchestrationAdvice> {
      return {
        schemaVersion: 1,
        projectId: "project",
        featureId: "feature",
        pipelineId: "arka-norn-default",
        phase: "Fake",
        nextStepId: "concept",
        productPrincipal: { sessionId: "main", status: "ready", reason: "Fake." },
        productNextAction: "Fake.",
        recommendations: [],
        handoffPromptCommand: "fake",
        warnings: [],
      };
    },
    async initializationPrompt(input): Promise<AgentInitializationPrompt> {
      const audit = input.role === "audit";
      return {
        schemaVersion: 1,
        projectId: "project",
        featureId: "feature",
        role: input.role,
        mode: "execute",
        sessionId: audit ? "audit-feature" : "main",
        skill: audit ? "arka-framework-audit" : "arka-product",
        skillProfile: audit ? "core" : "product",
        preflightCommand: "fake",
        canWrite: !audit,
        expectedStepId: audit ? "audit_etat_reel" : "concept",
        prompt: "Execute only the currently validated fake Pipeline step.",
      };
    },
    async productHandoffPrompt(_input): Promise<ProductHandoffPrompt> {
      return { schemaVersion: 1, projectId: "project", sessionId: "main", agentId: "fake", prompt: "fake" };
    },
  };
}
