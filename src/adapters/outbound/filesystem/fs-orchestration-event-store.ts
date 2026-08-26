/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { validateCampaignEvent, type CampaignEvent } from "../../../domain/orchestration/orchestration-event.js";
import type { OrchestrationEventStore } from "../../../ports/outbound/orchestration-event-store.js";

import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

interface StoredEvent extends Omit<CampaignEvent, "at"> { readonly at: string }
interface EventIndex { readonly schemaVersion: 1; readonly projectId: string; readonly campaignId: string; readonly revision: number }

export class FsOrchestrationEventStore implements OrchestrationEventStore {
  public constructor(private readonly homeDir: string) {}

  public async load(projectId: string, campaignId: string): Promise<readonly CampaignEvent[]> {
    validateId(projectId);
    validateId(campaignId);
    const index = await readJson<unknown>(indexPath(this.homeDir, projectId, campaignId));
    if (index !== undefined && !isIndex(index, projectId, campaignId)) throw new Error("Invalid orchestration event index.");
    const revisions = await eventRevisions(this.homeDir, projectId, campaignId);
    if (revisions.length === 0) {
      if (index !== undefined) throw new Error("Orchestration event index references a missing journal.");
      return [];
    }
    if (index !== undefined && index.revision > revisions.length) throw new Error("Orchestration event index is ahead of its immutable journal.");
    const events: CampaignEvent[] = [];
    for (let revision = 1; revision <= revisions.length; revision += 1) {
      if (revisions[revision - 1] !== revision) throw new Error("Orchestration event journal is not contiguous.");
      const value = await readJson<unknown>(eventPath(this.homeDir, projectId, campaignId, revision));
      if (value === undefined) throw new Error(`Missing orchestration event revision ${String(revision)}.`);
      const event = deserialize(value);
      if (event.campaignId !== campaignId || event.revision !== revision) throw new Error("Orchestration event journal identity mismatch.");
      events.push(event);
    }
    return Object.freeze(events);
  }

  public async append(projectId: string, event: CampaignEvent): Promise<void> {
    validateId(projectId);
    validateCampaignEvent(event);
    const indexFile = indexPath(this.homeDir, projectId, event.campaignId);
    await withFileLock(indexFile, async () => {
      const events = await this.load(projectId, event.campaignId);
      if (event.revision !== events.length + 1) throw new Error("Orchestration event revision is not contiguous.");
      await writeJsonAtomic(eventPath(this.homeDir, projectId, event.campaignId, event.revision), serialize(event), { mode: 0o600, exclusive: true });
      await writeJsonAtomic(indexFile, { schemaVersion: 1, projectId, campaignId: event.campaignId, revision: event.revision } satisfies EventIndex, { mode: 0o600 });
    });
  }
}

async function eventRevisions(homeDir: string, projectId: string, campaignId: string): Promise<number[]> {
  let names: string[];
  try { names = await readdir(join(basePath(homeDir, projectId, campaignId), "events")); } catch (error) { if (isNodeError(error, "ENOENT")) return []; throw error; }
  return names.filter((name) => /^\d{6}\.json$/u.test(name)).map((name) => Number(name.slice(0, 6))).sort((left, right) => left - right);
}

function basePath(homeDir: string, projectId: string, campaignId: string): string { return join(homeDir, ".arka-norn", "campaigns-v23", projectId, campaignId); }
function indexPath(homeDir: string, projectId: string, campaignId: string): string { return join(basePath(homeDir, projectId, campaignId), "index.json"); }
function eventPath(homeDir: string, projectId: string, campaignId: string, revision: number): string { return join(basePath(homeDir, projectId, campaignId), "events", `${String(revision).padStart(6, "0")}.json`); }
function serialize(value: CampaignEvent): StoredEvent { return { ...value, at: value.at.toISOString() }; }
function deserialize(value: unknown): CampaignEvent { if (!isRecord(value) || typeof value["at"] !== "string") throw new Error("Invalid orchestration event."); const event = { ...value, at: new Date(value["at"]) } as unknown as CampaignEvent; validateCampaignEvent(event); return Object.freeze(event); }
function isIndex(value: unknown, projectId: string, campaignId: string): value is EventIndex { return isRecord(value) && value["schemaVersion"] === 1 && value["projectId"] === projectId && value["campaignId"] === campaignId && typeof value["revision"] === "number" && Number.isInteger(value["revision"]) && value["revision"] >= 1; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function validateId(value: string): void { if (!/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value)) throw new TypeError("Invalid orchestration event store identity."); }
function isNodeError(error: unknown, code: string): boolean { return error instanceof Error && "code" in error && error.code === code; }
