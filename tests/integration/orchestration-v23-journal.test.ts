/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { FsOrchestrationCampaignV23Store } from "../../src/adapters/outbound/filesystem/fs-orchestration-campaign-v23-store.ts";
import { FsOrchestrationEventStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-event-store.ts";
import type { CampaignEvent } from "../../src/domain/orchestration/orchestration-event.ts";
import { TaskAttempt } from "../../src/domain/orchestration/orchestration-plan.ts";
import type { CampaignResultArtifact } from "../../src/ports/outbound/orchestration-campaign-v23-store.ts";

const projectId = "project";
const campaignId = "campaign-journal";
const at = new Date("2026-08-26T00:00:00.000Z");

test("les journaux reconstruisent les révisions écrites avant un crash d'index", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-v23-journal-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const events = new FsOrchestrationEventStore(home);
  await events.append(projectId, event(1, "campaign_planned"));
  const eventRoot = join(home, ".arka-norn", "campaigns-v23", projectId, campaignId, "events");
  writeJson(join(eventRoot, "000002.json"), storedEvent(event(2, "campaign_authorized")));
  assert.deepEqual((await events.load(projectId, campaignId)).map((entry) => entry.revision), [1, 2]);
  await events.append(projectId, event(3, "campaign_blocked"));
  assert.equal((await events.load(projectId, campaignId)).length, 3);

  const campaigns = new FsOrchestrationCampaignV23Store(home);
  const prepared = attempt("prepared");
  await campaigns.appendAttempt(projectId, campaignId, prepared);
  const attemptRoot = join(home, ".arka-norn", "campaigns-v23", projectId, campaignId, "attempts", "docs");
  writeJson(join(attemptRoot, "000002.json"), storedAttempt(attempt("running")));
  assert.deepEqual((await campaigns.loadAttempts(projectId, campaignId)).map((entry) => entry.status), ["prepared", "running"]);
  await campaigns.appendAttempt(projectId, campaignId, attempt("failed"));
  assert.deepEqual((await campaigns.loadAttempts(projectId, campaignId)).map((entry) => entry.status), ["prepared", "running", "failed"]);
});

test("un résultat de campagne altéré est refusé par son empreinte", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-v23-result-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new FsOrchestrationCampaignV23Store(home);
  const unsigned = {
    schemaVersion: 1 as const,
    integration: { campaignId, branch: "norn/campaign/integration", path: "/private/worktree", status: "integrated" as const, commit: "a".repeat(40), conflictPaths: [] },
    commits: [{ taskId: "docs", branch: "norn/campaign/docs", commit: "b".repeat(40), changedPaths: ["docs/guide.md"], evidenceFingerprint: "c".repeat(64) }],
    risk: { deterministicScore: 1, modelAddition: 0, totalScore: 1, hardDenials: [], factors: [{ path: "docs/guide.md", reason: "documentation", score: 1 }], automaticEligible: true },
    recordedAt: at,
  };
  const result: CampaignResultArtifact = { ...unsigned, fingerprint: fingerprint(unsigned) };
  await store.saveResult(projectId, campaignId, result);
  const path = join(home, ".arka-norn", "campaigns-v23", projectId, campaignId, "result.json");
  const tampered = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
  tampered["risk"] = { ...(tampered["risk"] as Record<string, unknown>), totalScore: 0 };
  writeJson(path, tampered);
  await assert.rejects(store.loadResult(projectId, campaignId), /fingerprint does not match/u);
});

function event(revision: number, kind: CampaignEvent["kind"]): CampaignEvent {
  return { schemaVersion: 1, campaignId, revision, kind, fingerprint: String(revision).repeat(64).slice(0, 64), at };
}

function storedEvent(value: CampaignEvent): unknown { return { ...value, at: value.at.toISOString() }; }

function attempt(status: "prepared" | "running" | "failed"): TaskAttempt {
  return TaskAttempt.create({
    schemaVersion: 1,
    id: "execution-docs-1",
    taskId: "docs",
    profileId: "profile",
    status,
    worktree: "/private/worktree",
    branch: "norn/campaign/docs",
    proofReferences: [],
    ...(status === "prepared" ? {} : { startedAt: at }),
    ...(status === "failed" ? { failureCode: "worker_crashed", endedAt: at } : {}),
  });
}

function storedAttempt(value: TaskAttempt): unknown {
  const props = value.props;
  return { ...props, ...(props.startedAt === undefined ? {} : { startedAt: props.startedAt.toISOString() }), ...(props.endedAt === undefined ? {} : { endedAt: props.endedAt.toISOString() }) };
}

function fingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value, (_key, entry: unknown) => entry instanceof Date ? entry.toISOString() : entry)).digest("hex"); }
function writeJson(path: string, value: unknown): void { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
