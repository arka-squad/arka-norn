/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { lstat, mkdir, readFile, realpath, writeFile } from "node:fs/promises";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const SECRET_FILE = /^(?:\.env(?:\..+)?|\.npmrc|\.pypirc|auth\.json|.*\.(?:pem|key|p12|pfx)|id_rsa|credentials(?:\.json)?|secrets?(?:\.json|\.ya?ml)?)$/iu;
const SECRET_CONTENT = /\b(?:sk|ghp|github_pat|xox[baprs]|npm)_[A-Za-z0-9_-]{8,}\b|(?:password|token|secret|api[_-]?key)\s*[:=]\s*["']?[A-Za-z0-9_./+-]{12,}/giu;
export class GitWorktreeWorkspaceAdapter {
    homeDir;
    gitCommand;
    worktreeRoot;
    gitHome;
    mutationTail = Promise.resolve();
    constructor(homeDir, options = {}) {
        this.homeDir = homeDir;
        this.gitCommand = options.gitCommand ?? "git";
        if (this.gitCommand !== "git" && !isAbsolute(this.gitCommand))
            throw new TypeError("Configured Git command must be absolute.");
        this.worktreeRoot = join(homeDir, ".arka-norn", "worktrees");
        this.gitHome = join(homeDir, ".arka-norn", "git-home");
    }
    async createSnapshot(project, input) {
        validateId(input.campaignId, "campaign id");
        validateScopes(input.includeScopes);
        validateScopes(input.declaredUntracked, true);
        const root = await this.assertRepository(project);
        await this.assertSafeRepository(root);
        const head = (await this.git(root, ["rev-parse", "HEAD"])).stdout.trim();
        const headTree = (await this.git(root, ["rev-parse", "HEAD^{tree}"])).stdout.trim();
        const status = (await this.git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"])).stdout;
        const untracked = new Set(splitZero((await this.git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout));
        for (const path of input.declaredUntracked) {
            if (!untracked.has(path))
                throw new Error(`Declared untracked file is absent or ignored: ${path}`);
            if (!insideAnyScope(path, input.includeScopes))
                throw new Error(`Declared untracked file is outside the snapshot scope: ${path}`);
            await assertSafeRegularFile(root, path);
        }
        const base = join(this.homeDir, ".arka-norn", "snapshots", input.campaignId);
        const index = join(base, "index");
        await mkdir(base, { recursive: true, mode: 0o700 });
        await this.git(root, ["read-tree", "HEAD"], { GIT_INDEX_FILE: index });
        const modifiedTracked = splitZero((await this.git(root, ["diff", "--name-only", "-z", "HEAD"])).stdout).filter((path) => insideAnyScope(path, input.includeScopes));
        for (const path of modifiedTracked)
            await this.git(root, ["add", "-u", "--", path], { GIT_INDEX_FILE: index });
        for (const path of input.declaredUntracked)
            await this.git(root, ["add", "-f", "--", path], { GIT_INDEX_FILE: index });
        const tree = (await this.git(root, ["write-tree"], { GIT_INDEX_FILE: index })).stdout.trim();
        let commit = head;
        if (tree !== headTree) {
            commit = (await this.git(root, ["commit-tree", tree, "-p", head, "-m", `norn snapshot ${input.campaignId}`], {
                GIT_INDEX_FILE: index,
                ...gitIdentity("Norn Snapshot"),
            })).stdout.trim();
        }
        await this.git(root, ["update-ref", `refs/norn/snapshots/${input.campaignId}`, commit]);
        const fingerprint = hash(JSON.stringify({ head, tree, status, declaredUntracked: [...input.declaredUntracked].sort() }));
        return Object.freeze({ commit, tree, fingerprint, clean: status.length === 0, declaredUntracked: Object.freeze([...input.declaredUntracked]) });
    }
    async createTaskWorkspace(project, snapshot, campaignId, task) {
        validateId(campaignId, "campaign id");
        validateId(task.id, "task id");
        const root = await this.assertRepository(project);
        const branch = `norn/${campaignId}/${task.id}`;
        const path = join(this.worktreeRoot, campaignId, task.id);
        await assertMissing(path);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await this.git(root, ["check-ref-format", `refs/heads/${branch}`]);
        const existing = await this.git(root, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], {}, [0, 1]);
        if (existing.code === 0)
            throw new Error(`Task branch already exists: ${branch}`);
        await this.git(root, ["worktree", "add", "-b", branch, path, snapshot.commit]);
        return Object.freeze({ campaignId, taskId: task.id, branch, path, baseCommit: snapshot.commit });
    }
    async commitTask(project, workspace, task, input) {
        await this.assertRepository(project);
        if (workspace.campaignId !== input.campaignId || workspace.taskId !== task.id)
            throw new Error("Task workspace identity mismatch.");
        validateId(input.profileId, "profile id");
        validateId(input.executionId, "execution id");
        if (input.agentId !== task.agentId)
            throw new Error("Task Agent identity mismatch.");
        if (input.proofReferences.length === 0 || input.proofReferences.some((value) => !safeText(value, 512)))
            throw new Error("Task commit requires bounded proof references.");
        const changedPaths = await this.changedPaths(workspace.path);
        if (changedPaths.length === 0)
            throw new Error("Task produced no changes to commit.");
        for (const path of changedPaths) {
            if (!insideAnyScope(path, task.writeScopes))
                throw new Error(`Task change exceeds its write scope: ${path}`);
            await assertSafeChangedPath(workspace.path, path);
            await assertNoSecretContent(workspace.path, path);
        }
        const evidenceFingerprint = hash(JSON.stringify([...input.proofReferences].sort()));
        const message = [
            `norn(${task.id}): validated task result`,
            "",
            `Norn-Campaign: ${input.campaignId}`,
            `Norn-Task: ${task.id}`,
            `Norn-Role: ${task.role}`,
            `Norn-Agent: ${task.agentId}`,
            `Norn-Profile: ${input.profileId}`,
            `Norn-Execution: ${input.executionId}`,
            `Norn-Evidence: ${evidenceFingerprint}`,
        ].join("\n");
        const commit = await this.serializeMutation(async () => {
            await this.git(workspace.path, ["add", "-A", "--", ...task.writeScopes]);
            const staged = splitZero((await this.git(workspace.path, ["diff", "--cached", "--name-only", "-z"])).stdout);
            if (staged.length !== changedPaths.length || staged.some((path) => !changedPaths.includes(path)))
                throw new Error("Task staging did not preserve the validated change set.");
            await this.git(workspace.path, ["commit", "--no-verify", "--no-gpg-sign", "-m", message], gitIdentity("arka.norn"));
            return (await this.git(workspace.path, ["rev-parse", "HEAD"])).stdout.trim();
        });
        return Object.freeze({ taskId: task.id, branch: workspace.branch, commit, changedPaths: Object.freeze(changedPaths), evidenceFingerprint });
    }
    async integrate(project, snapshot, campaignId, commits) {
        validateId(campaignId, "campaign id");
        if (commits.length === 0)
            throw new Error("Integration requires at least one task commit.");
        const root = await this.assertRepository(project);
        const branch = `norn/${campaignId}/integration`;
        const path = join(this.worktreeRoot, campaignId, "integration");
        await assertMissing(path);
        await mkdir(dirname(path), { recursive: true, mode: 0o700 });
        await this.git(root, ["worktree", "add", "-b", branch, path, snapshot.commit]);
        for (let index = 0; index < commits.length; index += 1) {
            const task = commits[index];
            const result = await this.git(path, ["cherry-pick", "--no-gpg-sign", task.commit], gitIdentity("arka.norn integrator"), [0, 1]);
            if (result.code !== 0) {
                const conflictPaths = splitZero((await this.git(path, ["diff", "--name-only", "--diff-filter=U", "-z"])).stdout);
                return Object.freeze({ campaignId, branch, path, status: "conflicted", conflictPaths: Object.freeze(conflictPaths), pendingCommits: Object.freeze(commits.slice(index).map((commit) => commit.commit)) });
            }
        }
        const commit = (await this.git(path, ["rev-parse", "HEAD"])).stdout.trim();
        return Object.freeze({ campaignId, branch, path, status: "integrated", commit, conflictPaths: Object.freeze([]) });
    }
    async resolveIntegrationConflict(project, integration, input) {
        await this.assertRepository(project);
        if (integration.status !== "conflicted" || integration.pendingCommits === undefined || integration.pendingCommits.length === 0)
            throw new Error("Integration has no resolvable conflict state.");
        validateId(input.profileId, "profile id");
        validateId(input.executionId, "execution id");
        if (input.proofReferences.length === 0)
            throw new Error("Integration conflict resolution requires proof.");
        for (const path of integration.conflictPaths)
            await assertSafeChangedPath(integration.path, path);
        await this.git(integration.path, ["add", "--", ...integration.conflictPaths]);
        const unresolved = splitZero((await this.git(integration.path, ["diff", "--name-only", "--diff-filter=U", "-z"])).stdout);
        if (unresolved.length > 0)
            throw new Error(`Integration conflict remains unresolved: ${unresolved.join(", ")}`);
        await this.git(integration.path, ["-c", "core.editor=true", "cherry-pick", "--continue"], gitIdentity("arka.norn integrator"));
        await this.appendIntegrationTrailers(integration.path, input);
        const remaining = integration.pendingCommits.slice(1);
        for (let index = 0; index < remaining.length; index += 1) {
            const commit = remaining[index];
            const result = await this.git(integration.path, ["cherry-pick", "--no-gpg-sign", commit], gitIdentity("arka.norn integrator"), [0, 1]);
            if (result.code !== 0) {
                const conflictPaths = splitZero((await this.git(integration.path, ["diff", "--name-only", "--diff-filter=U", "-z"])).stdout);
                return Object.freeze({ ...integration, status: "conflicted", conflictPaths: Object.freeze(conflictPaths), pendingCommits: Object.freeze(remaining.slice(index)) });
            }
        }
        const commit = (await this.git(integration.path, ["rev-parse", "HEAD"])).stdout.trim();
        return Object.freeze({ campaignId: integration.campaignId, branch: integration.branch, path: integration.path, status: "integrated", commit, conflictPaths: Object.freeze([]) });
    }
    async buildPriorityFallback(project, integration) {
        await this.assertRepository(project);
        if (integration.status !== "conflicted" || integration.pendingCommits === undefined || integration.pendingCommits.length === 0)
            throw new Error("Integration has no priority fallback state.");
        const discarded = [];
        const record = async (commit) => {
            const paths = splitZero((await this.git(integration.path, ["show", "--format=", "--name-only", "--no-renames", "-z", commit])).stdout);
            for (const path of paths) {
                const patch = (await this.git(integration.path, ["show", "--format=", "--unified=0", "--no-renames", commit, "--", path])).stdout;
                const hunks = patch.split("\n").filter((line) => line.startsWith("@@"));
                for (const hunk of hunks.length === 0 ? ["whole-file-change"] : hunks)
                    discarded.push({ commit, path, hunk: hunk.slice(0, 300), fingerprint: hash(`${commit}\n${path}\n${hunk}`) });
            }
        };
        await record(integration.pendingCommits[0]);
        await this.git(integration.path, ["cherry-pick", "--abort"]);
        for (const commit of integration.pendingCommits.slice(1)) {
            const result = await this.git(integration.path, ["cherry-pick", "--no-gpg-sign", commit], gitIdentity("arka.norn priority fallback"), [0, 1]);
            if (result.code === 0)
                continue;
            await record(commit);
            await this.git(integration.path, ["cherry-pick", "--abort"]);
        }
        const commit = (await this.git(integration.path, ["rev-parse", "HEAD"])).stdout.trim();
        return Object.freeze({ campaignId: integration.campaignId, branch: integration.branch, path: integration.path, status: "integrated", commit, conflictPaths: Object.freeze([]), requiresHumanApproval: true, discardedHunks: Object.freeze(discarded.map((entry) => Object.freeze(entry))) });
    }
    async applyFastForward(project, snapshot, integration) {
        if (!snapshot.clean)
            throw new Error("Automatic application is forbidden for a dirty base snapshot.");
        if (integration.status !== "integrated" || integration.commit === undefined)
            throw new Error("Only a conflict-free integration can be applied.");
        const root = await this.assertRepository(project);
        if ((await this.git(root, ["status", "--porcelain=v1"])).stdout.trim() !== "")
            throw new Error("The real Project is no longer clean.");
        if ((await this.git(root, ["rev-parse", "HEAD"])).stdout.trim() !== snapshot.commit)
            throw new Error("The real Project changed after the campaign snapshot.");
        const ancestor = await this.git(root, ["merge-base", "--is-ancestor", snapshot.commit, integration.commit], {}, [0, 1]);
        if (ancestor.code !== 0)
            throw new Error("Integration is not a descendant of the confirmed snapshot.");
        await this.git(root, ["merge", "--ff-only", "--no-verify", integration.branch], gitIdentity("arka.norn"));
        return (await this.git(root, ["rev-parse", "HEAD"])).stdout.trim();
    }
    async inspectRiskChanges(project, snapshot, integration, commits) {
        await this.assertRepository(project);
        if (integration.status !== "integrated" || integration.commit === undefined)
            throw new Error("Risk inspection requires an integrated campaign candidate.");
        const declaredPaths = new Set(commits.flatMap((commit) => [...commit.changedPaths]));
        const proofByPath = new Map(commits.flatMap((commit) => commit.changedPaths.map((path) => [path, /^[a-f0-9]{64}$/u.test(commit.evidenceFingerprint)])));
        const paths = splitZero((await this.git(integration.path, ["diff", "--name-only", "-z", snapshot.commit, integration.commit])).stdout);
        const changes = [];
        for (const path of paths) {
            const operation = await this.operationFor(integration.path, snapshot.commit, integration.commit, path);
            const stats = await this.numstatFor(integration.path, snapshot.commit, integration.commit, path);
            const beforeMode = await this.modeFor(integration.path, snapshot.commit, path);
            const afterMode = await this.modeFor(integration.path, integration.commit, path);
            const content = operation === "delete" || stats.binary ? "" : await this.boundedBlob(integration.path, integration.commit, path);
            SECRET_CONTENT.lastIndex = 0;
            changes.push(Object.freeze({
                path,
                operation,
                churn: stats.churn,
                binary: stats.binary,
                executableChanged: executable(beforeMode) !== executable(afterMode),
                secretDetected: SECRET_CONTENT.test(content),
                outsideScope: !declaredPaths.has(path),
                symlink: afterMode === "120000",
                submodule: afterMode === "160000" || beforeMode === "160000",
                gitMetadata: path === ".git" || path.startsWith(".git/"),
                proofPresent: proofByPath.get(path) === true,
                declared: declaredPaths.has(path),
            }));
        }
        return Object.freeze(changes);
    }
    async assertRepository(project) {
        const root = await realpath(project.root);
        const top = (await this.git(root, ["rev-parse", "--show-toplevel"])).stdout.trim();
        if (await realpath(top) !== root)
            throw new Error("Project root must be the Git worktree root.");
        return root;
    }
    async assertSafeRepository(root) {
        if ((await this.git(root, ["ls-files", "--error-unmatch", ".gitmodules"], {}, [0, 1])).code === 0)
            throw new Error("Git submodules are forbidden in automatic orchestration snapshots.");
        const filters = await this.git(root, ["config", "--local", "--get-regexp", "^filter\\."], {}, [0, 1]);
        if (filters.code === 0 && filters.stdout.trim() !== "")
            throw new Error("External Git filters are forbidden in automatic orchestration snapshots.");
    }
    async changedPaths(root) {
        const tracked = splitZero((await this.git(root, ["diff", "--name-only", "-z", "HEAD"])).stdout);
        const untracked = splitZero((await this.git(root, ["ls-files", "--others", "--exclude-standard", "-z"])).stdout);
        return [...new Set([...tracked, ...untracked])].sort();
    }
    async operationFor(root, before, after, path) {
        const status = (await this.git(root, ["diff", "--name-status", "--no-renames", before, after, "--", path])).stdout.trimStart()[0];
        if (status === "A")
            return "add";
        if (status === "D")
            return "delete";
        return "modify";
    }
    async numstatFor(root, before, after, path) {
        const line = (await this.git(root, ["diff", "--numstat", "--no-renames", before, after, "--", path])).stdout.split("\n").find((value) => value.trim() !== "");
        if (line === undefined)
            return { churn: 0, binary: false };
        const [added, removed] = line.split("\t");
        if (added === "-" || removed === "-")
            return { churn: 0, binary: true };
        return { churn: Number(added ?? 0) + Number(removed ?? 0), binary: false };
    }
    async modeFor(root, commit, path) {
        const result = await this.git(root, ["ls-tree", commit, "--", path]);
        return result.stdout.trim() === "" ? undefined : result.stdout.split(/\s+/u)[0];
    }
    async boundedBlob(root, commit, path) {
        const size = Number((await this.git(root, ["cat-file", "-s", `${commit}:${path}`])).stdout.trim());
        if (!Number.isSafeInteger(size) || size < 0 || size > 1024 * 1024)
            return "";
        return (await this.git(root, ["show", `${commit}:${path}`])).stdout;
    }
    async appendIntegrationTrailers(root, input) {
        const current = (await this.git(root, ["show", "-s", "--format=%B", "HEAD"])).stdout.trimEnd();
        const evidence = hash(JSON.stringify([...input.proofReferences].sort()));
        const message = `${current}\n\nNorn-Role: integrator\nNorn-Agent: ${input.agentId}\nNorn-Profile: ${input.profileId}\nNorn-Execution: ${input.executionId}\nNorn-Evidence: ${evidence}`;
        await this.git(root, ["commit", "--amend", "--no-verify", "--no-gpg-sign", "-m", message], gitIdentity("arka.norn integrator"));
    }
    async git(cwd, args, extraEnvironment = {}, allowedCodes = [0]) {
        await mkdir(this.gitHome, { recursive: true, mode: 0o700 });
        const hooksPath = join(this.gitHome, "disabled-hooks");
        const emptyConfig = join(this.gitHome, "empty.gitconfig");
        await mkdir(hooksPath, { recursive: true, mode: 0o700 });
        await writeFile(emptyConfig, "", { flag: "a", mode: 0o600 });
        const hardened = ["-c", `core.hooksPath=${hooksPath}`, "-c", "core.fsmonitor=false", "-c", "gc.auto=0", "-c", "maintenance.auto=false", "-c", "protocol.file.allow=never", "-c", "protocol.ext.allow=never", ...args];
        const result = await run(this.gitCommand, hardened, cwd, {
            HOME: this.gitHome,
            USERPROFILE: this.gitHome,
            LANG: "C",
            LC_ALL: "C",
            GIT_CONFIG_NOSYSTEM: "1",
            GIT_CONFIG_GLOBAL: emptyConfig,
            GIT_TERMINAL_PROMPT: "0",
            GCM_INTERACTIVE: "never",
            GIT_OPTIONAL_LOCKS: "0",
            ...gitSystemEnvironment(),
            ...extraEnvironment,
        });
        if (!allowedCodes.includes(result.code))
            throw new Error(`Git command failed (${String(result.code)}): ${sanitize(result.stderr || result.stdout)}`);
        return result;
    }
    async serializeMutation(operation) {
        const previous = this.mutationTail;
        let release = () => undefined;
        this.mutationTail = new Promise((resolvePromise) => { release = resolvePromise; });
        await previous;
        try {
            return await operation();
        }
        finally {
            release();
        }
    }
}
function gitSystemEnvironment() {
    if (process.platform !== "win32")
        return { PATH: ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"].join(delimiter) };
    const result = {};
    const path = process.env["Path"] ?? process.env["PATH"];
    if (path !== undefined)
        result["Path"] = path;
    for (const name of ["SystemRoot", "SYSTEMROOT", "ComSpec", "TEMP", "TMP"]) {
        const value = process.env[name];
        if (value !== undefined)
            result[name] = value;
    }
    return result;
}
async function run(command, args, cwd, environment) {
    return new Promise((resolvePromise, reject) => {
        const child = spawn(command, args, { cwd, env: { ...environment }, stdio: ["ignore", "pipe", "pipe"], shell: false });
        let stdout = "";
        let stderr = "";
        const append = (current, chunk) => { const next = current + chunk.toString("utf8"); if (Buffer.byteLength(next) > MAX_OUTPUT_BYTES) {
            child.kill("SIGTERM");
            throw new Error("Git output exceeded the safe limit.");
        } return next; };
        child.stdout.on("data", (chunk) => { try {
            stdout = append(stdout, chunk);
        }
        catch (error) {
            reject(asError(error));
        } });
        child.stderr.on("data", (chunk) => { try {
            stderr = append(stderr, chunk);
        }
        catch (error) {
            reject(asError(error));
        } });
        child.on("error", (error) => reject(error));
        child.on("close", (code) => resolvePromise({ code: code ?? 1, stdout, stderr }));
    });
}
async function assertSafeRegularFile(root, path) { const target = safeJoin(root, path); const info = await lstat(target); if (!info.isFile() || info.isSymbolicLink() || info.size > MAX_FILE_BYTES || SECRET_FILE.test(path.split("/").at(-1)))
    throw new Error(`Unsafe declared file: ${path}`); }
async function assertSafeChangedPath(root, path) { if (path === ".git" || path.startsWith(".git/") || SECRET_FILE.test(path.split("/").at(-1)))
    throw new Error(`Unsafe task change: ${path}`); try {
    const info = await lstat(safeJoin(root, path));
    if (info.isSymbolicLink() || (!info.isFile() && !info.isDirectory()))
        throw new Error(`Unsafe task change: ${path}`);
}
catch (error) {
    if (!isNodeError(error, "ENOENT"))
        throw error;
} }
async function assertNoSecretContent(root, path) { try {
    const target = safeJoin(root, path);
    const info = await lstat(target);
    if (!info.isFile() || info.size > 1024 * 1024)
        return;
    const value = await readFile(target, "utf8");
    SECRET_CONTENT.lastIndex = 0;
    if (SECRET_CONTENT.test(value))
        throw new Error(`Task change contains credential-like content: ${path}`);
}
catch (error) {
    if (!isNodeError(error, "ENOENT"))
        throw error;
} }
async function assertMissing(path) { try {
    await lstat(path);
    throw new Error(`Workspace path already exists: ${path}`);
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return;
    throw error;
} }
function safeJoin(root, path) { const target = resolve(root, path); const relation = relative(root, target); if (relation === ".." || relation.startsWith(`..${sep}`) || isAbsolute(relation))
    throw new Error(`Path escapes the workspace: ${path}`); return target; }
function validateScopes(values, allowEmpty = false) { if ((!allowEmpty && values.length === 0) || new Set(values).size !== values.length || values.some((value) => !safeScope(value)))
    throw new TypeError("Git workspace scopes are invalid."); }
function safeScope(value) { return value === "." || (value.length > 0 && value.length <= 512 && !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")); }
function insideAnyScope(path, scopes) { return scopes.some((scope) => scope === "." || path === scope || path.startsWith(`${scope}/`)); }
function validateId(value, label) { if (!/^[a-z0-9][a-z0-9._-]{0,119}$/u.test(value))
    throw new TypeError(`Invalid ${label}.`); }
function safeText(value, maximum) { return value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function splitZero(value) { return value.split("\0").filter((entry) => entry.length > 0); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function executable(mode) { return mode === "100755"; }
function sanitize(value) { return value.replaceAll(/(?:Bearer\s+|sk-)[a-z0-9._-]+/giu, "[REDACTED]").replaceAll(/[\u0000-\u001f\u007f]+/gu, " ").trim().slice(0, 1_000); }
function gitIdentity(name) { return { GIT_AUTHOR_NAME: name, GIT_AUTHOR_EMAIL: "norn@local.invalid", GIT_COMMITTER_NAME: name, GIT_COMMITTER_EMAIL: "norn@local.invalid" }; }
function isNodeError(error, code) { return error instanceof Error && "code" in error && error.code === code; }
function asError(value) { return value instanceof Error ? value : new Error(String(value)); }
//# sourceMappingURL=git-workspace-adapter.js.map