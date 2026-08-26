/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { validateCampaignEvent } from "../../../domain/orchestration/orchestration-event.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsOrchestrationEventStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async load(projectId, campaignId) {
        validateId(projectId);
        validateId(campaignId);
        const index = await readJson(indexPath(this.homeDir, projectId, campaignId));
        if (index !== undefined && !isIndex(index, projectId, campaignId))
            throw new Error("Invalid orchestration event index.");
        const revisions = await eventRevisions(this.homeDir, projectId, campaignId);
        if (revisions.length === 0) {
            if (index !== undefined)
                throw new Error("Orchestration event index references a missing journal.");
            return [];
        }
        if (index !== undefined && index.revision > revisions.length)
            throw new Error("Orchestration event index is ahead of its immutable journal.");
        const events = [];
        for (let revision = 1; revision <= revisions.length; revision += 1) {
            if (revisions[revision - 1] !== revision)
                throw new Error("Orchestration event journal is not contiguous.");
            const value = await readJson(eventPath(this.homeDir, projectId, campaignId, revision));
            if (value === undefined)
                throw new Error(`Missing orchestration event revision ${String(revision)}.`);
            const event = deserialize(value);
            if (event.campaignId !== campaignId || event.revision !== revision)
                throw new Error("Orchestration event journal identity mismatch.");
            events.push(event);
        }
        return Object.freeze(events);
    }
    async append(projectId, event) {
        validateId(projectId);
        validateCampaignEvent(event);
        const indexFile = indexPath(this.homeDir, projectId, event.campaignId);
        await withFileLock(indexFile, async () => {
            const events = await this.load(projectId, event.campaignId);
            if (event.revision !== events.length + 1)
                throw new Error("Orchestration event revision is not contiguous.");
            await writeJsonAtomic(eventPath(this.homeDir, projectId, event.campaignId, event.revision), serialize(event), { mode: 0o600, exclusive: true });
            await writeJsonAtomic(indexFile, { schemaVersion: 1, projectId, campaignId: event.campaignId, revision: event.revision }, { mode: 0o600 });
        });
    }
}
async function eventRevisions(homeDir, projectId, campaignId) {
    let names;
    try {
        names = await readdir(join(basePath(homeDir, projectId, campaignId), "events"));
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return [];
        throw error;
    }
    return names.filter((name) => /^\d{6}\.json$/u.test(name)).map((name) => Number(name.slice(0, 6))).sort((left, right) => left - right);
}
function basePath(homeDir, projectId, campaignId) { return join(homeDir, ".arka-norn", "campaigns-v23", projectId, campaignId); }
function indexPath(homeDir, projectId, campaignId) { return join(basePath(homeDir, projectId, campaignId), "index.json"); }
function eventPath(homeDir, projectId, campaignId, revision) { return join(basePath(homeDir, projectId, campaignId), "events", `${String(revision).padStart(6, "0")}.json`); }
function serialize(value) { return { ...value, at: value.at.toISOString() }; }
function deserialize(value) { if (!isRecord(value) || typeof value["at"] !== "string")
    throw new Error("Invalid orchestration event."); const event = { ...value, at: new Date(value["at"]) }; validateCampaignEvent(event); return Object.freeze(event); }
function isIndex(value, projectId, campaignId) { return isRecord(value) && value["schemaVersion"] === 1 && value["projectId"] === projectId && value["campaignId"] === campaignId && typeof value["revision"] === "number" && Number.isInteger(value["revision"]) && value["revision"] >= 1; }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function validateId(value) { if (!/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value))
    throw new TypeError("Invalid orchestration event store identity."); }
function isNodeError(error, code) { return error instanceof Error && "code" in error && error.code === code; }
//# sourceMappingURL=fs-orchestration-event-store.js.map