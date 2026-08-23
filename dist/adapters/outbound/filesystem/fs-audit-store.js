/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import * as fs from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { readJson, readRaw, writeFileAtomic, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
const AUDIT_ID_PATTERN = /^audit-[0-9]{8}t[0-9]{6}z-[a-f0-9]{8}$/;
export class FsAuditStore {
    root;
    constructor(projectRoot) {
        this.root = join(projectRoot, ".arka-norn", "audits");
    }
    async withRunLock(auditId, operation) {
        validateAuditId(auditId);
        return withFileLock(join(this.auditDirectory(auditId), "run-state"), operation, { timeoutMs: 10_000, staleMs: 3_600_000 });
    }
    async initialize() {
        await fs.mkdir(this.root, { recursive: true, mode: 0o700 });
        await writeFileAtomic(join(this.root, ".gitignore"), "*\n!.gitignore\n", { mode: 0o600 });
        if (await readJson(join(this.root, "index.json")) === undefined) {
            await writeJsonAtomic(join(this.root, "index.json"), { schemaVersion: 1, audits: [] }, { mode: 0o600 });
        }
        if (await readJson(join(this.root, "kb", "index.json")) === undefined) {
            await writeJsonAtomic(join(this.root, "kb", "index.json"), { schemaVersion: 1, records: [] }, { mode: 0o600 });
        }
    }
    async saveRun(run) {
        validateAuditId(run.id);
        await this.initialize();
        await writeJsonAtomic(join(this.auditDirectory(run.id), "manifest.json"), run, { mode: 0o600 });
        await writeJsonAtomic(join(this.auditDirectory(run.id), "status.json"), {
            schemaVersion: 1, id: run.id, status: run.status, updatedAt: run.updatedAt, moduleStatuses: run.moduleStatuses, attempts: run.attempts,
        }, { mode: 0o600 });
        const latestAttempt = run.attempts.at(-1);
        if (latestAttempt !== undefined)
            await writeJsonAtomic(join(this.auditDirectory(run.id), "attempts", `${latestAttempt.number}.json`), latestAttempt, { mode: 0o600 });
        const entry = {
            id: run.id,
            projectId: run.projectId,
            status: run.status,
            mode: run.request.mode,
            createdAt: run.createdAt,
            updatedAt: run.updatedAt,
            commitExact: run.inspection.commitExact,
        };
        await withFileLock(join(this.root, "index.json"), async () => {
            const index = await this.readIndex();
            const entries = [...index.audits.filter((candidate) => candidate.id !== run.id), entry]
                .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
            await writeJsonAtomic(join(this.root, "index.json"), { schemaVersion: 1, audits: entries }, { mode: 0o600 });
        });
    }
    async loadRun(auditId) {
        validateAuditId(auditId);
        return readJson(join(this.auditDirectory(auditId), "manifest.json"));
    }
    async listRuns() {
        await this.initialize();
        return (await this.readIndex()).audits;
    }
    async saveModuleResult(result) {
        validateAuditId(result.auditId);
        await writeJsonAtomic(join(this.auditDirectory(result.auditId), "modules", `${result.moduleId}.json`), result, { mode: 0o600 });
        for (const evidence of result.evidence) {
            await writeJsonAtomic(join(this.auditDirectory(result.auditId), "evidence", `${safeId(evidence.id)}.json`), evidence, { mode: 0o600 });
        }
    }
    async loadModuleResult(auditId, moduleId) {
        validateAuditId(auditId);
        return readJson(join(this.auditDirectory(auditId), "modules", `${moduleId}.json`));
    }
    async loadModuleResults(auditId) {
        validateAuditId(auditId);
        const directory = join(this.auditDirectory(auditId), "modules");
        const names = await fs.readdir(directory).catch((error) => isNodeError(error, "ENOENT") ? [] : Promise.reject(asError(error)));
        const results = [];
        for (const name of names.sort()) {
            if (!/^M[0-9]{2}\.json$/.test(name))
                continue;
            const value = await readJson(join(directory, name));
            if (value !== undefined)
                results.push(value);
        }
        return results;
    }
    async saveCanonical(audit) {
        validateAuditId(audit.auditId);
        await writeJsonAtomic(join(this.auditDirectory(audit.auditId), "audit.json"), audit, { mode: 0o600 });
    }
    async loadCanonical(auditId) {
        validateAuditId(auditId);
        return readJson(join(this.auditDirectory(auditId), "audit.json"));
    }
    async saveReport(auditId, report) {
        validateAuditId(auditId);
        const target = join(this.auditDirectory(auditId), "report.md");
        await writeFileAtomic(target, report, { mode: 0o600 });
        return target;
    }
    async loadReport(auditId) {
        validateAuditId(auditId);
        return readRaw(join(this.auditDirectory(auditId), "report.md"));
    }
    async loadEvidence(auditId, evidenceId) {
        validateAuditId(auditId);
        return readJson(join(this.auditDirectory(auditId), "evidence", `${safeId(evidenceId)}.json`));
    }
    async saveKbRecords(records) {
        await this.initialize();
        await withFileLock(join(this.root, "kb", "index.json"), async () => {
            const current = await this.readKb();
            const byId = new Map(current.records.map((record) => [record.id, record]));
            for (const record of records)
                byId.set(record.id, record);
            const merged = [...byId.values()].sort((left, right) => right.observedAt.localeCompare(left.observedAt));
            await writeJsonAtomic(join(this.root, "kb", "index.json"), { schemaVersion: 1, records: merged }, { mode: 0o600 });
        });
        for (const record of records) {
            await writeJsonAtomic(join(this.root, "kb", "records", `${safeId(record.id)}.json`), record, { mode: 0o600 });
        }
    }
    async searchKb(filters) {
        const index = await this.readKb();
        return index.records.filter((record) => Object.entries(filters).every(([key, value]) => {
            const candidate = record[key];
            return candidate !== null && String(candidate).toLowerCase().includes(value.toLowerCase());
        }));
    }
    async exportAudit(auditId, targetDirectory, includeEvidence) {
        validateAuditId(auditId);
        const destination = resolve(targetDirectory);
        await fs.mkdir(destination, { recursive: true });
        const exported = [];
        for (const name of ["report.md", "audit.json"]) {
            const source = join(this.auditDirectory(auditId), name);
            const content = await readRaw(source);
            if (content === undefined)
                continue;
            const target = join(destination, name);
            await writeFileAtomic(target, content, { mode: 0o600, exclusive: true });
            exported.push(target);
        }
        if (includeEvidence) {
            const evidenceDirectory = join(this.auditDirectory(auditId), "evidence");
            const names = await fs.readdir(evidenceDirectory).catch((error) => isNodeError(error, "ENOENT") ? [] : Promise.reject(asError(error)));
            for (const name of names) {
                const content = await readRaw(join(evidenceDirectory, name));
                if (content === undefined || /"classification"\s*:\s*"sensitive"/.test(content))
                    continue;
                const target = join(destination, "evidence", basename(name));
                await writeFileAtomic(target, content, { mode: 0o600, exclusive: true });
                exported.push(target);
            }
        }
        return exported;
    }
    auditDirectory(auditId) {
        validateAuditId(auditId);
        return join(this.root, auditId);
    }
    async readIndex() {
        return await readJson(join(this.root, "index.json")) ?? { schemaVersion: 1, audits: [] };
    }
    async readKb() {
        await this.initialize();
        return await readJson(join(this.root, "kb", "index.json")) ?? { schemaVersion: 1, records: [] };
    }
}
function validateAuditId(value) {
    if (!AUDIT_ID_PATTERN.test(value))
        throw new Error("Invalid audit id");
}
function safeId(value) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))
        throw new Error("Invalid audit artifact id");
    return value.replaceAll(":", "-");
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
function asError(error) {
    return error instanceof Error ? error : new Error(String(error));
}
//# sourceMappingURL=fs-audit-store.js.map