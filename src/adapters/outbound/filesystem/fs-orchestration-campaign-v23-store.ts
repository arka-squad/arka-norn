/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { CampaignPlan, RunAuthorization, TaskAttempt, type CampaignPlanProps, type RunAuthorizationProps, type TaskAttemptProps } from "../../../domain/orchestration/orchestration-plan.js";
import type { CampaignApplicationArtifact, CampaignResultArtifact, OrchestrationCampaignV23Store } from "../../../ports/outbound/orchestration-campaign-v23-store.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

interface StoredPlan extends Omit<CampaignPlanProps, "createdAt"> { readonly createdAt: string }
interface StoredAuthorization extends Omit<RunAuthorizationProps, "confirmedAt"> { readonly confirmedAt: string }
interface StoredAttempt extends Omit<TaskAttemptProps, "startedAt" | "endedAt"> { readonly startedAt?: string; readonly endedAt?: string }
interface StoredResult extends Omit<CampaignResultArtifact, "recordedAt"> { readonly recordedAt: string }
interface StoredApplication extends Omit<CampaignApplicationArtifact, "recordedAt"> { readonly recordedAt: string }

export class FsOrchestrationCampaignV23Store implements OrchestrationCampaignV23Store {
  public constructor(private readonly homeDir: string) {}

  public async listCampaignIds(projectId: string): Promise<readonly string[]> {
    validateId(projectId);
    try { return Object.freeze((await readdir(join(this.homeDir, ".arka-norn", "campaigns-v23", projectId))).filter(safeId).sort()); } catch { return []; }
  }

  public async savePlan(plan: CampaignPlan): Promise<void> {
    const props = plan.props;
    await writeJsonAtomic(join(base(this.homeDir, props.projectId, props.id), "plan.json"), { ...props, createdAt: props.createdAt.toISOString() } satisfies StoredPlan, { mode: 0o600, exclusive: true });
  }

  public async loadPlan(projectId: string, campaignId: string): Promise<CampaignPlan | undefined> {
    const value = await readJson<unknown>(join(base(this.homeDir, projectId, campaignId), "plan.json"));
    return value === undefined ? undefined : deserializePlan(value);
  }

  public async findPlanByFingerprint(projectId: string, fingerprint: string): Promise<CampaignPlan | undefined> {
    validateId(projectId);
    validateFingerprint(fingerprint);
    let campaigns: string[];
    try { campaigns = await readdir(join(this.homeDir, ".arka-norn", "campaigns-v23", projectId)); } catch { return undefined; }
    for (const campaignId of campaigns.sort().reverse()) {
      if (!safeId(campaignId)) continue;
      const plan = await this.loadPlan(projectId, campaignId);
      if (plan?.fingerprint === fingerprint) return plan;
    }
    return undefined;
  }

  public async saveAuthorization(projectId: string, campaignId: string, authorization: RunAuthorization): Promise<void> {
    const props = authorization.props;
    await writeJsonAtomic(join(base(this.homeDir, projectId, campaignId), "authorization.json"), { ...props, confirmedAt: props.confirmedAt.toISOString() } satisfies StoredAuthorization, { mode: 0o600, exclusive: true });
  }

  public async loadAuthorization(projectId: string, campaignId: string, plan: CampaignPlan): Promise<RunAuthorization | undefined> {
    const value = await readJson<unknown>(join(base(this.homeDir, projectId, campaignId), "authorization.json"));
    if (value === undefined) return undefined;
    if (!isRecord(value) || typeof value["confirmedAt"] !== "string") throw new Error("Invalid campaign authorization.");
    return RunAuthorization.create({ ...value, confirmedAt: new Date(value["confirmedAt"]) } as unknown as RunAuthorizationProps, plan);
  }

  public async appendAttempt(projectId: string, campaignId: string, attempt: TaskAttempt): Promise<void> {
    const props = attempt.props;
    const directory = join(base(this.homeDir, projectId, campaignId), "attempts", props.taskId);
    await withFileLock(join(directory, "index.json"), async () => {
      const revisions = await attemptRevisions(directory);
      const revision = revisions.length + 1;
      const previous = revision === 1 ? undefined : deserializeAttempt(await readJson<unknown>(join(directory, revisionFile(revision - 1))));
      assertAttemptTransition(previous, attempt);
      const { startedAt, endedAt, ...plain } = props;
      const stored: StoredAttempt = { ...plain, ...(startedAt === undefined ? {} : { startedAt: startedAt.toISOString() }), ...(endedAt === undefined ? {} : { endedAt: endedAt.toISOString() }) };
      await writeJsonAtomic(join(directory, `${String(revision).padStart(6, "0")}.json`), stored, { mode: 0o600, exclusive: true });
      await writeJsonAtomic(join(directory, "index.json"), { schemaVersion: 1, revision }, { mode: 0o600 });
    });
  }

