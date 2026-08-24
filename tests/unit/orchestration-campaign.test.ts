/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { OrchestrationCampaign } from "../../src/domain/orchestration/orchestration-campaign.ts";
import { userExecutionTarget } from "../../src/domain/orchestration/types.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

const at = new Date("2026-08-24T08:00:00.000Z");
const fingerprint = "a".repeat(64);

test("une campagne sépare décision métier, reprise et budget", () => {
  const planned = OrchestrationCampaign.planned({
    id: "campaign-20260824-safe",
    projectId: ProjectId.of("project"),
    featureId: FeatureId.of("feature"),
    target: userExecutionTarget("claude", "claude-test"),
    workspaceMode: "isolated",
    scopePaths: ["."],
    previewFingerprint: fingerprint,
    frameworkVersion: "test",
    maxMissions: 2,
    retryCount: 0,
    currentStepId: "concept",
  }, at);
  const running = planned.start("execution-one", at);
  const waiting = running.requireAction("business_decision", "Choose the next outcome.", fingerprint, at, "awaiting_decision", "plan");

  assert.throws(() => waiting.resume(waiting.revision, at), /cannot resume/);
  assert.throws(() => waiting.decide({ expectedRevision: waiting.revision, fingerprint: "b".repeat(64), actor: "human:test", choice: "continue" }, at), /changed/);
  const decided = waiting.decide({ expectedRevision: waiting.revision, fingerprint, actor: "human:test", choice: "continue", reason: "Validated scope" }, at);
  assert.equal(decided.status, "running");
  assert.equal(decided.currentStepId, "plan");
  assert.equal(decided.decisions.length, 1);
  assert.equal(decided.decisions[0]?.actor, "human:test");

  const finalMission = decided.appendMission("execution-two", "plan", at);
  const blocked = finalMission.appendMission("execution-three", "audit", at);
  assert.equal(blocked.status, "blocked");
  assert.equal(blocked.actionRequired?.kind, "inspect");
  assert.deepEqual(blocked.missionIds, ["execution-one", "execution-two"]);
});

test("une action humaine périmée est refusée par révision", () => {
  const campaign = OrchestrationCampaign.planned({
    id: "campaign-20260824-revision",
    projectId: ProjectId.of("project"),
    featureId: FeatureId.of("feature"),
    target: userExecutionTarget("codex", "codex-test"),
    workspaceMode: "direct",
    scopePaths: ["src"],
    previewFingerprint: fingerprint,
    frameworkVersion: "test",
    maxMissions: 1,
    retryCount: 0,
    currentStepId: "development_report",
  }, at).start("execution-one", at);
  assert.throws(() => campaign.assertRevision(campaign.revision - 1), /current revision/);
});

test("une campagne ne peut consommer qu'une seule relance confirmée", () => {
  const blocked = OrchestrationCampaign.planned({
    id: "campaign-20260824-retry",
    projectId: ProjectId.of("project"),
    featureId: FeatureId.of("feature"),
    target: userExecutionTarget("claude", "claude-test"),
    workspaceMode: "isolated",
    scopePaths: ["."],
    previewFingerprint: fingerprint,
    frameworkVersion: "test",
    maxMissions: 3,
    retryCount: 0,
    currentStepId: "development_report",
  }, at).start("execution-one", at).requireAction("retry", "Provider interrupted.", fingerprint, at, "blocked");

  assert.throws(() => blocked.retry({ expectedRevision: blocked.revision, fingerprint: "b".repeat(64) }, at), /changed/);
  const retried = blocked.retry({ expectedRevision: blocked.revision, fingerprint }, at);
  assert.equal(retried.status, "running");
  assert.equal(retried.retryCount, 1);
  const blockedAgain = retried.requireAction("retry", "Provider interrupted again.", fingerprint, at, "blocked");
  assert.throws(() => blockedAgain.retry({ expectedRevision: blockedAgain.revision, fingerprint }, at), /single retry/);
});
