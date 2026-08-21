import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createOrchestrationRuntime, type OrchestrationWorkerLaunch } from "../../src/composition/orchestration-runtime.ts";
import { FsOrchestrationWorkerStateStore, type OrchestrationWorkerState } from "../../src/adapters/outbound/filesystem/fs-orchestration-worker-state-store.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { AgentInitializationPrompt, AgentOrchestrationAdvice, ForAgentOrchestration, ProductHandoffPrompt } from "../../src/ports/inbound/for-agent-orchestration.ts";
import type { ForPipeline, PipelineDocumentValidation, PipelineScaffoldResult } from "../../src/ports/inbound/for-pipeline.ts";
import type { AgentExecutionMission, AgentExecutionOutcome, AgentExecutionPort } from "../../src/ports/outbound/agent-execution-port.ts";
import type { Clock } from "../../src/ports/outbound/clock.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const CAPABILITIES = ["inspect_workspace", "modify_workspace", "read_pipeline"] as const;

test("le contrôle Arka arme le mode automatique, garde le provider choisi et n'accepte le succès qu'après preuve Pipeline", async (context) => {
  const harness = await createHarness(context, "completed");

  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });
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
  assert.equal(status.activeExecution?.status, "succeeded");
  assert.deepEqual(status.activeExecution?.proofReferences, ["pipeline:next-step:plan", "document:concept.json"]);
  assert.equal(status.activeExecution?.providerSessionId, "fake-provider-session");
  const selection = planned.events.find((event) => event.type === "provider_selected");
  assert.equal(selection?.detail.includes("selected=claude"), true);
  assert.equal(selection?.detail.includes("claude:eligible"), true);
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

test("une permission opaque est refusée sans boucle d'approbation", async (context) => {
  const harness = await createHarness(context, "awaiting_approval");
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });
  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const suspended = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(suspended.activeExecution?.status, "failed");
  assert.equal(suspended.activeExecution?.suspensionReason?.code, "permission_not_preapproved");
  assert.equal(suspended.actionRequired?.kind, "inspect");
  await assert.rejects(
    harness.runtime.approve({ projectId: harness.project.id, executionId: planned.id }),
    /expected awaiting_approval status/,
  );
  assert.equal(harness.launches.length, 1);
});

test("un changement Pipeline externe sans marqueur de preuve lié à l'exécution ne suffit pas", async (context) => {
  const harness = await createHarness(context, "completed_without_proof");
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.activeExecution?.status, "failed");
  assert.equal(status.activeExecution?.suspensionReason?.code, "missing_proof");
});

test("un document Pipeline nouveau mais signé par un autre Agent ne vaut pas preuve de la mission", async (context) => {
  const harness = await createHarness(context, "completed");
  harness.pipelineState.document.authorAgentId = "OpenAI-Codex_qa_20260821";
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.activeExecution?.status, "failed");
  assert.equal(status.activeExecution?.suspensionReason?.code, "missing_proof");
});

test("un document Pipeline nouveau d'un autre type ne vaut pas preuve de la mission", async (context) => {
  const harness = await createHarness(context, "completed");
  harness.pipelineState.document.type = "plan";
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.activeExecution?.status, "failed");
  assert.equal(status.activeExecution?.suspensionReason?.code, "missing_proof");
});

test("une identité Agent d'un autre provider rejette la mission avant dispatch", async (context) => {
  const harness = await createHarness(context, "completed", { agentProvider: "Fake Codex" });
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.activeExecution?.status, "rejected");
  assert.equal(status.activeExecution?.suspensionReason?.code, "precondition_changed");
  assert.equal(harness.port.missions.length, 0);
});

test("une précondition Pipeline devenue obsolète rejette l'ordre avant tout dispatch", async (context) => {
  const harness = await createHarness(context, "completed");
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });
  harness.pipelineState.step = "plan";

  await harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id });

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.activeExecution?.status, "rejected");
  assert.equal(status.activeExecution?.suspensionReason?.code, "precondition_changed");
  assert.equal(harness.port.missions.length, 0);
});

test("un worker sans heartbeat est récupéré comme interrompu sans signaler son PID", async (context) => {
  let now = new Date("2026-08-20T10:00:00.000Z");
  const harness = await createHarness(context, "completed", { clock: { now: () => new Date(now.getTime()) } });
  const stale = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });
  now = new Date(now.getTime() + 61_000);

  const replacement = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });
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
  const planned = await harness.runtime.start({ projectId: harness.project.id, featureId: harness.feature.id });

  await assert.rejects(
    harness.runtime.runWorker({ projectId: harness.project.id.value, executionId: planned.id }),
    /terminated safely after an internal failure/,
  );

  const status = await harness.runtime.status({ projectId: harness.project.id });
  assert.equal(status.activeExecution?.status, "rejected");
  assert.equal(status.activeExecution?.suspensionReason?.code, "worker_unavailable");
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
  step: "concept" | "plan";
  document: { type: string; authorAgentId: string };
}

interface HarnessRuntimeOptions {
  readonly clock?: Clock;
  readonly agentProvider?: string;
  readonly workerStateStoreFactory?: (home: string) => FsOrchestrationWorkerStateStore;
}

async function createHarness(
  context: { after(callback: () => void): void },
  result: "completed" | "completed_without_proof" | "awaiting_approval",
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
  const agent = await management.agents.register({
    project,
    provider: runtimeOptions.agentProvider ?? "Fake Claude",
    role: "product",
    featureIds: [feature.id],
  });

  const pipelineState: PipelineState = {
    step: "concept",
    document: { type: "concept", authorAgentId: agent.id.value },
  };
  const port = new FakeExecutionPort(result, pipelineState);
  const launches: OrchestrationWorkerLaunch[] = [];
  const workerStateStore = runtimeOptions.workerStateStoreFactory?.(home);
  const runtime = createOrchestrationRuntime({
    ...management,
    pipeline: fakePipeline(pipelineState),
    homeDir: home,
    frameworkRoot: ROOT,
    agentOrchestration: fakeAgentOrchestration(),
    executionPort: port,
    workerLauncher: { async launch(input): Promise<void> { launches.push(input); } },
    providerHealth: () => [{ provider: "claude", healthy: true, capabilities: CAPABILITIES }],
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
    private readonly result: "completed" | "completed_without_proof" | "awaiting_approval",
    private readonly pipelineState: PipelineState,
  ) {}

  public async dispatch(mission: AgentExecutionMission): Promise<AgentExecutionOutcome> {
    this.missions.push(mission);
    if (this.result === "completed" || this.result === "completed_without_proof") this.pipelineState.step = "plan";
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
          ? `ARKA_NORN_PROOF:${mission.executionId}:concept`
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
    async initializationPrompt(_input): Promise<AgentInitializationPrompt> {
      return {
        schemaVersion: 1,
        projectId: "project",
        featureId: "feature",
        role: "product",
        mode: "execute",
        sessionId: "main",
        skill: "arka-product",
        skillProfile: "product",
        preflightCommand: "fake",
        canWrite: true,
        expectedStepId: "concept",
        prompt: "Execute only the currently validated fake Pipeline step.",
      };
    },
    async productHandoffPrompt(_input): Promise<ProductHandoffPrompt> {
      return { schemaVersion: 1, projectId: "project", sessionId: "main", agentId: "fake", prompt: "fake" };
    },
  };
}
