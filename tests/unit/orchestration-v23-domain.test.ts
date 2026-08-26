/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { ExecutionProfile } from "../../src/domain/orchestration/execution-profile.ts";
import { CampaignBudget } from "../../src/domain/orchestration/orchestration-budget.ts";
import { projectCampaignEvents, type CampaignEvent } from "../../src/domain/orchestration/orchestration-event.ts";
import { CampaignPlan, RunAuthorization, TaskAttempt, type CampaignPlanProps } from "../../src/domain/orchestration/orchestration-plan.ts";
import { planFingerprint } from "../../src/composition/orchestration-v23-plan-builder.ts";
import { assessRisk } from "../../src/domain/orchestration/orchestration-risk.ts";

const at = new Date("2026-08-25T20:00:00.000Z");
const agentId = "Codex_development_20260825";

test("un profil sépare transport, gateway, provider, modèle et référence de secret", () => {
  const profile = ExecutionProfile.create({
    schemaVersion: 1,
    id: "opencodex-zai",
    transport: "codex-cli",
    gateway: {
      kind: "opencodex",
      endpoint: "https://gateway.example.test/v1",
      catalogRef: "catalogs/opencodex.json",
      fingerprint: "a".repeat(64),
    },
    provider: "zai",
    model: "glm-5.2",
    credentialRef: { kind: "keychain", name: "arka/opencodex", environmentVariable: "OPENAI_API_KEY" },
    capabilities: ["inspect_workspace", "modify_workspace"],
    egressHosts: ["gateway.example.test"],
    costMeter: { kind: "currency_eur", observable: true },
    enabled: true,
    createdAt: at,
    updatedAt: at,
  });

  assert.equal(profile.transport, "codex-cli");
  assert.equal(profile.provider, "zai");
  assert.equal(profile.model, "glm-5.2");
  assert.throws(() => ExecutionProfile.create({ ...profile.props, credentialRef: { kind: "environment", name: "api_key=secret-value", environmentVariable: "OPENAI_API_KEY" } }));
  assert.throws(() => ExecutionProfile.create({ ...profile.props, gateway: { ...profile.props.gateway!, endpoint: "https://user:secret@gateway.example.test/v1" } }));
});

test("le DAG expose seulement les tâches prêtes dans l'ordre de priorité", () => {
  const plan = createPlan();
  assert.deepEqual(plan.ready([], []).map((task) => task.id), ["docs", "tests"]);
  assert.deepEqual(plan.ready(["docs"], ["tests"]).map((task) => task.id), []);
  assert.deepEqual(plan.ready(["docs", "tests"], []).map((task) => task.id), ["audit"]);
});

test("le DAG refuse les cycles et les scopes d'écriture concurrents", () => {
  const base = createPlan().props;
  assert.throws(() => CampaignPlan.create({
    ...base,
    tasks: [
      { ...base.tasks[0]!, dependencies: ["tests"] },
      { ...base.tasks[1]!, dependencies: ["docs"] },
    ],
  }), /cycle/u);
  assert.throws(() => CampaignPlan.create({
    ...base,
    tasks: [
      base.tasks[0]!,
      { ...base.tasks[1]!, readScopes: ["docs/shared"], writeScopes: ["docs/shared"] },
    ],
  }), /overlapping write scopes/u);
});

test("l'autorisation fige profils par rôle, commits, budget et parallélisme", () => {
  const plan = createPlan();
  const authorization = RunAuthorization.create({
    schemaVersion: 1,
    campaignPlanFingerprint: plan.fingerprint,
    actor: "Jeremy Grimonpont",
    profileByRole: { dev: "opencodex-zai", qa: "claude-sonnet", audit: "codex-audit", integrator: "claude-sonnet" },
    profileFingerprintByRole: { dev: "1".repeat(64), qa: "2".repeat(64), audit: "3".repeat(64), integrator: "4".repeat(64) },
    allowCommits: true,
    applyMode: "automatic",
    automaticRiskThreshold: 20,
    maxParallel: 3,
    budgetMode: "admission",
    budgetLimits: [{ profileId: "opencodex-zai", metric: "currency_eur", maximum: 20 }],
    openBarProfiles: ["claude-sonnet", "codex-audit"],
    riskPolicyFingerprint: "c".repeat(64),
    confirmedAt: at,
  }, plan);

  assert.equal(authorization.profileFor("dev"), "opencodex-zai");
  assert.throws(() => RunAuthorization.create({ ...authorization.props, profileByRole: { dev: "opencodex-zai" } }, plan));
  assert.throws(() => RunAuthorization.create({ ...authorization.props, allowCommits: false }, plan));
});

test("une tentative réussie exige commit et preuve", () => {
  assert.throws(() => TaskAttempt.create({
    schemaVersion: 1,
    id: "attempt-docs-1",
    taskId: "docs",
    profileId: "opencodex-zai",
    status: "succeeded",
    worktree: "/private/worktrees/docs",
    branch: "norn/campaign/docs",
    proofReferences: [],
    startedAt: at,
    endedAt: at,
  }));
});

