/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { join } from "node:path";

import { createGovernanceEvent, type GovernanceEvent } from "../../../domain/governance/governance-event.js";
import { appendGovernanceEvent, emptyGovernanceLedger, type GovernanceLedger } from "../../../domain/governance/governance-ledger.js";
import type { Project } from "../../../domain/project/project.js";
import type { GovernanceStore } from "../../../ports/outbound/governance-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";

export class FsGovernanceStore implements GovernanceStore {
  public constructor(private readonly paths: PathPolicy = new FsPathPolicy()) {}

  public async load(project: Project): Promise<GovernanceLedger> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    return this.loadUnlocked(project);
  }

  public async append(project: Project, event: GovernanceEvent): Promise<GovernanceLedger> {
    await this.paths.assertMarkerRoot(project.root, project.root);
    const path = governancePath(project.root);
    return withFileLock(path, async () => {
      const next = appendGovernanceEvent(await this.loadUnlocked(project), event);
      await writeJsonAtomic(path, next, { mode: 0o600 });
      return next;
    });
  }

  private async loadUnlocked(project: Project): Promise<GovernanceLedger> {
    const path = governancePath(project.root);
    const value = await readJson<unknown>(path);
    if (value === undefined) return emptyGovernanceLedger(project.id.value);
    return parseLedger(value, project.id.value, path);
  }
}

export function governancePath(projectRoot: string): string {
  return join(projectRoot, ".arka-norn", "governance.json");
}

function parseLedger(value: unknown, projectId: string, path: string): GovernanceLedger {
  if (!isRecord(value) || value["schemaVersion"] !== 1 || value["projectId"] !== projectId
    || !Number.isInteger(value["revision"]) || !Array.isArray(value["events"])) {
    throw new Error(`Invalid governance ledger at ${path}.`);
  }
  const events = value["events"].map((event) => {
    if (!isRecord(event)) throw new Error(`Invalid governance event at ${path}.`);
    return createGovernanceEvent(event as unknown as GovernanceEvent);
  });
  if (value["revision"] !== events.length || new Set(events.map((event) => event.id)).size !== events.length) {
    throw new Error(`Invalid governance revision at ${path}.`);
  }
  return Object.freeze({ schemaVersion: 1, projectId, revision: events.length, events: Object.freeze(events) });
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
