/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";

import type { OrchestrationCampaign } from "../../../domain/orchestration/orchestration-campaign.js";
import type { Project } from "../../../domain/project/project.js";
import type { OrchestrationWorkspaceManager, PreparedOrchestrationWorkspace, WorkspaceChange, WorkspaceChanges, WorkspaceFileRecord, WorkspaceManifest } from "../../../ports/outbound/orchestration-workspace.js";

const MAX_FILES = 100_000;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const EXCLUDED_DIRS = new Set([".git", "node_modules", "dist", "build", "coverage", ".cache", ".next", ".turbo", "target", "test-results"]);
const SECRET_FILE = /^(?:\.env(?:\..+)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?(?:\.json|\.ya?ml)?)$/iu;
const CANCELLED_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

export class FsOrchestrationWorkspaceManager implements OrchestrationWorkspaceManager {
  public constructor(private readonly homeDir: string) {}

  public async prepare(project: Project, campaign: OrchestrationCampaign): Promise<PreparedOrchestrationWorkspace> {
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
    const excludedPaths: string[] = [];
    await copyTree(project.root, physicalRoot, "", excludedPaths, { files: 0, bytes: 0 });
    const baseline = await manifest(physicalRoot, project, campaign);
    await writePrivateJson(join(base, "baseline.json"), baseline);
    await writePrivateJson(join(base, "metadata.json"), { schemaVersion: 1, projectId: project.id.value, campaignId: campaign.id, logicalRoot: project.root, excludedPaths });
    return { logicalRoot: project.root, physicalRoot, baseline, excludedPaths };
  }

  public async open(project: Project, campaign: OrchestrationCampaign): Promise<PreparedOrchestrationWorkspace> {
    const base = this.campaignDir(campaign.id);
    const baseline = await readRequiredManifest(join(base, "baseline.json"));
    if (baseline.projectId !== project.id.value || baseline.campaignId !== campaign.id) throw new Error("Orchestration workspace identity mismatch.");
    if (campaign.workspaceMode === "direct") return { logicalRoot: project.root, physicalRoot: project.root, baseline, excludedPaths: [] };
    const metadata = JSON.parse(await readFile(join(base, "metadata.json"), "utf8")) as { readonly excludedPaths?: readonly string[] };
    return { logicalRoot: project.root, physicalRoot: join(base, "root"), baseline, excludedPaths: [...(metadata.excludedPaths ?? [])] };
  }

  public async verifyResume(project: Project, campaign: OrchestrationCampaign): Promise<void> {
    const prepared = await this.open(project, campaign);
    const current = await manifest(project.root, project, campaign);
    if (current.fingerprint !== prepared.baseline.fingerprint) {
      throw new Error("The real Project changed after the campaign preview; create a new preview before continuing.");
    }
  }

  public async changes(project: Project, campaign: OrchestrationCampaign): Promise<WorkspaceChanges> {
    const root = campaign.workspaceMode === "direct" ? project.root : join(this.campaignDir(campaign.id), "root");
    const baseline = campaign.workspaceMode === "direct"
      ? await readRequiredManifest(join(this.campaignDir(campaign.id), "baseline.json"))
      : await readRequiredManifest(join(this.campaignDir(campaign.id), "baseline.json"));
    const current = await manifest(root, project, campaign);
    return compare(campaign.id, baseline, current, root);
  }

  public async apply(project: Project, campaign: OrchestrationCampaign, expectedFingerprint: string, validate?: () => Promise<void>): Promise<WorkspaceChanges> {
    if (campaign.workspaceMode !== "isolated") throw new Error("Only an isolated campaign has pending changes to apply.");
    const base = this.campaignDir(campaign.id);
    const mirror = join(base, "root");
    const baseline = await readRequiredManifest(join(base, "baseline.json"));
    const current = await manifest(mirror, project, campaign);
    const changes = compare(campaign.id, baseline, current, mirror);
    if (changes.fingerprint !== expectedFingerprint) throw new Error("The workspace changes changed before confirmation.");
    const live = await manifest(project.root, project, campaign);
    const conflict = firstManifestConflict(baseline, live);
    if (conflict !== undefined) throw new Error(`Conflict: ${conflict} changed in the real Project after the isolated workspace was created.`);
    const backup = join(base, "backup");
    await rm(backup, { recursive: true, force: true });
    await mkdir(backup, { recursive: true, mode: 0o700 });
    const applied: WorkspaceChange[] = [];
    try {
      for (const path of new Set(changes.changes.flatMap(changePaths))) await backupExisting(project.root, backup, path);
      for (const change of changes.changes) {
        assertInsideScope(change.path, campaign.scopePaths);
        if (change.previousPath !== undefined) assertInsideScope(change.previousPath, campaign.scopePaths);
        const target = safeJoin(project.root, change.path);
        const source = safeJoin(mirror, change.path);
        if (change.kind === "deleted") await unlink(target);
        else {
          await atomicCopy(source, target);
          if (change.kind === "renamed") await unlink(safeJoin(project.root, change.previousPath!));
        }
        applied.push(change);
      }
      if (validate !== undefined) await validate();
    } catch (error) {
      await rollback(project.root, backup, applied);
      throw error;
    }
    return changes;
  }