test("la projection événementielle ne compte comme terminées que les tâches réussies", () => {
  const events: CampaignEvent[] = [
    event(1, "campaign_planned"),
    event(2, "campaign_authorized"),
    event(3, "task_prepared", "docs"),
    event(4, "task_started", "docs"),
    event(5, "task_failed", "docs"),
  ];
  const projection = projectCampaignEvents(events)!;
  assert.deepEqual(projection.progress, { attempted: 1, succeeded: 0, failed: 1 });
  assert.equal(projection.tasks["docs"], "failed");
  assert.throws(() => projectCampaignEvents([events[0]!, { ...events[1]!, revision: 3 }]));
});

test("le risque documentaire borné est auto-applicable", () => {
  const assessment = assessRisk([change("docs/guide.md", { churn: 20 })], { automaticThreshold: 20 }, 3);
  assert.equal(assessment.deterministicScore, 2);
  assert.equal(assessment.totalScore, 5);
  assert.equal(assessment.automaticEligible, true);
});

test("les interdictions globales ne sont jamais abaissées par le modèle ou le Project", () => {
  const assessment = assessRisk([
    change("docs/guide.md", { secretDetected: true }),
    change("src/link.ts", { symlink: true, outsideScope: true }),
  ], { automaticThreshold: 20, extraWeights: { documentation: 5 } }, 0);
  assert.deepEqual(assessment.hardDenials, ["outside_scope", "secret_detected", "symlink"]);
  assert.equal(assessment.automaticEligible, false);
  assert.throws(() => assessRisk([change("docs/guide.md")], { automaticThreshold: 21 }));
  assert.throws(() => assessRisk([change("docs/guide.md")], { automaticThreshold: 20, extraWeights: { documentation: -1 } }));
});

test("les trois politiques budgétaires admission, hard-stop et observe restent explicites", () => {
  const plan = createPlan();
  for (const [mode, expected] of [["admission", "block_new"], ["hard-stop", "stop"], ["observe", "warn"]] as const) {
    const authorization = RunAuthorization.create({ schemaVersion: 1, campaignPlanFingerprint: plan.fingerprint, actor: "Jeremy", profileByRole: { dev: "profile", qa: "profile", audit: "profile", integrator: "profile" }, profileFingerprintByRole: { dev: "1".repeat(64), qa: "2".repeat(64), audit: "3".repeat(64), integrator: "4".repeat(64) }, allowCommits: true, applyMode: "human", automaticRiskThreshold: 20, maxParallel: 3, budgetMode: mode, budgetLimits: [{ profileId: "profile", metric: "calls", maximum: 1 }], openBarProfiles: [], riskPolicyFingerprint: "e".repeat(64), confirmedAt: at }, plan);
    const budget = new CampaignBudget(authorization);
    assert.equal(budget.record("profile", { calls: 1, durationSeconds: 1, measurement: "measured" }).action, expected);
  }
});

function createPlan(): CampaignPlan {
  const value: CampaignPlanProps = {
    schemaVersion: 1,
    id: "campaign-plan-v23",
    projectId: "project",
    featureId: "feature",
    snapshot: {
      commit: "a".repeat(40),
      tree: "b".repeat(40),
      fingerprint: "c".repeat(64),
      clean: true,
      declaredUntracked: [],
    },
    tasks: [
      { id: "docs", agentId, role: "dev", requiredProfile: requirement(), priority: 20, dependencies: [], readScopes: ["docs"], writeScopes: ["docs"], deliverables: ["Guide"], validations: ["Markdown"] },
      { id: "tests", agentId, role: "qa", requiredProfile: requirement(), priority: 10, dependencies: [], readScopes: ["tests"], writeScopes: ["tests"], deliverables: ["Tests"], validations: ["Unit"] },
      { id: "audit", agentId, role: "audit", requiredProfile: requirement(), priority: 5, dependencies: ["docs", "tests"], readScopes: ["."], writeScopes: ["reports"], deliverables: ["Audit"], validations: ["Schema"] },
    ],
    integrationRole: "integrator",
    integrationAgentId: agentId,
    integrationRequiredProfile: requirement(),
    maximumParallelism: 3,
    fingerprint: "d".repeat(64),
    createdAt: at,
  };
  const { fingerprint: _fingerprint, ...unsigned } = value;
  return CampaignPlan.create({ ...unsigned, fingerprint: planFingerprint(unsigned) });
}

function requirement() { return { transports: ["codex-cli"] as const, capabilities: ["inspect_workspace"] as const }; }

function change(path: string, overrides: Partial<Parameters<typeof assessRisk>[0][number]> = {}): Parameters<typeof assessRisk>[0][number] {
  return {
    path,
    operation: "modify",
    churn: 0,
    binary: false,
    executableChanged: false,
    secretDetected: false,
    outsideScope: false,
    symlink: false,
    submodule: false,
    gitMetadata: false,
    proofPresent: true,
    declared: true,
    ...overrides,
  };
}

function event(revision: number, kind: CampaignEvent["kind"], taskId?: string): CampaignEvent {
  return { schemaVersion: 1, campaignId: "campaign-v23", revision, kind, ...(taskId === undefined ? {} : { taskId }), fingerprint: "f".repeat(64), at };
}