  public async loadAttempts(projectId: string, campaignId: string): Promise<readonly TaskAttempt[]> {
    const root = join(base(this.homeDir, projectId, campaignId), "attempts");
    let taskIds: string[];
    try { taskIds = await readdir(root); } catch { return []; }
    const attempts: TaskAttempt[] = [];
    for (const taskId of taskIds.sort()) {
      if (!safeId(taskId)) continue;
      const directory = join(root, taskId);
      const revisions = await attemptRevisions(directory);
      const index = await readJson<unknown>(join(directory, "index.json"));
      if (index !== undefined && (!isRecord(index) || !Number.isInteger(index["revision"]) || Number(index["revision"]) > revisions.length)) throw new Error("Invalid task attempt index.");
      for (const revision of revisions) {
        const value = await readJson<unknown>(join(directory, revisionFile(revision)));
        attempts.push(deserializeAttempt(value));
      }
    }
    return Object.freeze(attempts);
  }

  public async saveResult(projectId: string, campaignId: string, result: CampaignResultArtifact): Promise<void> {
    const { fingerprint, ...unsigned } = result;
    if (fingerprint !== artifactFingerprint(unsigned)) throw new Error("Campaign result fingerprint does not match its immutable content.");
    const value: StoredResult = { ...result, recordedAt: result.recordedAt.toISOString() };
    await writeJsonAtomic(join(base(this.homeDir, projectId, campaignId), "result.json"), value, { mode: 0o600, exclusive: true });
  }

  public async loadResult(projectId: string, campaignId: string): Promise<CampaignResultArtifact | undefined> {
    const value = await readJson<unknown>(join(base(this.homeDir, projectId, campaignId), "result.json"));
    if (!isStoredResult(value)) return value === undefined ? undefined : Promise.reject(new Error("Invalid campaign result."));
    const result = { ...value, recordedAt: new Date(value.recordedAt) };
    const { fingerprint, ...unsigned } = result;
    if (fingerprint !== artifactFingerprint(unsigned)) throw new Error("Campaign result fingerprint does not match its immutable content.");
    return Object.freeze(result);
  }

  public async saveApplication(projectId: string, campaignId: string, application: CampaignApplicationArtifact): Promise<void> {
    const { fingerprint, ...unsigned } = application;
    if (fingerprint !== artifactFingerprint(unsigned)) throw new Error("Campaign application fingerprint does not match its immutable content.");
    const value: StoredApplication = { ...application, recordedAt: application.recordedAt.toISOString() };
    await writeJsonAtomic(join(base(this.homeDir, projectId, campaignId), "application.json"), value, { mode: 0o600, exclusive: true });
  }

  public async loadApplication(projectId: string, campaignId: string): Promise<CampaignApplicationArtifact | undefined> {
    const value = await readJson<unknown>(join(base(this.homeDir, projectId, campaignId), "application.json"));
    if (!isStoredApplication(value)) return value === undefined ? undefined : Promise.reject(new Error("Invalid campaign application artifact."));
    const application = { ...value, recordedAt: new Date(value.recordedAt) };
    const { fingerprint, ...unsigned } = application;
    if (fingerprint !== artifactFingerprint(unsigned)) throw new Error("Campaign application fingerprint does not match its immutable content.");
    return Object.freeze(application);
  }
}