  public async discard(_project: Project, campaign: OrchestrationCampaign): Promise<void> {
    if (campaign.workspaceMode === "isolated") await rm(this.campaignDir(campaign.id), { recursive: true, force: true });
  }

  public async cleanupExpired(campaigns: readonly OrchestrationCampaign[], now: Date): Promise<void> {
    await Promise.all(campaigns
      .filter((campaign) => campaign.status === "cancelled" && now.getTime() - campaign.updatedAt.getTime() >= CANCELLED_RETENTION_MS)
      .map((campaign) => rm(this.campaignDir(campaign.id), { recursive: true, force: true })));
  }

  public async snapshotDirectBaseline(project: Project, campaign: OrchestrationCampaign): Promise<void> {
    const base = this.campaignDir(campaign.id);
    await mkdir(base, { recursive: true, mode: 0o700 });
    await writePrivateJson(join(base, "baseline.json"), await manifest(project.root, project, campaign));
  }

  private campaignDir(campaignId: string): string { return join(this.homeDir, ".arka-norn", "orchestration", "workspaces", campaignId); }
}

async function copyTree(sourceRoot: string, targetRoot: string, rel: string, excludedPaths: string[], count: { files: number; bytes: number }): Promise<void> {
  for (const entry of await readdir(join(sourceRoot, rel), { withFileTypes: true })) {
    const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (isExcluded(childRel, entry.name, entry.isDirectory())) { excludedPaths.push(childRel); continue; }
    const source = safeJoin(sourceRoot, childRel);
    const target = safeJoin(targetRoot, childRel);
    const info = await lstat(source);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) { excludedPaths.push(childRel); continue; }
    if (info.isDirectory()) { await mkdir(target, { recursive: true, mode: info.mode & 0o777 }); await copyTree(sourceRoot, targetRoot, childRel, excludedPaths, count); continue; }
    count.files += 1; count.bytes += info.size;
    if (count.files > MAX_FILES || count.bytes > MAX_TOTAL_BYTES || info.size > MAX_FILE_BYTES) throw new Error("Project exceeds the isolated workspace limits.");
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target, constants.COPYFILE_EXCL);
    await chmod(target, info.mode & 0o777);
  }
}

function isExcluded(rel: string, name: string, directory: boolean): boolean {
  if (rel === ".arka-norn" || rel.startsWith(`.arka-norn/`)) return true;
  if (directory && EXCLUDED_DIRS.has(name)) return true;
  return !directory && SECRET_FILE.test(name) && name !== ".env.example";
}

async function manifest(root: string, project: Project, campaign: OrchestrationCampaign): Promise<WorkspaceManifest> {
  const files: WorkspaceFileRecord[] = [];
  await walkManifest(root, "", files);
  files.sort((left, right) => left.path.localeCompare(right.path));
  const fingerprint = hash(JSON.stringify(files));
  return { schemaVersion: 1, projectId: project.id.value, campaignId: campaign.id, files, fingerprint };
}

async function walkManifest(root: string, rel: string, files: WorkspaceFileRecord[]): Promise<void> {
  if (files.length > MAX_FILES) throw new Error("Workspace contains too many files.");
  for (const entry of await readdir(join(root, rel), { withFileTypes: true })) {
    const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (isExcluded(childRel, entry.name, entry.isDirectory())) continue;
    const path = safeJoin(root, childRel);
    const info = await lstat(path);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) continue;
    if (info.isDirectory()) await walkManifest(root, childRel, files);
    else files.push({ path: childRel, size: info.size, mode: info.mode & 0o777, hash: hash(await readFile(path)) });
  }
}

