/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

import {
  assertPlan, framingPlanFingerprint, type FramingPlan,
} from "../../../domain/framing/framing-plan.js";
import type {
  FramingEvent, FramingPlanReference, FramingStore, PublishedFramingPlan,
} from "../../../ports/outbound/framing-store.js";

import { readJson, readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";

interface CurrentPointer {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly revision: number;
  readonly fingerprint: string;
  readonly revisionFile: string;
  readonly eventSequence: number;
}

interface PublishedIndexEntry {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly projectId: string;
  readonly targetKind: "project" | "feature";
  readonly featureId: string | null;
  readonly revision: number;
  readonly fingerprint: string;
  readonly relativePath: string;
  readonly publishedAt: string;
}

interface PublishedIndex {
  readonly schemaVersion: 1;
  readonly latestByTarget: Readonly<Record<string, PublishedIndexEntry>>;
}

export class FsFramingStore implements FramingStore {
  public constructor(private readonly homeDir: string) {}

  public async create(plan: FramingPlan): Promise<FramingPlan> {
    assertPlan(plan);
    if (plan.revision !== 1 || plan.previousRevision !== null) throw new Error("A framing journal must start at revision 1.");
    const directory = planDirectory(this.homeDir, plan.target.projectId, plan.target.framingId);
    return withFileLock(join(directory, "current.json"), async () => {
      const existing = await loadLatest(directory);
      if (existing !== undefined) {
        if (existing.id === plan.id && framingPlanFingerprint(existing) === framingPlanFingerprint(plan)) return existing;
        throw new Error(`Framing journal already exists: ${plan.target.framingId}.`);
      }
      await persistRevision(directory, plan);
      const event = createEvent(plan, 1, "created", {});
      await persistEvent(directory, event);
      await persistPointer(directory, plan, event.sequence);
      return plan;
    });
  }

  public async load(projectId: string, framingId: string): Promise<FramingPlan | undefined> {
    return loadLatest(planDirectory(this.homeDir, projectId, framingId));
  }

  public async loadRevision(projectId: string, framingId: string, revision: number): Promise<FramingPlan | undefined> {
    if (!Number.isInteger(revision) || revision < 1) throw new Error("Invalid framing revision.");
    return loadExact(planDirectory(this.homeDir, projectId, framingId), revision);
  }

  public async save(input: {
    readonly projectId: string;
    readonly framingId: string;
    readonly expectedRevision: number;
    readonly plan: FramingPlan;
    readonly eventKind: FramingEvent["kind"];
    readonly metadata?: FramingEvent["metadata"];
  }): Promise<FramingPlan> {
    assertPlan(input.plan);
    const directory = planDirectory(this.homeDir, input.projectId, input.framingId);
    return withFileLock(join(directory, "current.json"), async () => {
      const current = await loadLatest(directory);
      if (current === undefined) throw new Error(`Framing journal not found: ${input.framingId}.`);
      if (current.revision !== input.expectedRevision) throw new Error(`Framing revision conflict: expected ${current.revision}, received ${input.expectedRevision}.`);
      assertSuccessor(current, input.plan);
      await persistRevision(directory, input.plan);
      const sequence = await nextEventSequence(directory);
      const event = createEvent(input.plan, sequence, input.eventKind, input.metadata ?? {});
      await persistEvent(directory, event);
      await persistPointer(directory, input.plan, event.sequence);
      return input.plan;
    });
  }

  public async list(projectId: string): Promise<readonly FramingPlanReference[]> {
    validateIdentifier(projectId, "project id");
    const root = join(this.homeDir, ".arka-norn", "framing", projectId);
    let names: string[];
    try {
      names = await fs.readdir(root);
    } catch (error) {
      if (isNodeError(error, "ENOENT")) return [];
      throw error;
    }
    const references: FramingPlanReference[] = [];
    for (const framingId of names.filter(isSafeIdentifier).sort()) {
      const plan = await loadLatest(join(root, framingId));
      if (plan === undefined) continue;
      references.push(toReference(plan));
    }
    return references.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  public async publish(input: {
    readonly projectRoot: string;
    readonly plan: FramingPlan;
  }): Promise<PublishedFramingPlan> {
    assertPlan(input.plan);
    if (input.plan.stabilizations.groundedPlan === null) throw new Error("Only a grounded stabilized framing plan can be published.");
    const projectRoot = await canonicalProjectRoot(input.projectRoot);
    const plansRoot = join(projectRoot, ".arka-norn", "plans");
    await ensureSafePublicationRoot(projectRoot, plansRoot);
    const fingerprint = framingPlanFingerprint(input.plan);
    const relativePath = normalizePath(join(".arka-norn", "plans", input.plan.id, revisionFileName(input.plan, fingerprint)));
    const absolutePath = join(projectRoot, relativePath);
    await writeJsonAtomic(absolutePath, input.plan, { mode: 0o644, exclusive: true }).catch(async (error: unknown) => {
      if (!isNodeError(error, "EEXIST")) throw error;
      const existing = await readJson<FramingPlan>(absolutePath);
      if (existing === undefined || framingPlanFingerprint(existing) !== fingerprint) throw new Error("Published framing path already contains different content.");
    });
    await withFileLock(join(plansRoot, "index.json"), async () => {
      const index = await rebuildPublishedIndex(plansRoot);
      const entry = publishedEntry(input.plan, relativePath, fingerprint);
      const key = targetKey(input.plan);
      await writeJsonAtomic(join(plansRoot, "index.json"), {
        schemaVersion: 1,
        latestByTarget: { ...index.latestByTarget, [key]: entry },
      } satisfies PublishedIndex, { mode: 0o644 });
    });
    return { plan: input.plan, absolutePath, relativePath, fingerprint };
  }
}

async function persistRevision(directory: string, plan: FramingPlan): Promise<void> {
  const fingerprint = contentFingerprint(plan);
  await writeJsonAtomic(join(directory, "revisions", revisionFileName(plan, fingerprint)), plan, { mode: 0o600, exclusive: true });
}

async function persistEvent(directory: string, event: FramingEvent): Promise<void> {
  const fingerprint = contentFingerprint(event);
  const name = `${String(event.sequence).padStart(8, "0")}-${fingerprint}.json`;
  await writeJsonAtomic(join(directory, "events", name), event, { mode: 0o600, exclusive: true });
}

async function persistPointer(directory: string, plan: FramingPlan, eventSequence: number): Promise<void> {
  const fingerprint = contentFingerprint(plan);
  await writeJsonAtomic(join(directory, "current.json"), {
    schemaVersion: 1,
    planId: plan.id,
    revision: plan.revision,
    fingerprint,
    revisionFile: revisionFileName(plan, fingerprint),
    eventSequence,
  } satisfies CurrentPointer, { mode: 0o600 });
}

async function loadLatest(directory: string): Promise<FramingPlan | undefined> {
  const revisionDirectory = join(directory, "revisions");
  let names: string[];
  try {
    names = await fs.readdir(revisionDirectory);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  }
  const candidates = names.map(parseRevisionName).filter((item): item is ParsedRevision => item !== undefined)
    .sort((left, right) => right.revision - left.revision);
  for (const candidate of candidates) {
    const path = join(revisionDirectory, candidate.fileName);
    const raw = await readRaw(path);
    if (raw === undefined || rawFingerprint(raw) !== candidate.fingerprint) continue;
    const plan = JSON.parse(raw) as FramingPlan;
    assertPlan(plan);
    if (plan.revision !== candidate.revision) throw new Error(`Framing revision filename mismatch: ${candidate.fileName}.`);
    return plan;
  }
  if (names.length > 0) throw new Error(`No valid framing revision can be reconstructed in ${directory}.`);
  return undefined;
}

async function loadExact(directory: string, revision: number): Promise<FramingPlan | undefined> {
  let names: string[];
  try {
    names = await fs.readdir(join(directory, "revisions"));
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  }
  const candidate = names.map(parseRevisionName).find((item) => item?.revision === revision);
  if (candidate === undefined) return undefined;
  const raw = await readRaw(join(directory, "revisions", candidate.fileName));
  if (raw === undefined || rawFingerprint(raw) !== candidate.fingerprint) throw new Error(`Invalid framing revision ${revision}.`);
  const plan = JSON.parse(raw) as FramingPlan;
  assertPlan(plan);
  return plan;
}

interface ParsedRevision {
  readonly revision: number;
  readonly fingerprint: string;
  readonly fileName: string;
}

function parseRevisionName(fileName: string): ParsedRevision | undefined {
  const match = /^(\d{8})-([a-f0-9]{64})\.json$/u.exec(fileName);
  if (match === null) return undefined;
  return { revision: Number(match[1]), fingerprint: match[2]!, fileName };
}

async function nextEventSequence(directory: string): Promise<number> {
  try {
    const names = await fs.readdir(join(directory, "events"));
    const sequences = names.map((name) => /^(\d{8})-[a-f0-9]{64}\.json$/u.exec(name)?.[1])
      .filter((value): value is string => value !== undefined).map(Number);
    return (sequences.length === 0 ? 0 : Math.max(...sequences)) + 1;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return 1;
    throw error;
  }
}

function createEvent(
  plan: FramingPlan,
  sequence: number,
  kind: FramingEvent["kind"],
  metadata: FramingEvent["metadata"],
): FramingEvent {
  return {
    schemaVersion: 1,
    sequence,
    planId: plan.id,
    revision: plan.revision,
    kind,
    fingerprint: framingPlanFingerprint(plan),
    occurredAt: plan.updatedAt,
    metadata,
  };
}

function assertSuccessor(current: FramingPlan, next: FramingPlan): void {
  if (next.id !== current.id || next.target.projectId !== current.target.projectId || next.target.framingId !== current.target.framingId) {
    throw new Error("Framing plan identity cannot change within a journal.");
  }
  if (next.previousRevision !== current.revision || next.revision !== current.revision + 1) {
    throw new Error("Framing plan revision is not the direct successor of the stored revision.");
  }
}

function toReference(plan: FramingPlan): FramingPlanReference {
  return {
    projectId: plan.target.projectId,
    framingId: plan.target.framingId,
    planId: plan.id,
    targetKind: plan.target.kind,
    featureId: plan.target.kind === "feature" ? plan.target.featureId : null,
    revision: plan.revision,
    fingerprint: framingPlanFingerprint(plan),
    updatedAt: plan.updatedAt,
    published: plan.publication !== null,
  };
}

function revisionFileName(plan: FramingPlan, fingerprint: string): string {
  return `${String(plan.revision).padStart(8, "0")}-${fingerprint}.json`;
}

function contentFingerprint(value: unknown): string {
  return rawFingerprint(`${JSON.stringify(value, null, 2)}\n`);
}

function rawFingerprint(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function planDirectory(homeDir: string, projectId: string, framingId: string): string {
  validateIdentifier(projectId, "project id");
  validateIdentifier(framingId, "framing id");
  return join(homeDir, ".arka-norn", "framing", projectId, framingId);
}

function validateIdentifier(value: string, subject: string): void {
  if (!isSafeIdentifier(value)) throw new Error(`Invalid framing ${subject}.`);
}

function isSafeIdentifier(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value);
}

async function canonicalProjectRoot(value: string): Promise<string> {
  const root = resolve(value);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("The Project publication root must be a real directory.");
  return fs.realpath(root);
}

async function ensureSafePublicationRoot(projectRoot: string, plansRoot: string): Promise<void> {
  const relativeRoot = relative(projectRoot, plansRoot);
  if (relativeRoot.startsWith("..") || relativeRoot.split(sep).includes("..")) throw new Error("Framing publication escapes the Project.");
  let current = projectRoot;
  for (const segment of relativeRoot.split(sep)) {
    current = join(current, segment);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) throw new Error(`Symbolic-link publication directory is forbidden: ${current}.`);
      if (!stat.isDirectory()) throw new Error(`Publication path is not a directory: ${current}.`);
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
      await fs.mkdir(current, { mode: 0o755 });
    }
  }
}

