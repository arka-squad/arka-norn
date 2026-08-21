/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import * as fs from "node:fs/promises";
import { basename, join } from "node:path";
import { isFeatureMarkerV2, isFeatureMarkerV3, isProjectMarkerV2, isProjectMarkerV3, isProjectMarkerV4 } from "../../../domain/shared/marker-formats.js";
import { readRaw, writeJsonAtomic } from "./_shared/atomic-json.js";
import { inspectFileLock, repairAbandonedFileLock } from "./_shared/file-lock.js";
import { isFeatureIndexFile, isIndexFile, isProjectIndexFile } from "./_shared/index-codec.js";
import { FsAgentHealthInspector } from "./fs-agent-health-inspector.js";
import { FsAuditTrail } from "./fs-audit-trail.js";
export class FsDoctor {
    home;
    agents;
    constructor(homeDir, targetDir) {
        this.home = homeDir;
        this.agents = new FsAgentHealthInspector(homeDir, targetDir);
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
        const [projectMarkers, featureMarkers, agentRegistries, agentSession, projectContext, locks, audit] = await Promise.all([
            this.inspectMarkers("projects"),
            this.inspectMarkers("features"),
            this.agents.inspectRegistries(),
            this.agents.inspectSession(),
            this.agents.inspectProjectContext(),
            this.inspectLocks(repair, apply),
            this.inspectAudit(),
        ]);
        return [projectMarkers, featureMarkers, agentRegistries, agentSession, projectContext, ...locks, audit];
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
            const current = isProjectMarkerV4(marker) && marker.id === entry.id;
            const transitional = isProjectMarkerV3(marker) && marker.id === entry.id;
            const legacy = isProjectMarkerV2(marker) && marker.id === entry.id && marker.root === entry.root;
            return current || transitional || legacy ? undefined : `${entry.id}@${entry.root}`;
        }))).filter((failure) => failure !== undefined);
        return markerInspection("projects", entries.length, failures);
    }
    async inspectFeatureMarkers(entries) {
        const failures = (await Promise.all(entries.map(async (entry) => {
            const marker = await readJsonUnknown(join(entry.root, ".arka-norn", "feature.json"));
            const current = isFeatureMarkerV3(marker) && marker.id === entry.id && marker.projectId === entry.projectId;
            const legacy = isFeatureMarkerV2(marker) && marker.id === entry.id && marker.projectId === entry.projectId && marker.root === entry.root;
            return current || legacy
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