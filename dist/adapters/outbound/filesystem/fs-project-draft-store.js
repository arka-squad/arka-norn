/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { createProjectDraft, parseProjectDraft, } from "../../../domain/project/project-draft.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
const execFileAsync = promisify(execFile);
export class FsProjectDraftStore {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async resolve(input) {
        const identity = await inspectRoot(input.root);
        return withFileLock(join(storeRoot(this.homeDir), "store"), async () => {
            const drafts = await this.listUnlocked();
            const sameRoot = drafts.find((draft) => draft.root === identity.canonicalRoot);
            if (sameRoot !== undefined) {
                assertCurrentRoot(sameRoot, identity);
                if (sameRoot.materialization === "recovery_required") {
                    throw new Error(`ProjectDraft ${sameRoot.id} requires recovery before it can be resumed.`);
                }
                return { draft: sameRoot, resumed: true };
            }
            const collision = drafts.find((draft) => draft.id === input.id);
            if (collision !== undefined) {
                throw new Error(`ProjectDraft identifier collision: ${input.id} already refers to ${collision.root}.`);
            }
            const timestamp = validTimestamp(input.now);
            const draft = createProjectDraft({
                id: input.id,
                name: input.name,
                root: identity.canonicalRoot,
                createdAt: timestamp,
                updatedAt: timestamp,
                rootFingerprint: identity.fingerprint,
            });
            await writeJsonAtomic(draftPath(this.homeDir, draft.id), draft, { mode: 0o600, exclusive: true });
            return { draft, resumed: false };
        });
    }
    async load(id) {
        validateIdentifier(id);
        const value = await readJson(draftPath(this.homeDir, id));
        return value === undefined ? undefined : parseProjectDraft(value);
    }
    async list() {
        return this.listUnlocked();
    }
    async verify(id) {
        const draft = await this.load(id);
        if (draft === undefined)
            throw new Error(`ProjectDraft not found: ${id}.`);
        const identity = await inspectRoot(draft.root).catch((error) => {
            if (isNodeError(error, "ENOENT"))
                throw new Error(`ProjectDraft root moved or disappeared: ${draft.root}.`);
            throw error;
        });
        assertCurrentRoot(draft, identity);
        return draft;
    }
    async setMaterialization(input) {
        return withFileLock(draftPath(this.homeDir, input.id), async () => {
            const draft = await this.load(input.id);
            if (draft === undefined)
                throw new Error(`ProjectDraft not found: ${input.id}.`);
            if (draft.rootFingerprint !== input.expectedRootFingerprint)
                throw new Error(`ProjectDraft ${input.id} changed before materialization.`);
            const next = parseProjectDraft({ ...draft, materialization: input.materialization, updatedAt: validTimestamp(input.now) });
            await writeJsonAtomic(draftPath(this.homeDir, input.id), next, { mode: 0o600 });
            return next;
        });
    }
    async listUnlocked() {
        let entries;
        try {
            entries = await fs.readdir(storeRoot(this.homeDir), { withFileTypes: true });
        }
        catch (error) {
            if (isNodeError(error, "ENOENT"))
                return [];
            throw error;
        }
        const drafts = [];
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            if (!entry.isDirectory() || !isSafeIdentifier(entry.name))
                continue;
            const draft = await this.load(entry.name);
            if (draft !== undefined)
                drafts.push(draft);
        }
        return drafts.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.id.localeCompare(right.id));
    }
}
async function inspectRoot(candidate) {
    const requested = resolve(candidate);
    const link = await fs.lstat(requested);
    if (!link.isDirectory() || link.isSymbolicLink())
        throw new Error(`ProjectDraft root must be a real directory: ${candidate}.`);
    const canonicalRoot = await fs.realpath(requested);
    const stat = await fs.stat(canonicalRoot, { bigint: true });
    const gitRoot = await findGitRoot(canonicalRoot);
    const identity = { canonicalRoot, volume: String(stat.dev), inode: String(stat.ino), gitRoot };
    return { ...identity, fingerprint: createHash("sha256").update(JSON.stringify(identity)).digest("hex") };
}
async function findGitRoot(root) {
    try {
        const result = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "rev-parse", "--show-toplevel"], {
            cwd: root,
            env: { PATH: "/usr/bin:/bin:/usr/local/bin", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
            encoding: "utf8",
            timeout: 5_000,
        });
        return await fs.realpath(result.stdout.trim());
    }
    catch {
        return null;
    }
}
function assertCurrentRoot(draft, identity) {
    if (draft.root !== identity.canonicalRoot)
        throw new Error(`ProjectDraft root moved: ${draft.root} is now ${identity.canonicalRoot}.`);
    if (draft.rootFingerprint !== identity.fingerprint) {
        throw new Error(`ProjectDraft root identity changed for ${draft.root}; the volume, inode or Git root no longer matches.`);
    }
}
function storeRoot(homeDir) {
    return join(homeDir, ".arka-norn", "framing-projects");
}
function draftPath(homeDir, id) {
    validateIdentifier(id);
    return join(storeRoot(homeDir), id, "draft.json");
}
function validateIdentifier(value) {
    if (!isSafeIdentifier(value))
        throw new Error("Invalid ProjectDraft identifier.");
}
function isSafeIdentifier(value) {
    return /^[a-z0-9][a-z0-9-]{0,63}$/u.test(value) && basename(value) === value;
}
function validTimestamp(value) {
    if (Number.isNaN(value.getTime()))
        throw new Error("Invalid ProjectDraft timestamp.");
    return value.toISOString();
}
function isNodeError(error, code) {
    return error instanceof Error && "code" in error && error.code === code;
}
//# sourceMappingURL=fs-project-draft-store.js.map