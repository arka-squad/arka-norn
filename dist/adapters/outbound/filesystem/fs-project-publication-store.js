/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import { assertPlan, framingPlanFingerprint } from "../../../domain/framing/framing-plan.js";
import { ProjectId } from "../../../domain/project/project-id.js";
import { createProjectPublicationJournal, parseProjectPublicationJournal, } from "../../../domain/project/project-publication.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
export class FsProjectPublicationStore {
    dependencies;
    constructor(dependencies) {
        this.dependencies = dependencies;
    }
    async publish(input) {
        assertPublishable(input.draft, input.plan);
        const path = journalPath(this.dependencies.homeDir, input.draft.id);
        return withFileLock(path, async () => {
            let journal = await this.load(input.draft.id);
            if (journal === undefined) {
                await assertPublicationRootAvailable(input.draft.root);
                journal = createJournal(input.draft, input.plan, input.now);
                await writeJournal(path, journal, true);
                this.interrupt(journal.state);
            }
            else {
                assertSamePublication(journal, input.draft, input.plan);
            }
            try {
                return await this.continuePublication(input.draft, input.plan, journal, input.now);
            }
            catch (error) {
                if (error instanceof PublicationInterruptedError)
                    throw error;
                const current = await this.requiredJournal(input.draft.id);
                await writeJournal(path, {
                    ...current,
                    updatedAt: validTimestamp(input.now),
                    error: failure(error),
                });
                await this.dependencies.drafts.setMaterialization({
                    id: input.draft.id,
                    expectedRootFingerprint: input.draft.rootFingerprint,
                    materialization: "recovery_required",
                    now: input.now,
                }).catch(() => undefined);
                throw error;
            }
        });
    }
    async list() {
        let entries;
        try {
            entries = await fs.readdir(publicationsRoot(this.dependencies.homeDir), { withFileTypes: true });
        }
        catch (error) {
            if (isNodeError(error, "ENOENT"))
                return [];
            throw error;
        }
        const journals = [];
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (!entry.isDirectory() || !safeProjectId(entry.name))
                continue;
            const journal = await this.load(entry.name);
            if (journal !== undefined)
                journals.push(journal);
        }
        return journals;
    }
    async inspect(projectId) {
        const journal = await this.requiredJournal(projectId);
        try {
            const draft = await this.dependencies.drafts.verify(projectId);
            const plan = await this.loadJournalPlan(journal);
            assertSamePublication(journal, draft, plan);
            const artifacts = await inspectArtifacts(journal, draft, plan, this.dependencies.projectIndex);
            if (journal.state === "materialized" && artifacts.complete) {
                return { journal, healthy: true, recoverable: false, message: "publication materialized and indexed" };
            }
            if (!artifacts.safe)
                return { journal, healthy: false, recoverable: false, message: artifacts.message };
            return { journal, healthy: false, recoverable: true, message: `publication stopped after ${journal.state}` };
        }
        catch (error) {
            return { journal, healthy: false, recoverable: false, message: boundedMessage(error) };
        }
    }
    async recover(projectId, now) {
        const journal = await this.requiredJournal(projectId);
        const inspection = await this.inspect(projectId);
        if (inspection.healthy)
            return journal;
        if (!inspection.recoverable)
            throw new Error(`Project publication cannot be recovered safely: ${inspection.message}.`);
        const draft = await this.dependencies.drafts.verify(projectId);
        const plan = await this.loadJournalPlan(journal);
        await this.publish({ draft, plan, now });
        return this.requiredJournal(projectId);
    }
    async continuePublication(draft, plan, initial, now) {
        let journal = initial;
        if (journal.state === "materialized")
            return this.publishedResult(journal, plan);
        await assertPublicationRootAvailable(journal.root, journal, draft);
        const committedPlan = await lstatIfPresent(join(journal.root, ...journal.relativePlanPath.split("/")));
        if (committedPlan !== undefined)
            await assertPlanAt(join(journal.root, ...journal.relativePlanPath.split("/")), plan);
        if (draft.materialization === "draft" || draft.materialization === "recovery_required") {
            await this.dependencies.drafts.setMaterialization({
                id: draft.id, expectedRootFingerprint: draft.rootFingerprint, materialization: "publishing", now,
            });
        }
        if (journal.state === "prepared") {
            await stageArtifacts(journal, draft, plan);
            journal = await this.transition(journal, "staged", now);
        }
        if (journal.state === "staged") {
            await commitPlan(journal, plan);
            journal = await this.transition(journal, "plan_committed", now);
        }
        if (journal.state === "plan_committed") {
            await commitMarker(journal, draft);
            journal = await this.transition(journal, "marker_committed", now);
        }
        let published;
        if (journal.state === "marker_committed") {
            published = await this.dependencies.framing.publish({ projectRoot: journal.root, plan });
            await this.dependencies.projectIndex.upsert({
                id: draft.id, root: draft.root, name: draft.name, updatedAt: new Date(journal.createdAt),
            });
            journal = await this.transition(journal, "indexed", now);
        }
        else {
            published = await this.publishedResult(journal, plan);
        }
        if (journal.state === "indexed") {
            await this.dependencies.drafts.setMaterialization({
                id: draft.id, expectedRootFingerprint: draft.rootFingerprint, materialization: "materialized", now,
            });
            journal = await this.transition(journal, "materialized", now);
        }
        return published;
    }
    async transition(journal, state, now) {
        const next = parseProjectPublicationJournal({ ...journal, state, updatedAt: validTimestamp(now), error: null });
        await writeJournal(journalPath(this.dependencies.homeDir, journal.projectId), next);
        this.interrupt(state);
        return next;
    }
    interrupt(state) {
        if (this.dependencies.interruptAfter === state)
            throw new PublicationInterruptedError(state);
    }
    async publishedResult(journal, plan) {
        const path = join(journal.root, ...journal.relativePlanPath.split("/"));
        await assertPlanAt(path, plan);
        return { plan, absolutePath: path, relativePath: journal.relativePlanPath, fingerprint: journal.planFingerprint };
    }
    async loadJournalPlan(journal) {
        const plan = await this.dependencies.framing.loadRevision(journal.projectId, journal.framingId, journal.planRevision);
        if (plan === undefined)
            throw new Error("Publication framing revision is missing from the private journal.");
        return plan;
    }
    async load(projectId) {
        if (!safeProjectId(projectId))
            throw new Error("Invalid Project publication identifier.");
        const value = await readJson(journalPath(this.dependencies.homeDir, projectId));
        return value === undefined ? undefined : parseProjectPublicationJournal(value);
    }
    async requiredJournal(projectId) {
        const journal = await this.load(projectId);
        if (journal === undefined)
            throw new Error(`Project publication journal not found: ${projectId}.`);
        return journal;
    }
}
class PublicationInterruptedError extends Error {
    constructor(state) { super(`Simulated publication interruption after ${state}.`); }
}
function createJournal(draft, plan, now) {
    const fingerprint = framingPlanFingerprint(plan);
    const relativePlanPath = [".arka-norn", "plans", plan.id, `${String(plan.revision).padStart(8, "0")}-${fingerprint}.json`].join("/");
    return createProjectPublicationJournal({
        id: `publication-${fingerprint.slice(0, 24)}`,
        projectId: draft.id,
        framingId: plan.target.framingId,
        planId: plan.id,
        planRevision: plan.revision,
        planFingerprint: fingerprint,
        root: draft.root,
        rootFingerprint: draft.rootFingerprint,
        relativePlanPath,
        createdAt: validTimestamp(now),
        updatedAt: validTimestamp(now),
    });
}
function assertPublishable(draft, plan) {
    assertPlan(plan);
    if (plan.stabilizations.groundedPlan === null)
        throw new Error("Project publication requires the second stabilization.");
    if (plan.target.projectId !== draft.id)
        throw new Error("Project publication target does not match its draft.");
}
function assertSamePublication(journal, draft, plan) {
    if (journal.projectId !== draft.id || journal.root !== draft.root || journal.rootFingerprint !== draft.rootFingerprint
        || journal.planId !== plan.id || journal.framingId !== plan.target.framingId
        || journal.planRevision !== plan.revision || journal.planFingerprint !== framingPlanFingerprint(plan)) {
        throw new Error("Project publication journal belongs to another draft or framing revision.");
    }
}
async function stageArtifacts(journal, draft, plan) {
    await assertPublicationRootAvailable(journal.root, journal, draft);
    const staging = await ensureRealDirectories(journal.root, [".arka-norn", ".staging", journal.id]);
    await writeOrVerify(join(staging, "plan.json"), plan, (value) => {
        try {
            assertPlan(value);
            return framingPlanFingerprint(value) === journal.planFingerprint;
        }
        catch {
            return false;
        }
    });
    const marker = expectedMarker(draft, journal.createdAt);
    await writeOrVerify(join(staging, "project.json"), marker, (value) => sameJson(value, marker));
}
async function commitPlan(journal, plan) {
    const destination = join(journal.root, ...journal.relativePlanPath.split("/"));
    await ensureRealDirectories(journal.root, [".arka-norn", "plans", journal.planId]);
    await linkExclusive(join(stagingRoot(journal), "plan.json"), destination, () => assertPlanAt(destination, plan));
}
async function commitMarker(journal, draft) {
    const destination = join(journal.root, ".arka-norn", "project.json");
    const marker = expectedMarker(draft, journal.createdAt);
    await linkExclusive(join(stagingRoot(journal), "project.json"), destination, async () => {
        const current = await readJson(destination);
        if (!sameJson(current, marker))
            throw publicationError("concurrent_marker", "A concurrent Project marker already exists.");
    });
}
async function inspectArtifacts(journal, draft, plan, index) {
    try {
        const markerPath = join(journal.root, ".arka-norn", "project.json");
        const marker = await readJson(markerPath);
        if (marker !== undefined && !sameJson(marker, expectedMarker(draft, journal.createdAt))) {
            return { safe: false, complete: false, message: "a different Project marker occupies the destination" };
        }
        const planPath = join(journal.root, ...journal.relativePlanPath.split("/"));
        const publishedPlan = await readJson(planPath);
        if (publishedPlan !== undefined && framingPlanFingerprint(publishedPlan) !== framingPlanFingerprint(plan)) {
            return { safe: false, complete: false, message: "a different plan occupies the publication destination" };
        }
        const indexed = await index.find(ProjectId.of(draft.id));
        const complete = marker !== undefined && publishedPlan !== undefined && indexed?.root === draft.root;
        return { safe: true, complete, message: complete ? "publication artifacts are complete" : "publication artifacts can be resumed" };
    }
    catch (error) {
        return { safe: false, complete: false, message: boundedMessage(error) };
    }
}
async function assertPublicationRootAvailable(root, journal, draft) {
    const canonical = await fs.realpath(resolve(root));
    if (canonical !== resolve(root))
        throw new Error("Project publication root changed before publication.");
    const rootStat = await fs.lstat(canonical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink())
        throw publicationError("unsafe_root", "Project publication root must be a real directory.");
    await rejectGitSubmodule(canonical);
    for (const marker of [join(canonical, ".arka-norn", "project.json"), join(canonical, ".arka-norn", "depot.json")]) {
        const stat = await lstatIfPresent(marker);
        if (stat === undefined)
            continue;
        if (stat.isSymbolicLink())
            throw publicationError("symlink", "A symbolic-link marker destination is forbidden.");
        if (journal === undefined || basename(marker) !== "project.json" || draft === undefined) {
            throw publicationError("concurrent_marker", "A Project marker already exists.");
        }
        const current = await readJson(marker);
        if (!sameJson(current, expectedMarker(draft, journal.createdAt))) {
            throw publicationError("concurrent_marker", "A concurrent Project marker already exists.");
        }
    }
    if (journal !== undefined)
        await ensureRealDirectories(canonical, [".arka-norn"]);
}
async function rejectGitSubmodule(root) {
    const gitFile = join(root, ".git");
    const stat = await lstatIfPresent(gitFile);
    if (stat === undefined || stat.isDirectory())
        return;
    if (stat.isSymbolicLink())
        throw publicationError("symlink", "A symbolic-link Git boundary is forbidden.");
    const content = await fs.readFile(gitFile, "utf8");
    if (/gitdir:\s*.*(?:^|[\\/])modules(?:[\\/]|$)/imu.test(content)) {
        throw publicationError("submodule", "Publishing a Project from a Git submodule is forbidden.");
    }
}
async function ensureRealDirectories(root, segments) {
    let current = root;
    for (const segment of segments) {
        current = join(current, segment);
        const stat = await lstatIfPresent(current);
        if (stat === undefined)
            await fs.mkdir(current, { mode: 0o700 });
        else if (stat.isSymbolicLink() || !stat.isDirectory())
            throw publicationError("symlink", `Unsafe publication directory: ${relative(root, current)}.`);
    }
    return current;
}
async function writeOrVerify(path, value, verify) {
    try {
        await writeJsonAtomic(path, value, { mode: 0o644, exclusive: true });
    }
    catch (error) {
        if (!isNodeError(error, "EEXIST"))
            throw error;
        if (!verify(await readJson(path)))
            throw publicationError("staging_conflict", "Staging contains different publication content.");
    }
}
async function linkExclusive(source, destination, verify) {
    const sourceStat = await lstatIfPresent(source);
    if (sourceStat?.isSymbolicLink())
        throw publicationError("symlink", "Symbolic-link staging artifacts are forbidden.");
    try {
        if (sourceStat === undefined)
            return verify();
        await fs.link(source, destination);
        await fs.unlink(source);
        await syncDirectory(dirname(destination));
    }
    catch (error) {
        if (!isNodeError(error, "EEXIST"))
            throw error;
        await verify();
        await fs.unlink(source).catch(() => undefined);
    }
}
async function assertPlanAt(path, expected) {
    const value = await readJson(path);
    if (value === undefined)
        throw new Error("Published framing plan is missing.");
    assertPlan(value);
    if (framingPlanFingerprint(value) !== framingPlanFingerprint(expected))
        throw publicationError("plan_conflict", "Published framing plan differs from the authorized revision.");
}
function expectedMarker(draft, publishedAt) {
    return {
        schemaVersion: 4,
        id: draft.id,
        name: draft.name,
        orchestrationMode: "manual",
        createdAt: draft.createdAt,
        updatedAt: publishedAt,
    };
}
async function writeJournal(path, journal, exclusive = false) {
    await writeJsonAtomic(path, journal, { mode: 0o600, exclusive });
}
function failure(error) {
    const code = error instanceof Error && "publicationCode" in error && typeof error.publicationCode === "string"
        ? error.publicationCode : "publication_failed";
    return { code: safeErrorCode(code), message: boundedMessage(error) };
}
function publicationError(code, message) {
    return Object.assign(new Error(message), { publicationCode: code });
}
function safeErrorCode(value) {
    const normalized = value.replace(/[^A-Za-z0-9._:-]/gu, "_").slice(0, 64);
    return normalized.length === 0 ? "publication_failed" : normalized;
}
function boundedMessage(error) {
    const message = error instanceof Error ? error.message : String(error);
    return message.replace(/[\r\n\t]+/gu, " ").slice(0, 512) || "Project publication failed.";
}
function stagingRoot(journal) {
    return join(journal.root, ".arka-norn", ".staging", journal.id);
}
function publicationsRoot(homeDir) {
    return join(homeDir, ".arka-norn", "framing-projects");
}
function journalPath(homeDir, projectId) {
    if (!safeProjectId(projectId))
        throw new Error("Invalid Project publication identifier.");
    return join(publicationsRoot(homeDir), projectId, "publication.json");
}
function safeProjectId(value) {
    return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value) && basename(value) === value;
}
function validTimestamp(value) {
    if (Number.isNaN(value.getTime()))
        throw new Error("Invalid Project publication timestamp.");
    return value.toISOString();
}
function sameJson(left, right) {
    return createHash("sha256").update(JSON.stringify(left)).digest("hex") === createHash("sha256").update(JSON.stringify(right)).digest("hex");
}
async function lstatIfPresent(path) {
    return fs.lstat(path).catch((error) => {
        if (isNodeError(error, "ENOENT"))
            return undefined;
        throw error;
    });
}
async function syncDirectory(directory) {
    let handle;
    try {
        handle = await fs.open(directory, "r");
        await handle.sync();
    }
    catch (error) {
        if (!isNodeError(error, "EINVAL") && !isNodeError(error, "ENOTSUP") && !(process.platform === "win32" && isNodeError(error, "EPERM")))
            throw error;
    }
    finally {
        await handle?.close().catch(() => undefined);
    }
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-project-publication-store.js.map