async function rebuildPublishedIndex(plansRoot: string): Promise<PublishedIndex> {
  const latestByTarget: Record<string, PublishedIndexEntry> = {};
  let planDirectories: string[];
  try {
    planDirectories = await fs.readdir(plansRoot);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return { schemaVersion: 1, latestByTarget };
    throw error;
  }
  for (const planId of planDirectories.filter(isSafeIdentifier).sort()) {
    let files: string[];
    try {
      files = await fs.readdir(join(plansRoot, planId));
    } catch {
      continue;
    }
    for (const fileName of files.sort()) {
      if (parseRevisionName(fileName) === undefined) continue;
      const path = join(plansRoot, planId, fileName);
      const plan = await readJson<FramingPlan>(path).catch(() => undefined);
      if (plan === undefined) continue;
      try { assertPlan(plan); } catch { continue; }
      const fingerprint = framingPlanFingerprint(plan);
      const relativePath = normalizePath(join(".arka-norn", "plans", planId, fileName));
      const entry = publishedEntry(plan, relativePath, fingerprint);
      const key = targetKey(plan);
      if ((latestByTarget[key]?.revision ?? -1) < plan.revision) latestByTarget[key] = entry;
    }
  }
  return { schemaVersion: 1, latestByTarget };
}

function publishedEntry(plan: FramingPlan, relativePath: string, fingerprint: string): PublishedIndexEntry {
  return {
    schemaVersion: 1,
    planId: plan.id,
    projectId: plan.target.projectId,
    targetKind: plan.target.kind,
    featureId: plan.target.kind === "feature" ? plan.target.featureId : null,
    revision: plan.revision,
    fingerprint,
    relativePath,
    publishedAt: plan.updatedAt,
  };
}

function targetKey(plan: FramingPlan): string {
  return plan.target.kind === "project" ? `project:${plan.target.projectId}` : `feature:${plan.target.featureId ?? plan.target.framingId}`;
}

function normalizePath(value: string): string {
  return value.split(sep).join("/");
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
