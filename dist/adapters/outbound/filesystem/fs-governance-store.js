/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { join } from "node:path";
import { createGovernanceEvent } from "../../../domain/governance/governance-event.js";
import { appendGovernanceEvent, emptyGovernanceLedger } from "../../../domain/governance/governance-ledger.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsGovernanceStore {
    paths;
    constructor(paths = new FsPathPolicy()) {
        this.paths = paths;
    }
    async load(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        return this.loadUnlocked(project);
    }
    async append(project, event) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        const path = governancePath(project.root);
        return withFileLock(path, async () => {
            const next = appendGovernanceEvent(await this.loadUnlocked(project), event);
            await writeJsonAtomic(path, next, { mode: 0o600 });
            return next;
        });
    }
    async loadUnlocked(project) {
        const path = governancePath(project.root);
        const value = await readJson(path);
        if (value === undefined)
            return emptyGovernanceLedger(project.id.value);
        return parseLedger(value, project.id.value, path);
    }
}
export function governancePath(projectRoot) {
    return join(projectRoot, ".arka-norn", "governance.json");
}
function parseLedger(value, projectId, path) {
    if (!isRecord(value) || value["schemaVersion"] !== 1 || value["projectId"] !== projectId
        || !Number.isInteger(value["revision"]) || !Array.isArray(value["events"])) {
        throw new Error(`Invalid governance ledger at ${path}.`);
    }
    const events = value["events"].map((event) => {
        if (!isRecord(event))
            throw new Error(`Invalid governance event at ${path}.`);
        return createGovernanceEvent(event);
    });
    if (value["revision"] !== events.length || new Set(events.map((event) => event.id)).size !== events.length) {
        throw new Error(`Invalid governance revision at ${path}.`);
    }
    return Object.freeze({ schemaVersion: 1, projectId, revision: events.length, events: Object.freeze(events) });
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=fs-governance-store.js.map