import * as fs from "node:fs/promises";
import { basename, join } from "node:path";
import { isFeatureMarkerV2, isProjectMarkerV2 } from "../../../domain/shared/marker-formats.js";
import { readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { inspectFileLock, repairAbandonedFileLock } from "./_shared/file-lock.js";
import { isFeatureIndexFile, isIndexFile, isProjectIndexFile } from "./_shared/index-codec.js";
import { FsAuditTrail } from "./fs-audit-trail.js";
import { FsProjectStore } from "./fs-project-store.js";
import { FsAgentRegistryStore, agentRegistryPath } from "./fs-agent-registry-store.js";
import { isAgentSessionFile } from "./fs-agent-session-store.js";
export class FsDoctor {
    home;
    constructor(homeDir) {
        this.home = homeDir;
    }
    async inspectIndex(kind, repair, apply) {
        const target = join(this.home, ".arka-norn", "index", `${kind}.json`);
        let raw;
        try {
            raw = await readRaw(target);
        }
        catch (error) {
            return this.invalidIndex(kind, target, error instanceof Error ? error.message : String(error), repair, apply);
        }
        if (raw === undefined) {
            return { check: { id: `index.${kind}`, status: "warn", message: "index absent; it will be created on first use", repairable: false } };
        }
        try {
            const value = JSON.parse(raw);
            if (!isIndexFile(kind, value))
                return this.invalidIndex(kind, target, "schema invalid", repair, apply);
            const mode = (await fs.stat(target)).mode & 0o777;
            if (process.platform !== "win32" && mode !== 0o600) {
                if (repair && apply)
                    await fs.chmod(target, 0o600);
                return {
                    check: { id: `index.${kind}`, status: repair && apply ? "pass" : "warn", message: repair && apply ? "permissions repaired to 0600" : `permissions are ${mode.toString(8)} instead of 600`, repairable: true },
                    ...(repair ? { repair: { target, action: "chmod_0600", applied: apply } } : {}),
                };
            }
            return { check: { id: `index.${kind}`, status: "pass", message: "index valid and private", repairable: false } };
        }
        catch (error) {
            return this.invalidIndex(kind, target, error instanceof Error ? error.message : String(error), repair, apply);
        }
    }
    async inspectRuntime(repair, apply) {
        const [projectMarkers, featureMarkers, agentRegistries, agentSession, locks, audit] = await Promise.all([
            this.inspectMarkers("projects"),
            this.inspectMarkers("features"),
            this.inspectAgentRegistries(),
            this.inspectAgentSession(),
            this.inspectLocks(repair, apply),
            this.inspectAudit(),
        ]);
        return [projectMarkers, featureMarkers, agentRegistries, agentSession, ...locks, audit];
    }
    async inspectAgentSession() {
        const target = join(this.home, ".arka-norn", "context", "agents.json");
        const raw = await readRaw(target).catch((error) => error instanceof Error ? error : new Error(String(error)));
        if (raw instanceof Error)
            return { check: { id: "agents.session", status: "fail", message: raw.message, repairable: false } };
        if (raw === undefined)
            return { check: { id: "agents.session", status: "pass", message: "no local agent selection yet", repairable: false } };
        try {
            const value = JSON.parse(raw);
            if (!isAgentSessionFile(value))
                return { check: { id: "agents.session", status: "fail", message: "local agent selection schema invalid", repairable: false } };
            const mode = (await fs.stat(target)).mode & 0o777;
            if (process.platform !== "win32" && mode !== 0o600) {
                return { check: { id: "agents.session", status: "warn", message: `permissions are ${mode.toString(8)} instead of 600`, repairable: false } };
            }
            return { check: { id: "agents.session", status: "pass", message: `${Object.keys(value.selectedByProject).length} local project selection(s) valid`, repairable: false } };
        }
        catch (error) {
            return { check: { id: "agents.session", status: "fail", message: error instanceof Error ? error.message : String(error), repairable: false } };
        }
    }
    async inspectAgentRegistries() {
        const target = join(this.home, ".arka-norn", "index", "projects.json");
        const raw = await readRaw(target).catch(() => undefined);
        if (raw === undefined) {
            return { check: { id: "agents.registries", status: "warn", message: "project index absent; no agent registry to verify", repairable: false } };
        }
        let value;
        try {
            value = JSON.parse(raw);
        }
        catch {
            return { check: { id: "agents.registries", status: "fail", message: "project index invalid; agent registries cannot be verified", repairable: false } };
        }
        if (!isProjectIndexFile(value)) {
            return { check: { id: "agents.registries", status: "fail", message: "project index invalid; agent registries cannot be verified", repairable: false } };
        }
        const projectStore = new FsProjectStore();
        const registryStore = new FsAgentRegistryStore();
        const inspections = await Promise.all(value.entries.map(async (entry) => {
            if (await readRaw(agentRegistryPath(entry.root)).catch(() => undefined) === undefined)
                return { id: entry.id, status: "missing" };
            try {
                const project = await projectStore.load(entry.root);
                const agents = await registryStore.load(project);
                return { id: entry.id, status: "valid", active: agents.filter((agent) => agent.active).length };
            }
            catch (error) {
                return { id: entry.id, status: "invalid", reason: error instanceof Error ? error.message : String(error) };
            }
        }));
        const invalid = inspections.filter((item) => item.status === "invalid");
        if (invalid.length > 0) {
            return { check: { id: "agents.registries", status: "fail", message: `${invalid.length}/${inspections.length} invalid agent registry: ${invalid.map((item) => item.id).slice(0, 3).join(", ")}`, repairable: false } };
        }
        const missing = inspections.filter((item) => item.status === "missing");
        if (missing.length > 0) {
            return { check: { id: "agents.registries", status: "warn", message: `${missing.length}/${inspections.length} project(s) without an agent registry; register an identity before producing`, repairable: false } };
        }
        const active = inspections.reduce((sum, item) => sum + ("active" in item ? item.active : 0), 0);
        return { check: { id: "agents.registries", status: "pass", message: `${inspections.length}/${inspections.length} registry file(s) valid, ${active} active agent(s)`, repairable: false } };
    }
    async inspectMarkers(kind) {
        const target = join(this.home, ".arka-norn", "index", `${kind}.json`);
        const raw = await readRaw(target).catch((error) => {
            return error instanceof Error ? error : new Error(String(error));
        });
        if (raw instanceof Error) {
            return { check: { id: `markers.${kind}`, status: "fail", message: `index unreadable: ${raw.message}`, repairable: false } };
        }
        if (raw === undefined) {
            return { check: { id: `markers.${kind}`, status: "warn", message: "index absent; no marker references to verify", repairable: false } };
        }
        let value;
        try {
            value = JSON.parse(raw);
        }
        catch {
            return { check: { id: `markers.${kind}`, status: "fail", message: "index invalid; marker integrity cannot be verified", repairable: false } };
        }
        if (kind === "projects" && isProjectIndexFile(value))
            return this.inspectProjectMarkers(value.entries);
        if (kind === "features" && isFeatureIndexFile(value))
            return this.inspectFeatureMarkers(value.entries);
        return { check: { id: `markers.${kind}`, status: "fail", message: "index invalid; marker integrity cannot be verified", repairable: false } };
    }
    async inspectProjectMarkers(entries) {
        const failures = (await Promise.all(entries.map(async (entry) => {
            const marker = await readJsonUnknown(join(entry.root, ".arka-norn", "project.json"));
            return isProjectMarkerV2(marker) && marker.id === entry.id && marker.root === entry.root ? undefined : `${entry.id}@${entry.root}`;
        }))).filter((failure) => failure !== undefined);
        return markerInspection("projects", entries.length, failures);
    }
    async inspectFeatureMarkers(entries) {
        const failures = (await Promise.all(entries.map(async (entry) => {
            const marker = await readJsonUnknown(join(entry.root, ".arka-norn", "feature.json"));
            return isFeatureMarkerV2(marker) && marker.id === entry.id && marker.projectId === entry.projectId && marker.root === entry.root
                ? undefined
                : `${entry.id}@${entry.root}`;
        }))).filter((failure) => failure !== undefined);
        return markerInspection("features", entries.length, failures);
    }
    async inspectLocks(repair, apply) {
        const indexDir = join(this.home, ".arka-norn", "index");
        const entries = await fs.readdir(indexDir).catch((error) => {
            if (isNodeError(error, "ENOENT"))
                return [];
            throw error;
        });
        const locks = entries.filter((entry) => entry.endsWith(".lock")).map((entry) => join(indexDir, entry));
        if (locks.length === 0) {
            return [{ check: { id: "locks", status: "pass", message: "no active or abandoned index locks", repairable: false } }];
        }
        return Promise.all(locks.map(async (lockPath) => {
            const inspection = await inspectFileLock(lockPath);
            if (inspection.status === "abandoned") {
                const applied = repair && apply ? await repairAbandonedFileLock(lockPath) : false;
                return {
                    check: {
                        id: `lock.${basename(lockPath)}`,
                        status: applied ? "pass" : "fail",
                        message: applied ? "abandoned lock removed" : `abandoned lock (${Math.round(inspection.ageMs ?? 0)}ms old)`,
                        repairable: true,
                    },
                    ...(repair ? { repair: { target: lockPath, action: "remove_abandoned_lock", applied } } : {}),
                };
            }
            if (inspection.status === "invalid") {
                return { check: { id: `lock.${basename(lockPath)}`, status: "fail", message: "lock metadata invalid; manual review required", repairable: false } };
            }
            return { check: { id: `lock.${basename(lockPath)}`, status: "warn", message: `active lock owned by pid ${inspection.ownerPid ?? "unknown"}`, repairable: false } };
        }));
    }
    async inspectAudit() {
        const health = await new FsAuditTrail(this.home).inspect();
        return { check: { id: "audit.trail", status: health.ok ? "pass" : "fail", message: health.message, repairable: false } };
    }
    async invalidIndex(kind, target, reason, repair, apply) {
        let backupPath;
        if (repair && apply) {
            const backupDir = join(this.home, ".arka-norn", "backups");
            await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });
            backupPath = join(backupDir, `${kind}-${Date.now()}-corrupt.json`);
            await fs.copyFile(target, backupPath, fs.constants.COPYFILE_EXCL);
            await fs.chmod(backupPath, 0o600);
            await writeJsonAtomic(target, { schemaVersion: 2, entries: [] }, { mode: 0o600 });
        }
        return {
            check: {
                id: `index.${kind}`,
                status: repair && apply ? "pass" : "fail",
                message: repair && apply ? `corrupt index isolated and reset (${reason})` : `corrupt index (${reason})`,
                repairable: true,
            },
            ...(repair ? { repair: { target, action: "backup_and_reset", applied: apply, ...(backupPath === undefined ? {} : { backupPath }) } } : {}),
        };
    }
}
function markerInspection(kind, total, failures) {
    return failures.length === 0
        ? { check: { id: `markers.${kind}`, status: "pass", message: `${total}/${total} indexed marker(s) valid`, repairable: false } }
        : { check: { id: `markers.${kind}`, status: "fail", message: `${failures.length}/${total} invalid or missing marker(s): ${failures.slice(0, 3).join(", ")}`, repairable: false } };
}
async function readJsonUnknown(path) {
    try {
        const raw = await readRaw(path);
        return raw === undefined ? undefined : JSON.parse(raw);
    }
    catch {
        return undefined;
    }
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-doctor.js.map