function base(home: string, projectId: string, campaignId: string): string { validateId(projectId); validateId(campaignId); return join(home, ".arka-norn", "campaigns-v23", projectId, campaignId); }
function deserializePlan(value: unknown): CampaignPlan { if (!isRecord(value) || typeof value["createdAt"] !== "string") throw new Error("Invalid campaign plan."); const props = { ...value, createdAt: new Date(value["createdAt"]) } as unknown as CampaignPlanProps; const { fingerprint, ...unsigned } = props; if (fingerprint !== planFingerprint(unsigned)) throw new Error("Campaign plan fingerprint does not match its immutable content."); return CampaignPlan.create(props); }
function deserializeAttempt(value: unknown): TaskAttempt { if (!isRecord(value)) throw new Error("Invalid task attempt."); return TaskAttempt.create({ ...value, ...(typeof value["startedAt"] === "string" ? { startedAt: new Date(value["startedAt"]) } : {}), ...(typeof value["endedAt"] === "string" ? { endedAt: new Date(value["endedAt"]) } : {}) } as unknown as TaskAttemptProps); }
async function attemptRevisions(directory: string): Promise<number[]> { let names: string[]; try { names = await readdir(directory); } catch (error) { if (isNodeError(error, "ENOENT")) return []; throw error; } const revisions = names.filter((name) => /^\d{6}\.json$/u.test(name)).map((name) => Number(name.slice(0, 6))).sort((left, right) => left - right); for (let index = 0; index < revisions.length; index += 1) if (revisions[index] !== index + 1) throw new Error("Task attempt journal is not contiguous."); return revisions; }
function revisionFile(revision: number): string { return `${String(revision).padStart(6, "0")}.json`; }
function assertAttemptTransition(previous: TaskAttempt | undefined, next: TaskAttempt): void { const current = previous?.props; const candidate = next.props; if (current === undefined) { if (candidate.status !== "prepared") throw new Error("A task attempt journal must begin with prepared."); return; } const terminal = ["succeeded", "failed", "blocked", "budget_stopped", "cancelled"].includes(current.status); if (terminal && candidate.status === "prepared" && candidate.id !== current.id) return; if (candidate.id !== current.id || candidate.taskId !== current.taskId || candidate.profileId !== current.profileId || candidate.worktree !== current.worktree || candidate.branch !== current.branch) throw new Error("Task attempt identity changed within a revision chain."); const allowed = current.status === "prepared" ? ["running", "failed", "blocked", "cancelled"] : current.status === "running" ? ["succeeded", "failed", "blocked", "budget_stopped", "cancelled"] : []; if (!allowed.includes(candidate.status)) throw new Error(`Invalid task attempt transition ${current.status} -> ${candidate.status}.`); }
function isStoredResult(value: unknown): value is StoredResult { return isRecord(value) && value["schemaVersion"] === 1 && typeof value["fingerprint"] === "string" && /^[a-f0-9]{64}$/u.test(value["fingerprint"]) && isRecord(value["integration"]) && Array.isArray(value["commits"]) && isRecord(value["risk"]) && typeof value["recordedAt"] === "string"; }
function isStoredApplication(value: unknown): value is StoredApplication { return isRecord(value) && value["schemaVersion"] === 1 && typeof value["candidateFingerprint"] === "string" && /^[a-f0-9]{64}$/u.test(value["candidateFingerprint"]) && typeof value["appliedCommit"] === "string" && /^[a-f0-9]{40,64}$/u.test(value["appliedCommit"]) && typeof value["fingerprint"] === "string" && /^[a-f0-9]{64}$/u.test(value["fingerprint"]) && typeof value["recordedAt"] === "string"; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function safeId(value: string): boolean { return /^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value); }
function validateId(value: string): void { if (!safeId(value)) throw new TypeError("Invalid campaign store identity."); }
function validateFingerprint(value: string): void { if (!/^[a-f0-9]{64}$/u.test(value)) throw new TypeError("Invalid campaign plan fingerprint."); }
function planFingerprint(value: Omit<CampaignPlanProps, "fingerprint">): string { const canonical = { ...value, createdAt: value.createdAt.toISOString(), tasks: value.tasks.map((task) => ({ ...task, dependencies: [...task.dependencies].sort(), readScopes: [...task.readScopes].sort(), writeScopes: [...task.writeScopes].sort(), deliverables: [...task.deliverables], validations: [...task.validations] })), snapshot: { ...value.snapshot, declaredUntracked: [...value.snapshot.declaredUntracked].sort() } }; return createHash("sha256").update(JSON.stringify(canonical)).digest("hex"); }
function artifactFingerprint(value: unknown): string { return createHash("sha256").update(JSON.stringify(value, (_key, entry: unknown) => entry instanceof Date ? entry.toISOString() : entry)).digest("hex"); }
function isNodeError(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