function compare(campaignId: string, before: WorkspaceManifest, after: WorkspaceManifest, root: string): WorkspaceChanges {
  const oldFiles = new Map(before.files.map((file) => [file.path, file]));
  const newFiles = new Map(after.files.map((file) => [file.path, file]));
  const paths = [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort();
  const raw = paths.flatMap((path): WorkspaceChange[] => {
    const oldFile = oldFiles.get(path); const newFile = newFiles.get(path);
    if (oldFile === undefined && newFile !== undefined) return [{ path, kind: "created", size: newFile.size, binary: binaryFile(join(root, path)) }];
    if (oldFile !== undefined && newFile === undefined) return [{ path, kind: "deleted", size: oldFile.size, binary: false }];
    if (oldFile !== undefined && newFile !== undefined && (oldFile.hash !== newFile.hash || oldFile.mode !== newFile.mode)) return [{ path, kind: "modified", size: newFile.size, binary: binaryFile(join(root, path)) }];
    return [];
  });
  const deleted = raw.filter((change) => change.kind === "deleted");
  const consumed = new Set<string>();
  const changes = raw.flatMap((change): WorkspaceChange[] => {
    if (change.kind === "deleted" && consumed.has(change.path)) return [];
    if (change.kind !== "created") return [change];
    const createdFile = newFiles.get(change.path)!;
    const source = deleted.find((candidate) => !consumed.has(candidate.path) && sameFile(oldFiles.get(candidate.path), createdFile));
    if (source === undefined) return [change];
    consumed.add(source.path);
    return [{ ...change, kind: "renamed", previousPath: source.path }];
  }).filter((change) => change.kind !== "deleted" || !consumed.has(change.path));
  return { campaignId, changes, fingerprint: hash(JSON.stringify(changes)) };
}

function sameFile(left: WorkspaceFileRecord | undefined, right: WorkspaceFileRecord | undefined): boolean { return left !== undefined && right !== undefined && left.hash === right.hash && left.mode === right.mode; }

function firstManifestConflict(before: WorkspaceManifest, after: WorkspaceManifest): string | undefined {
  if (before.fingerprint === after.fingerprint) return undefined;
  const oldFiles = new Map(before.files.map((file) => [file.path, file]));
  const newFiles = new Map(after.files.map((file) => [file.path, file]));
  return [...new Set([...oldFiles.keys(), ...newFiles.keys()])].sort().find((path) => {
    const oldFile = oldFiles.get(path); const newFile = newFiles.get(path);
    return oldFile === undefined || newFile === undefined || oldFile.hash !== newFile.hash || oldFile.mode !== newFile.mode || oldFile.size !== newFile.size;
  }) ?? "the workspace baseline";
}

function binaryFile(path: string): boolean { return /\.(?:png|jpe?g|gif|webp|pdf|zip|gz|tgz|woff2?|ico)$/iu.test(path); }

async function atomicCopy(source: string, target: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const temp = `${target}.norn-${process.pid}.tmp`;
  await copyFile(source, temp);
  await chmod(temp, (await stat(source)).mode & 0o777);
  await rename(temp, target);
}

async function backupExisting(root: string, backup: string, path: string): Promise<void> {
  const target = safeJoin(root, path);
  if (!(await exists(target))) return;
  const saved = safeJoin(backup, path);
  await mkdir(dirname(saved), { recursive: true });
  await copyFile(target, saved, constants.COPYFILE_EXCL);
}

async function rollback(root: string, backup: string, changes: readonly WorkspaceChange[]): Promise<void> {
  for (const change of [...changes].reverse()) {
    for (const path of [...changePaths(change)].reverse()) {
      const target = safeJoin(root, path); const saved = safeJoin(backup, path);
      if (await exists(saved)) await atomicCopy(saved, target);
      else await rm(target, { force: true });
    }
  }
}

function changePaths(change: WorkspaceChange): readonly string[] { return change.previousPath === undefined ? [change.path] : [change.previousPath, change.path]; }

function assertInsideScope(path: string, scopes: readonly string[]): void {
  if (!scopes.some((scope) => scope === "." || path === scope || path.startsWith(`${scope}/`))) throw new Error(`Change outside confirmed scope: ${path}`);
}

function safeJoin(root: string, rel: string): string {
  if (rel === "" || rel.startsWith("/") || rel.split("/").includes("..")) throw new Error("Unsafe workspace path.");
  const target = resolve(root, rel); const prefix = resolve(root) + sep;
  if (!target.startsWith(prefix)) throw new Error("Workspace path escapes its root.");
  return target;
}

async function readRequiredManifest(path: string): Promise<WorkspaceManifest> { return JSON.parse(await readFile(path, "utf8")) as WorkspaceManifest; }
async function writePrivateJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true, mode: 0o700 }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 }); }
async function exists(path: string): Promise<boolean> { try { await access(path); return true; } catch { return false; } }
function hash(value: string | Buffer): string { return createHash("sha256").update(value).digest("hex"); }
