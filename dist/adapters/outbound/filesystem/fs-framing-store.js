/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { assertPlan, framingPlanFingerprint, } from "../../../domain/framing/framing-plan.js";
import { readJson, readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsFramingStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async create(plan) {
        assertPlan(plan);
        if (plan.revision !== 1 || plan.previousRevision !== null)
            throw new Error("A framing journal must start at revision 1.");
        const directory = planDirectory(this.homeDir, plan.target.projectId, plan.target.framingId);
        return withFileLock(join(directory, "current.json"), async () => {
            const existing = await loadLatest(directory);
            if (existing !== undefined) {
                if (existing.id === plan.id && framingPlanFingerprint(existing) === framingPlanFingerprint(plan))
                    return existing;
                throw new Error(`Framing journal already exists: ${plan.target.framingId}.`);
            }
            await persistRevision(directory, plan);
            const event = createEvent(plan, 1, "created", {});
            await persistEvent(directory, event);
            await persistPointer(directory, plan, event.sequence);
            return plan;
        });
    }
    async load(projectId, framingId) {
        return loadLatest(planDirectory(this.homeDir, projectId, framingId));
    }
    async loadRevision(projectId, framingId, revision) {
        if (!Number.isInteger(revision) || revision < 1)
            throw new Error("Invalid framing revision.");
        return loadExact(planDirectory(this.homeDir, projectId, framingId), revision);
    }
    async save(input) {
        assertPlan(input.plan);
        const directory = planDirectory(this.homeDir, input.projectId, input.framingId);
        return withFileLock(join(directory, "current.json"), async () => {
            const current = await loadLatest(directory);
            if (current === undefined)
                throw new Error(`Framing journal not found: ${input.framingId}.`);
            if (current.revision !== input.expectedRevision)
                throw new Error(`Framing revision conflict: expected ${current.revision}, received ${input.expectedRevision}.`);
            assertSuccessor(current, input.plan);
            await persistRevision(directory, input.plan);
            const sequence = await nextEventSequence(directory);
            const event = createEvent(input.plan, sequence, input.eventKind, input.metadata ?? {});
            await persistEvent(directory, event);
            await persistPointer(directory, input.plan, event.sequence);
            return input.plan;
        });
    }
    async list(projectId) {
        validateIdentifier(projectId, "project id");
        const root = join(this.homeDir, ".arka-norn", "framing", projectId);
        let names;
        try {
            names = await fs.readdir(root);
        }
        catch (error) {
            if (isNodeError(error, "ENOENT"))
                return [];
            throw error;
        }
        const references = [];
        for (const framingId of names.filter(isSafeIdentifier).sort()) {
            const plan = await loadLatest(join(root, framingId));
            if (plan === undefined)
                continue;
            references.push(toReference(plan));
        }
        return references.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    async publish(input) {
        assertPlan(input.plan);
        if (input.plan.stabilizations.groundedPlan === null)
            throw new Error("Only a grounded stabilized framing plan can be published.");
        const projectRoot = await canonicalProjectRoot(input.projectRoot);
        const plansRoot = join(projectRoot, ".arka-norn", "plans");
        await ensureSafePublicationRoot(projectRoot, plansRoot);
        const fingerprint = framingPlanFingerprint(input.plan);
        const relativePath = normalizePath(join(".arka-norn", "plans", input.plan.id, revisionFileName(input.plan, fingerprint)));
        const absolutePath = join(projectRoot, relativePath);
        await writeJsonAtomic(absolutePath, input.plan, { mode: 0o644, exclusive: true }).catch(async (error) => {
            if (!isNodeError(error, "EEXIST"))
                throw error;
            const existing = await readJson(absolutePath);
            if (existing === undefined || framingPlanFingerprint(existing) !== fingerprint)
                throw new Error("Published framing path already contains different content.");
        });
        await withFileLock(join(plansRoot, "index.json"), async () => {
            const index = await rebuildPublishedIndex(plansRoot);
            const entry = publishedEntry(input.plan, relativePath, fingerprint);
            const key = targetKey(input.plan);
            await writeJsonAtomic(join(plansRoot, "index.json"), {
                schemaVersion: 1,
                latestByTarget: { ...index.latestByTarget, [key]: entry },
            }, { mode: 0o644 });
        });
        return { plan: input.plan, absolutePath, relativePath, fingerprint };
    }
}
async function persistRevision(directory, plan) {
    const fingerprint = contentFingerprint(plan);
    await writeJsonAtomic(join(directory, "revisions", revisionFileName(plan, fingerprint)), plan, { mode: 0o600, exclusive: true });
}
async function persistEvent(directory, event) {
    const fingerprint = contentFingerprint(event);
    const name = `${String(event.sequence).padStart(8, "0")}-${fingerprint}.json`;
    await writeJsonAtomic(join(directory, "events", name), event, { mode: 0o600, exclusive: true });
}
async function persistPointer(directory, plan, eventSequence) {
    const fingerprint = contentFingerprint(plan);
    await writeJsonAtomic(join(directory, "current.json"), {
        schemaVersion: 1,
        planId: plan.id,
        revision: plan.revision,
        fingerprint,
        revisionFile: revisionFileName(plan, fingerprint),
        eventSequence,
    }, { mode: 0o600 });
}
async function loadLatest(directory) {
    const revisionDirectory = join(directory, "revisions");
    let names;
    try {
        names = await fs.readdir(revisionDirectory);
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return undefined;
        throw error;
    }
    const candidates = names.map(parseRevisionName).filter((item) => item !== undefined)
        .sort((left, right) => right.revision - left.revision);
    for (const candidate of candidates) {
        const path = join(revisionDirectory, candidate.fileName);
        const raw = await readRaw(path);
        if (raw === undefined || rawFingerprint(raw) !== candidate.fingerprint)
            continue;
        const plan = JSON.parse(raw);
        assertPlan(plan);
        if (plan.revision !== candidate.revision)
            throw new Error(`Framing revision filename mismatch: ${candidate.fileName}.`);
        return plan;
    }
    if (names.length > 0)
        throw new Error(`No valid framing revision can be reconstructed in ${directory}.`);
    return undefined;
}
async function loadExact(directory, revision) {
    let names;
    try {
        names = await fs.readdir(join(directory, "revisions"));
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return undefined;
        throw error;
    }
    const candidate = names.map(parseRevisionName).find((item) => item?.revision === revision);
    if (candidate === undefined)
        return undefined;
    const raw = await readRaw(join(directory, "revisions", candidate.fileName));
    if (raw === undefined || rawFingerprint(raw) !== candidate.fingerprint)
        throw new Error(`Invalid framing revision ${revision}.`);
    const plan = JSON.parse(raw);
    assertPlan(plan);
    return plan;
}
function parseRevisionName(fileName) {
    const match = /^(\d{8})-([a-f0-9]{64})\.json$/u.exec(fileName);
    if (match === null)
        return undefined;
    return { revision: Number(match[1]), fingerprint: match[2], fileName };
}
async function nextEventSequence(directory) {
    try {
        const names = await fs.readdir(join(directory, "events"));
        const sequences = names.map((name) => /^(\d{8})-[a-f0-9]{64}\.json$/u.exec(name)?.[1])
            .filter((value) => value !== undefined).map(Number);
        return (sequences.length === 0 ? 0 : Math.max(...sequences)) + 1;
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return 1;
        throw error;
    }
}
function createEvent(plan, sequence, kind, metadata) {
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
function assertSuccessor(current, next) {
    if (next.id !== current.id || next.target.projectId !== current.target.projectId || next.target.framingId !== current.target.framingId) {
        throw new Error("Framing plan identity cannot change within a journal.");
    }
    if (next.previousRevision !== current.revision || next.revision !== current.revision + 1) {
        throw new Error("Framing plan revision is not the direct successor of the stored revision.");
    }
}
function toReference(plan) {
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
function revisionFileName(plan, fingerprint) {
    return `${String(plan.revision).padStart(8, "0")}-${fingerprint}.json`;
}
function contentFingerprint(value) {
    return rawFingerprint(`${JSON.stringify(value, null, 2)}\n`);
}
function rawFingerprint(raw) {
    return createHash("sha256").update(raw).digest("hex");
}
function planDirectory(homeDir, projectId, framingId) {
    validateIdentifier(projectId, "project id");
    validateIdentifier(framingId, "framing id");
    return join(homeDir, ".arka-norn", "framing", projectId, framingId);
}
function validateIdentifier(value, subject) {
    if (!isSafeIdentifier(value))
        throw new Error(`Invalid framing ${subject}.`);
}
function isSafeIdentifier(value) {
    return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value);
}
async function canonicalProjectRoot(value) {
    const root = resolve(value);
    const stat = await fs.lstat(root);
    if (!stat.isDirectory() || stat.isSymbolicLink())
        throw new Error("The Project publication root must be a real directory.");
    return fs.realpath(root);
}
async function ensureSafePublicationRoot(projectRoot, plansRoot) {
    const relativeRoot = relative(projectRoot, plansRoot);
    if (relativeRoot.startsWith("..") || relativeRoot.split(sep).includes(".."))
        throw new Error("Framing publication escapes the Project.");
    let current = projectRoot;
    for (const segment of relativeRoot.split(sep)) {
        current = join(current, segment);
        try {
            const stat = await fs.lstat(current);
            if (stat.isSymbolicLink())
                throw new Error(`Symbolic-link publication directory is forbidden: ${current}.`);
            if (!stat.isDirectory())
                throw new Error(`Publication path is not a directory: ${current}.`);
        }
        catch (error) {
            if (!isNodeError(error, "ENOENT"))
                throw error;
            await fs.mkdir(current, { mode: 0o755 });
        }
    }
}
async function rebuildPublishedIndex(plansRoot) {
    const latestByTarget = {};
    let planDirectories;
    try {
        planDirectories = await fs.readdir(plansRoot);
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return { schemaVersion: 1, latestByTarget };
        throw error;
    }
    for (const planId of planDirectories.filter(isSafeIdentifier).sort()) {
        let files;
        try {
            files = await fs.readdir(join(plansRoot, planId));
        }
        catch {
            continue;
        }
        for (const fileName of files.sort()) {
            if (parseRevisionName(fileName) === undefined)
                continue;
            const path = join(plansRoot, planId, fileName);
            const plan = await readJson(path).catch(() => undefined);
            if (plan === undefined)
                continue;
            try {
                assertPlan(plan);
            }
            catch {
                continue;
            }
            const fingerprint = framingPlanFingerprint(plan);
            const relativePath = normalizePath(join(".arka-norn", "plans", planId, fileName));
            const entry = publishedEntry(plan, relativePath, fingerprint);
            const key = targetKey(plan);
            if ((latestByTarget[key]?.revision ?? -1) < plan.revision)
                latestByTarget[key] = entry;
        }
    }
    return { schemaVersion: 1, latestByTarget };
}
function publishedEntry(plan, relativePath, fingerprint) {
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
function targetKey(plan) {
    return plan.target.kind === "project" ? `project:${plan.target.projectId}` : `feature:${plan.target.featureId ?? plan.target.framingId}`;
}
function normalizePath(value) {
    return value.split(sep).join("/");
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-framing-store.js.map