/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FsOrchestrationCampaignV23Store } from "../../src/adapters/outbound/filesystem/fs-orchestration-campaign-v23-store.ts";
import { FsOrchestrationConfigurationStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-configuration-store.ts";
import { FsOrchestrationEventStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-event-store.ts";
import { GitWorktreeWorkspaceAdapter } from "../../src/adapters/outbound/execution/git-workspace-adapter.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { createOrchestrationV23Runtime } from "../../src/composition/orchestration-v23-runtime.ts";
import { ExecutionProfile } from "../../src/domain/orchestration/execution-profile.ts";
import { OrchestrationConfiguration } from "../../src/domain/orchestration/orchestration-configuration.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { ExecutionProfileRuntimePort } from "../../src/ports/outbound/execution-profile-runtime.ts";
import type { TaskWorkerPort } from "../../src/ports/outbound/task-worker.ts";

test("trois tâches à scopes disjoints s'exécutent en parallèle puis attendent le gate humain", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v23-runtime-"));
  const home = join(sandbox, "home");
  const root = join(sandbox, "project");
  mkdirSync(root, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  git(root, ["init", "-b", "main"]);
  const management = createManagementRuntime({ homeDir: home, sessionId: AgentSessionId.of("development-parallel") });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root, orchestrationMode: "automatic" });
  const featureRoot = join(root, "features", "parallel");
  mkdirSync(featureRoot, { recursive: true });
  const feature = await management.features.create({ id: FeatureId.of("parallel-feature"), projectId: project.id, name: "Parallel", root: featureRoot });
  writeFileSync(join(featureRoot, "feature_brief.json"), JSON.stringify({
    batches: [
      { id: "docs", title: "docs", depends_on: [] },
      { id: "tests", title: "tests", depends_on: [] },
      { id: "src", title: "src", depends_on: [] },
    ],
    impacted_areas: ["docs/guide.md", "tests/parallel.test.ts", "src/parallel.ts"],
    expected_tests: ["Run the test recipe"],
  }), "utf8");
  writeFileSync(join(root, "README.md"), "fixture\n", "utf8");
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "fixture"]);

  const at = new Date("2026-08-25T21:00:00.000Z");
  const profile = ExecutionProfile.create({ schemaVersion: 1, id: "codex-local", transport: "codex-cli", provider: "openai", model: "gpt-5", capabilities: ["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"], egressHosts: [], costMeter: { kind: "unknown", observable: false }, enabled: true, createdAt: at, updatedAt: at });
  const configurations = new FsOrchestrationConfigurationStore();
  await configurations.save(project, OrchestrationConfiguration.empty(project.id.value, at).register(profile, at).activate(at));
  let active = 0;
  let maximumActive = 0;
  const worker: TaskWorkerPort = {
    async execute(input) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 3_000));
      const target = join(input.workspace, input.task.writeScopes[0]!);
      mkdirSync(join(target, ".."), { recursive: true });
      writeFileSync(target, `${input.task.id}\n`, "utf8");
      active -= 1;
      return { executionId: input.executionId, status: "succeeded", proofReferences: [`receipt-recipe-test-pass-${input.task.id}`], usage: { durationSeconds: 3, calls: 1, measurement: "measured" } };
    },
  };
  const profileRuntime: ExecutionProfileRuntimePort = {
    prepare: async (value) => ({ profileId: value.id, command: "/usr/bin/true", home, environment: {}, fingerprint: "a".repeat(64) }),
    preflight: async (value) => ({ profileId: value.id, healthy: true, code: "profile_valid", message: "ready", runtimeFingerprint: "b".repeat(64) }),
  };
  const campaigns = new FsOrchestrationCampaignV23Store(home);
  const runtime = createOrchestrationV23Runtime({ projects: management.projects, features: management.features, agents: management.agents, configurations, campaigns, events: new FsOrchestrationEventStore(home), git: new GitWorktreeWorkspaceAdapter(home), profiles: profileRuntime, worker, now: () => at });
  const unassigned = await runtime.preview({ projectId: project.id, featureId: feature.id });
  assert.equal(unassigned.eligible, false);
  assert.equal(unassigned.issues[0]?.code, "agent_scope_unavailable");
  const agent = await management.agents.register({ project, provider: "Codex", role: "development", featureIds: [feature.id], paths: [], responsibilities: ["development", "integrator"] });
  git(root, ["add", "."]);
  git(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.test", "commit", "-m", "orchestration state"]);
  const preview = await runtime.preview({ projectId: project.id, featureId: feature.id });
  assert.equal(preview.eligible, true, JSON.stringify(preview.issues));
  assert.deepEqual(preview.tasks.map((task) => task.dependencies), [[], [], []]);
  assert.ok(preview.tasks.every((task) => task.agentId === agent.id.value));
  const run = await runtime.start({ projectId: project.id, previewFingerprint: preview.plan!.fingerprint, actor: "Jeremy", profileByRole: { development: profile.id, integrator: profile.id }, allowCommits: true, applyMode: "human", automaticRiskThreshold: 20, maxParallel: 3, budgetMode: "observe", budgetLimits: [], openBarProfiles: [profile.id], riskPolicyFingerprint: preview.riskPolicyFingerprint });
  assert.equal(maximumActive, 3, JSON.stringify(run.projection));
  assert.equal(run.projection.status, "awaiting_application");
  const attemptDiagnostics = (await campaigns.loadAttempts(project.id.value, run.campaignId)).map((attempt) => ({ taskId: attempt.props.taskId, status: attempt.props.status, failureCode: attempt.props.failureCode }));
  assert.deepEqual(run.projection.progress, { attempted: 3, succeeded: 3, failed: 0 }, JSON.stringify(attemptDiagnostics));
  assert.equal(run.artifact?.commits.length, 3);
  assert.equal(run.artifact?.applicationGate?.code, "human_policy");
  assert.equal(git(root, ["rev-parse", "HEAD"]), preview.plan!.props.snapshot.commit);
  const applied = await runtime.apply({ projectId: project.id, campaignId: run.campaignId, confirmationFingerprint: run.artifact!.fingerprint });
  assert.equal(applied.projection.status, "completed");
  assert.equal(applied.application?.candidateFingerprint, run.artifact!.fingerprint);
  assert.equal(git(root, ["rev-parse", "HEAD"]), applied.application?.appliedCommit);
  const status = await runtime.status({ projectId: project.id });
  assert.equal(status.campaigns[0]?.application?.fingerprint, applied.application?.fingerprint);
  await assert.rejects(runtime.apply({ projectId: project.id, campaignId: run.campaignId, confirmationFingerprint: run.artifact!.fingerprint }), /already applied/u);
});

function git(root: string, args: readonly string[]): string { return execFileSync("git", args, { cwd: root, encoding: "utf8", env: { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } }).trim(); }
