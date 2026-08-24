/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
const MAX_FILES = 100_000;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".cache", ".next", ".turbo", "target", "test-results"]);
const SECRET_FILE = /^(?:\.env(?:\..+)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?(?:\.json|\.ya?ml)?)$/iu;
const CANCELLED_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export class FsOrchestrationWorkspaceManager {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async prepare(project, campaign) {
        if (campaign.workspaceMode === "direct") {
            const baseline = await manifest(project.root, project, campaign);
            const base = this.campaignDir(campaign.id);
            await mkdir(base, { recursive: true, mode: 0o700 });
            await writePrivateJson(join(base, "baseline.json"), baseline);
            return { logicalRoot: project.root, physicalRoot: project.root, baseline, excludedPaths: [] };
        }
        const base = this.campaignDir(campaign.id);
        const physicalRoot = join(base, "root");
        await rm(base, { recursive: true, force: true });
        await mkdir(physicalRoot, { recursive: true, mode: 0o700 });
        const excludedPaths = [];
        await copyTree(project.root, physicalRoot, "", excludedPaths, { files: 0, bytes: 0 });
        const baseline = await manifest(physicalRoot, project, campaign);
        await writePrivateJson(join(base, "baseline.json"), baseline);
        await writePrivateJson(join(base, "metadata.json"), { schemaVersion: 1, projectId: project.id.value, campaignId: campaign.id, logicalRoot: project.root, excludedPaths });
        return { logicalRoot: project.root, physicalRoot, baseline, excludedPaths };
    }
    async open(project, campaign) {
        const base = this.campaignDir(campaign.id);
        const baseline = await readRequiredManifest(join(base, "baseline.json"));
        if (baseline.projectId !== project.id.value || baseline.campaignId !== campaign.id)
            throw new Error("Orchestration workspace identity mismatch.");
        if (campaign.workspaceMode === "direct")
            return { logicalRoot: project.root, physicalRoot: project.root, baseline, excludedPaths: [] };
        const metadata = JSON.parse(await readFile(join(base, "metadata.json"), "utf8"));
        return { logicalRoot: project.root, physicalRoot: join(base, "root"), baseline, excludedPaths: [...(metadata.excludedPaths ?? [])] };
    }
    async verifyResume(project, campaign) {
        const prepared = await this.open(project, campaign);
        const current = await manifest(project.root, project, campaign);
        if (current.fingerprint !== prepared.baseline.fingerprint) {
            throw new Error("The real Project changed after the campaign preview; create a new preview before continuing.");
        }
    }
    async changes(project, campaign) {
        const root = campaign.workspaceMode === "direct" ? project.root : join(this.campaignDir(campaign.id), "root");
        const baseline = campaign.workspaceMode === "direct"
            ? await readRequiredManifest(join(this.campaignDir(campaign.id), "baseline.json"))
            : await readRequiredManifest(join(this.campaignDir(campaign.id), "baseline.json"));
        const current = await manifest(root, project, campaign);
        return compare(campaign.id, baseline, current, root);
    }
    async apply(project, campaign, expectedFingerprint, validate) {
        if (campaign.workspaceMode !== "isolated")
            throw new Error("Only an isolated campaign has pending changes to apply.");
        const base = this.campaignDir(campaign.id);
        const mirror = join(base, "root");
        const baseline = await readRequiredManifest(join(base, "baseline.json"));
        const current = await manifest(mirror, project, campaign);
        const changes = compare(campaign.id, baseline, current, mirror);
        if (changes.fingerprint !== expectedFingerprint)
            throw new Error("The workspace changes changed before confirmation.");
        const live = await manifest(project.root, project, campaign);
        const conflict = firstManifestConflict(baseline, live);
        if (conflict !== undefined)
            throw new Error(`Conflict: ${conflict} changed in the real Project after the isolated workspace was created.`);
        const backup = join(base, "backup");
        await rm(backup, { recursive: true, force: true });
        await mkdir(backup, { recursive: true, mode: 0o700 });
        const applied = [];
        try {
            for (const path of new Set(changes.changes.flatMap(changePaths)))
                await backupExisting(project.root, backup, path);
            for (const change of changes.changes) {
                assertInsideScope(change.path, campaign.scopePaths);
                if (change.previousPath !== undefined)
                    assertInsideScope(change.previousPath, campaign.scopePaths);
                const target = safeJoin(project.root, change.path);
                const source = safeJoin(mirror, change.path);
                if (change.kind === "deleted")
                    await unlink(target);
                else {
                    await atomicCopy(source, target);
                    if (change.kind === "renamed")
                        await unlink(safeJoin(project.root, change.previousPath));
                }
                applied.push(change);
            }
            if (validate !== undefined)
                await validate();
        }
        catch (error) {
            await rollback(project.root, backup, applied);
            throw error;
        }
        return changes;
    }
    async discard(_project, campaign) {
        if (campaign.workspaceMode === "isolated")
            await rm(this.campaignDir(campaign.id), { recursive: true, force: true });
    }
    async cleanupExpired(campaigns, now) {
        await Promise.all(campaigns
            .filter((campaign) => campaign.status === "cancelled" && now.getTime() - campaign.updatedAt.getTime() >= CANCELLED_RETENTION_MS)
            .map((campaign) => rm(this.campaignDir(campaign.id), { recursive: true, force: true })));
    }
    async snapshotDirectBaseline(project, campaign) {
        const base = this.campaignDir(campaign.id);
        await mkdir(base, { recursive: true, mode: 0o700 });
        await writePrivateJson(join(base, "baseline.json"), await manifest(project.root, project, campaign));
    }
    campaignDir(campaignId) { return join(this.homeDir, ".arka-norn", "orchestration", "workspaces", campaignId); }
}
async function copyTree(sourceRoot, targetRoot, rel, excludedPaths, count) {
    for (const entry of await readdir(join(sourceRoot, rel), { withFileTypes: true })) {
        const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (isExcluded(childRel, entry.name, entry.isDirectory())) {
            excludedPaths.push(childRel);
            continue;
        }
        const source = safeJoin(sourceRoot, childRel);
        const target = safeJoin(targetRoot, childRel);
        const info = await lstat(source);
        if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
            excludedPaths.push(childRel);
            continue;
        }
        if (info.isDirectory()) {
            await mkdir(target, { recursive: true, mode: info.mode & 0o777 });
            await copyTree(sourceRoot, targetRoot, childRel, excludedPaths, count);
            continue;
        }
        count.files += 1;
        count.bytes += info.size;
        if (count.files > MAX_FILES || count.bytes > MAX_TOTAL_BYTES || info.size > MAX_FILE_BYTES)
            throw new Error("Project exceeds the isolated workspace limits.");
        await mkdir(dirname(target), { recursive: true });
        await copyFile(source, target, constants.COPYFILE_EXCL);
        await chmod(target, info.mode & 0o777);
    }
}
function isExcluded(rel, name, directory) {
    if (rel === ".arka-norn" || rel.startsWith(`.arka-norn/`))
        return true;
    if (directory && EXCLUDED_DIRS.has(name))
        return true;
    return !directory && SECRET_FILE.test(name) && name !== ".env.example";
}
async function manifest(root, project, campaign) {
    const files = [];
    await walkManifest(root, "", files);
    files.sort((left, right) => left.path.localeCompare(right.path));
    const fingerprint = hash(JSON.stringify(files));
    return { schemaVersion: 1, projectId: project.id.value, campaignId: campaign.id, files, fingerprint };
}
async function walkManifest(root, rel, files) {
    if (files.length > MAX_FILES)
        throw new Error("Workspace contains too many files.");
    for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
        const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
        if (isExcluded(childRel, entry.name, entry.isDirectory()))
            continue;
        const path = safeJoin(root, childRel);
        const info = await lstat(path);
        if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()))
            continue;
        if (info.isDirectory())
            await walkManifest(root, childRel, files);
        else
            files.push({ path: childRel, size: info.size, mode: info.mode & 0o777, hash: hash(await readFile(path)) });
    }
}
function compare(campaignId, before, after, root) {
    const oldFiles = new Map(before.files.map((file) => [file.path, file]));
    const newFiles = new Map(after.files.map((file) => [file.path, file]));
    const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
    const raw = paths.flatMap((path) => {
        const oldFile = oldFiles.get(path);
        const newFile = newFiles.get(path);
        if (oldFile === undefined && newFile !== undefined)
            return [{ path, kind: "created", size: newFile.size, binary: binaryFile(join(root, path)) }];
        if (oldFile !== undefined && newFile === undefined)
            return [{ path, kind: "deleted", size: oldFile.size, binary: false }];
        if (oldFile !== undefined && newFile !== undefined && (oldFile.hash !== newFile.hash || oldFile.mode !== newFile.mode))
            return [{ path, kind: "modified", size: newFile.size, binary: binaryFile(join(root, path)) }];
        return [];
    });
    const deleted = raw.filter((change) => change.kind === "deleted");
    const consumed = new Set();
    const changes = raw.flatMap((change) => {
        if (change.kind === "deleted" && consumed.has(change.path))
            return [];
        if (change.kind !== "created")
            return [change];
        const createdFile = newFiles.get(change.path);
        const source = deleted.find((candidate) => !consumed.has(candidate.path) && sameFile(oldFiles.get(candidate.path), createdFile));
        if (source === undefined)
            return [change];
        consumed.add(source.path);
        return [{ ...change, kind: "renamed", previousPath: source.path }];
    }).filter((change) => change.kind !== "deleted" || !consumed.has(change.path));
    return { campaignId, changes, fingerprint: hash(JSON.stringify(changes)) };
}
function sameFile(left, right) { return left !== undefined && right !== undefined && left.hash === right.hash && left.mode === right.mode; }
function firstManifestConflict(before, after) {
    if (before.fingerprint === after.fingerprint)
        return undefined;
    const oldFiles = new Map(before.files.map((file) => [file.path, file]));
    const newFiles = new Map(after.files.map((file) => [file.path, file]));
    return [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort().find((path) => {
        const oldFile = oldFiles.get(path);
        const newFile = newFiles.get(path);
        return oldFile === undefined || newFile === undefined || oldFile.hash !== newFile.hash || oldFile.mode !== newFile.mode || oldFile.size !== newFile.size;
    }) ?? "the workspace baseline";
}
function binaryFile(path) { return /\.(?:png|jpe?g|gif|webp|pdf|zip|gz|tgz|woff2?|ico)$/iu.test(path); }
async function atomicCopy(source, target) {
    await mkdir(dirname(target), { recursive: true });
    const temp = `${target}.norn-${process.pid}.tmp`;
    await copyFile(source, temp);
    await chmod(temp, (await stat(source)).mode & 0o777);
    await rename(temp, target);
}
async function backupExisting(root, backup, path) {
    const target = safeJoin(root, path);
    if (!(await exists(target)))
        return;
    const saved = safeJoin(backup, path);
    await mkdir(dirname(saved), { recursive: true });
    await copyFile(target, saved, constants.COPYFILE_EXCL);
}
async function rollback(root, backup, changes) {
    for (const change of [...changes].reverse()) {
        for (const path of [...changePaths(change)].reverse()) {
            const target = safeJoin(root, path);
            const saved = safeJoin(backup, path);
            if (await exists(saved))
                await atomicCopy(saved, target);
            else
                await rm(target, { force: true });
        }
    }
}
function changePaths(change) { return change.previousPath === undefined ? [change.path] : [change.previousPath, change.path]; }
function assertInsideScope(path, scopes) {
    if (!scopes.some((scope) => scope === "." || path === scope || path.startsWith(`${scope}/`)))
        throw new Error(`Change outside confirmed scope: ${path}`);
}
function safeJoin(root, rel) {
    if (rel === "" || rel.startsWith("/") || rel.split("/").includes(".."))
        throw new Error("Unsafe workspace path.");
    const target = resolve(root, rel);
    const prefix = resolve(root) + sep;
    if (!target.startsWith(prefix))
        throw new Error("Workspace path escapes its root.");
    return target;
}
async function readRequiredManifest(path) { return JSON.parse(await readFile(path, "utf8")); }
async function writePrivateJson(path, value) { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
async function exists(path) { try {
    await access(path);
    return true;
}
catch {
    return false;
} }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
//# sourceMappingURL=fs-orchestration-workspace.js.map