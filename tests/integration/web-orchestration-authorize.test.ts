/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { test } from "node:test";

import { FsGovernanceStore } from "../../src/adapters/outbound/filesystem/fs-governance-store.ts";
import { FsLocalePreferenceStore } from "../../src/adapters/outbound/filesystem/fs-locale-preference-store.ts";
import { FsOrchestrationConfigurationStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-configuration-store.ts";
import { FsOrchestrationCampaignV23Store } from "../../src/adapters/outbound/filesystem/fs-orchestration-campaign-v23-store.ts";
import { FsOrchestrationEventStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-event-store.ts";
import { FsAgentRegistryStore } from "../../src/adapters/outbound/filesystem/fs-agent-registry-store.ts";
import { GitWorktreeWorkspaceAdapter } from "../../src/adapters/outbound/execution/git-workspace-adapter.ts";
import { ProjectTrackingService } from "../../src/application/web/project-tracking-service.ts";
import { createAgentOrchestrationRuntime } from "../../src/composition/agent-orchestration-runtime.ts";
import { createDoctorRuntime } from "../../src/composition/doctor-runtime.ts";
import { createFramingRuntime } from "../../src/composition/framing-runtime.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createOrchestrationV23Runtime } from "../../src/composition/orchestration-v23-runtime.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { ExecutionProfile } from "../../src/domain/orchestration/execution-profile.ts";
import { OrchestrationConfiguration } from "../../src/domain/orchestration/orchestration-configuration.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { ExecutionProfileRuntimePort } from "../../src/ports/outbound/execution-profile-runtime.ts";
import type { TaskWorkerPort } from "../../src/ports/outbound/task-worker.ts";
import { writeLegacyFeatureMarker } from "../helpers/legacy-feature.ts";

const FRAMEWORK_ROOT = resolve(import.meta.dirname, "..", "..");

test("le Web autorise un run depuis l'empreinte exacte et exige une application humaine", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-web-orch-authorize-"));
  const home = resolve(sandbox, "home");
  const root = resolve(sandbox, "project");
  mkdirSync(root, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  git(root, ["init", "-b", "main"]);

  const at = new Date("2026-08-27T11:00:00.000Z");
  const management = createManagementRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT, sessionId: AgentSessionId.of("orch-authorize"), clock: { now: () => at } });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root, orchestrationMode: "automatic" });
  const featureRoot = join(root, "features", "authorize");
  writeLegacyFeatureMarker({ root: featureRoot, id: "authorize-feature", projectId: project.id.value, name: "Authorize" });
  const feature = await management.features.importFrom({ projectId: project.id, root: featureRoot });
  writeFileSync(join(featureRoot, "feature_brief.json"), JSON.stringify({
    batches: [{ id: "docs", title: "docs", depends_on: [] }],
    impacted_areas: ["docs/guide.md"],
    expected_tests: ["Run the test recipe"],
  }), "utf8");
  writeFileSync(join(root, "README.md"), "fixture\n", "utf8");
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);
  await management.agents.register({ project, provider: "Codex", role: "development", featureIds: [feature.id], paths: [], responsibilities: ["development", "integrator"] });
  const profile = ExecutionProfile.create({ schemaVersion: 1, id: "codex-local", transport: "codex-cli", provider: "openai", model: "gpt-5", capabilities: ["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"], egressHosts: [], costMeter: { kind: "unknown", observable: false }, enabled: true, createdAt: at, updatedAt: at });
  const configurations = new FsOrchestrationConfigurationStore();
  await configurations.save(project, OrchestrationConfiguration.empty(project.id.value, at).register(profile, at).activate(at));
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "state"]);

  const profileRuntime: ExecutionProfileRuntimePort = {
    prepare: async (value) => ({ profileId: value.id, command: "/usr/bin/true", home, environment: {}, fingerprint: "a".repeat(64) }),
    preflight: async (value) => ({ profileId: value.id, healthy: true, code: "profile_valid", message: "ready", runtimeFingerprint: "b".repeat(64) }),
  };
  const worker: TaskWorkerPort = {
    async execute(input) {
      const target = join(input.workspace, input.task.writeScopes[0]!);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, `${input.task.id}\n`, "utf8");
      return { executionId: input.executionId, status: "succeeded", proofReferences: [`receipt-recipe-test-pass-${input.task.id}`], usage: { durationSeconds: 1, calls: 1, measurement: "measured" } };
    },
  };
  const orchestrationV23 = createOrchestrationV23Runtime({ projects: management.projects, features: management.features, agents: management.agents, configurations, campaigns: new FsOrchestrationCampaignV23Store(home), events: new FsOrchestrationEventStore(home), git: new GitWorktreeWorkspaceAdapter(home), profiles: profileRuntime, worker, now: () => at });

  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir: home });
  const service = new ProjectTrackingService({
    management,
    pipeline,
    framing: createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT }),
    agentOrchestration: createAgentOrchestrationRuntime({ ...management, pipeline, preferredSurface: () => Promise.resolve("web"), allowEmptyAuthorRegistry: true }),
    governance: new FsGovernanceStore(),
    preferences: new FsLocalePreferenceStore(home),
    doctor: createDoctorRuntime(home, root),
    folderPicker: { pick: async () => root },
    homeDir: home,
    orchestrationConfigurations: configurations,
    orchestrationV23,
    agentRegistry: new FsAgentRegistryStore(),
    agentsForSession: (sessionId) => createManagementRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT, sessionId }).agents,
    now: () => at,
  });

  const preview = await service.previewOrchestration(project.id.value, feature.id.value);
  assert.equal(preview.eligible, true, JSON.stringify(preview.issues));
  assert.ok(preview.planFingerprint !== null);

  const run = await service.authorizeOrchestration(project.id.value, {
    previewFingerprint: preview.planFingerprint!,
    riskPolicyFingerprint: preview.riskPolicyFingerprint,
    actor: "Jeremy",
    profileByRole: { development: profile.id, integrator: profile.id },
    allowCommits: true,
    applyMode: "human",
    automaticRiskThreshold: 20,
    maxParallel: 3,
    budgetMode: "observe",
    budgetLimits: [],
    openBarProfiles: [profile.id],
  });
  assert.equal(run.schemaVersion, 1);
  assert.equal(run.status, "awaiting_application");
  assert.deepEqual(run.progress, { attempted: 1, succeeded: 1, failed: 0 });
  assert.ok(run.applicationFingerprint !== null && /^[a-f0-9]{64}$/u.test(run.applicationFingerprint));
  assert.equal(run.applicationGate?.code, "human_policy");
  assert.equal(run.appliedCommit, null);

  const applied = await service.applyOrchestration(project.id.value, { campaignId: run.campaignId, confirmationFingerprint: run.applicationFingerprint! });
  assert.equal(applied.status, "completed");
  assert.ok(applied.appliedCommit !== null);
  assert.equal(git(root, ["rev-parse", "HEAD"]), applied.appliedCommit);

  await assert.rejects(
    service.authorizeOrchestration(project.id.value, {
      previewFingerprint: "c".repeat(64),
      riskPolicyFingerprint: preview.riskPolicyFingerprint,
      actor: "Jeremy",
      profileByRole: { development: profile.id, integrator: profile.id },
      allowCommits: true,
      applyMode: "human",
      automaticRiskThreshold: 20,
      maxParallel: 3,
      budgetMode: "observe",
      budgetLimits: [],
      openBarProfiles: [profile.id],
    }),
    /fingerprint/u,
  );
});

function git(root: string, args: readonly string[]): string { return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim(); }
