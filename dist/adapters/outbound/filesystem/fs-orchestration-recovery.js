/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { chmod, copyFile, lstat, mkdir, readdir, realpath, rename, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { ExecutionProfile } from "../../../domain/orchestration/execution-profile.js";
import { AgentRegistration } from "../../../domain/agent/agent.js";
import { AgentId } from "../../../domain/agent/agent-id.js";
import { FeatureId } from "../../../domain/feature/feature-id.js";
import { OrchestrationConfiguration } from "../../../domain/orchestration/orchestration-configuration.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { FsAgentRegistryStore } from "./fs-agent-registry-store.js";
const PROJECT_STATE_FILES = ["orchestration.json", "campaigns.json", "executions.json"];
const MAX_ENTRIES = 200_000;
const MAX_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
export class FsOrchestrationRecovery {
    homeDir;
    constructor(homeDir) {
        this.homeDir = homeDir;
    }
    async inspect(project) {
        const root = await canonicalDirectory(project.root);
        const entries = [];
        const counter = { entries: 0, bytes: 0 };
        for (const name of [...PROJECT_STATE_FILES, "agents.json"]) {
            await collect(join(root, ".arka-norn", name), "project", `.arka-norn/${name}`, entries, counter);
        }
        const campaignIds = await legacyCampaignIds(join(root, ".arka-norn", "campaigns.json"));
        for (const id of campaignIds)
            await collect(join(this.homeDir, ".arka-norn", "orchestration", "workspaces", id), "home", `orchestration/workspaces/${id}`, entries, counter);
        await collect(join(this.homeDir, ".arka-norn", "workers", project.id.value), "home", `workers/${project.id.value}`, entries, counter);
        await collect(join(this.homeDir, ".arka-norn", "campaign-holding"), "home", "campaign-holding", entries, counter);
        const currentCampaignRoot = join(this.homeDir, ".arka-norn", "campaigns-v23", project.id.value);
        await collect(currentCampaignRoot, "home", `campaigns-v23/${project.id.value}`, entries, counter);
        for (const id of await directoryNames(currentCampaignRoot))
            await collect(join(this.homeDir, ".arka-norn", "worktrees", id), "home", `worktrees/${id}`, entries, counter);
        entries.sort((left, right) => left.source.localeCompare(right.source) || left.logicalPath.localeCompare(right.logicalPath));
        const duplicateGroups = await exactDuplicateAgentGroups(join(root, ".arka-norn", "agents.json"));
        const fingerprint = sha256(JSON.stringify({ projectId: project.id.value, entries, duplicateGroups }));
        return freezeManifest({ schemaVersion: 1, projectId: project.id.value, entries, exactDuplicateAgentGroups: duplicateGroups, fingerprint, inspectedAt: new Date() });
    }
    async quarantine(project, expectedFingerprint) {
        const manifest = await this.inspect(project);
        if (manifest.fingerprint !== expectedFingerprint)
            throw new Error("Recovery manifest changed before quarantine confirmation.");
        const id = `quarantine-${new Date().toISOString().replaceAll(/[-:.TZ]/gu, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
        const base = quarantinePath(this.homeDir, project.id.value, id);
        await mkdir(join(base, "project", ".arka-norn"), { recursive: true, mode: 0o700 });
        await mkdir(join(base, "home"), { recursive: true, mode: 0o700 });
        const root = await canonicalDirectory(project.root);
        for (const name of PROJECT_STATE_FILES)
            await moveIfPresent(join(root, ".arka-norn", name), join(base, "project", ".arka-norn", name));
        await copyIfPresent(join(root, ".arka-norn", "agents.json"), join(base, "project", ".arka-norn", "agents.json"));
        const campaignIds = manifest.entries
            .filter((entry) => entry.source === "home" && /^orchestration\/workspaces\/[^/]+$/u.test(entry.logicalPath) && entry.kind === "directory")
            .map((entry) => entry.logicalPath.split("/").at(-1));
        for (const campaignId of campaignIds)
            await moveIfPresent(join(this.homeDir, ".arka-norn", "orchestration", "workspaces", campaignId), join(base, "home", "orchestration", "workspaces", campaignId));
        await moveIfPresent(join(this.homeDir, ".arka-norn", "workers", project.id.value), join(base, "home", "workers", project.id.value));
        await moveIfPresent(join(this.homeDir, ".arka-norn", "campaign-holding"), join(base, "home", "campaign-holding"));
        const receipt = { schemaVersion: 1, id, projectId: project.id.value, manifestFingerprint: manifest.fingerprint, path: base, quarantinedAt: new Date() };
        await writeJsonAtomic(join(base, "manifest.json"), serializeManifest(manifest), { mode: 0o400 });
        await writeJsonAtomic(join(base, "receipt.json"), serializeReceipt(receipt), { mode: 0o400 });
        await makeReadOnly(base);
        return freezeReceipt(receipt);
    }
    async restore(project, quarantineId, expectedFingerprint) {
        validateQuarantineId(quarantineId);
        const base = quarantinePath(this.homeDir, project.id.value, quarantineId);
        const receipt = await readReceipt(base);
        if (receipt.projectId !== project.id.value || receipt.manifestFingerprint !== expectedFingerprint)
            throw new Error("Quarantine receipt does not match the confirmed recovery fingerprint.");
        const root = await canonicalDirectory(project.root);
        const manifest = await readStoredManifest(base);
        for (const name of PROJECT_STATE_FILES)
            await assertAbsent(join(root, ".arka-norn", name));
        const campaignIds = await directoryNames(join(base, "home", "orchestration", "workspaces"));
        for (const campaignId of campaignIds)
            await assertAbsent(join(this.homeDir, ".arka-norn", "orchestration", "workspaces", campaignId));
        await assertAbsent(join(this.homeDir, ".arka-norn", "workers", project.id.value));
        const heldRoot = join(base, "home", "campaign-holding");
        const heldNames = await entryNames(heldRoot);
        const gitNexus = heldNames.filter((name) => /^gitnexus-lbug-[a-z0-9_-]+$/u.test(name));
        if (gitNexus.length > 1)
            throw new Error("Quarantine contains ambiguous GitNexus lbug artifacts.");
        if (gitNexus.length === 1) {
            const name = gitNexus[0];
            const source = join(heldRoot, name);
            const entry = manifest.entries.find((candidate) => candidate.logicalPath === `campaign-holding/${name}` && candidate.kind === "file");
            if (entry?.sha256 === undefined || await hashFile(source) !== entry.sha256)
                throw new Error("Held GitNexus lbug fingerprint does not match the confirmed manifest.");
            await assertAbsent(join(root, ".gitnexus", "lbug"));
        }
        const remainingHeld = heldNames.filter((name) => !gitNexus.includes(name));
        if (remainingHeld.length > 0)
            await assertAbsent(join(this.homeDir, ".arka-norn", "campaign-holding"));
        await makeWritable(base);
        for (const name of PROJECT_STATE_FILES)
            await moveIfPresent(join(base, "project", ".arka-norn", name), join(root, ".arka-norn", name));
        for (const campaignId of campaignIds)
            await moveIfPresent(join(base, "home", "orchestration", "workspaces", campaignId), join(this.homeDir, ".arka-norn", "orchestration", "workspaces", campaignId));
        await moveIfPresent(join(base, "home", "workers", project.id.value), join(this.homeDir, ".arka-norn", "workers", project.id.value));
        if (gitNexus.length === 1)
            await moveIfPresent(join(heldRoot, gitNexus[0]), join(root, ".gitnexus", "lbug"));
        if (remainingHeld.length > 0)
            await moveIfPresent(heldRoot, join(this.homeDir, ".arka-norn", "campaign-holding"));
        return receipt;
    }
    async importLegacy(project, quarantineId, expectedFingerprint, at) {
        validateQuarantineId(quarantineId);
        const base = quarantinePath(this.homeDir, project.id.value, quarantineId);
        const receipt = await readReceipt(base);
        if (receipt.projectId !== project.id.value || receipt.manifestFingerprint !== expectedFingerprint)
            throw new Error("Legacy quarantine does not match the confirmed recovery fingerprint.");
        const raw = await readJson(join(base, "project", ".arka-norn", "orchestration.json"));
        if (!isRecord(raw) || ![1, 2, 3].includes(Number(raw["schemaVersion"])) || !Array.isArray(raw["providers"]))
            throw new Error("Quarantine contains no importable legacy orchestration policy.");
        let configuration = OrchestrationConfiguration.empty(project.id.value, at);
        for (const provider of raw["providers"]) {
            if (!isRecord(provider) || typeof provider["provider"] !== "string")
                continue;
            const models = Array.isArray(provider["models"]) ? provider["models"] : [];
            for (const model of models) {
                if (!isRecord(model) || typeof model["id"] !== "string")
                    continue;
                const profile = ExecutionProfile.create({
                    schemaVersion: 1,
                    id: uniqueProfileId(configuration, `${provider["provider"]}-${model["id"]}`),
                    transport: legacyTransport(provider["adapter"]),
                    provider: provider["provider"],
                    model: model["id"],
                    capabilities: legacyCapabilities(provider["capabilities"]),
                    egressHosts: [],
                    costMeter: { kind: "unknown", observable: false },
                    enabled: false,
                    createdAt: at,
                    updatedAt: at,
                });
                configuration = configuration.register(profile, at);
            }
        }
        await reconcileLegacyAgents(project, base, at);
        return configuration;
    }
}
async function reconcileLegacyAgents(project, quarantineRoot, at) {
    const raw = await readJson(join(quarantineRoot, "project", ".arka-norn", "agents.json"));
    if (raw === undefined)
        return;
    if (!isRecord(raw) || raw["schemaVersion"] !== 1 || raw["projectId"] !== project.id.value || !Array.isArray(raw["agents"]))
        throw new Error("Quarantine Agent registry is invalid.");
    const legacy = raw["agents"].map((value) => deserializeLegacyAgent(value, project.id));
    const store = new FsAgentRegistryStore();
    await store.update(project, (current) => {
        const next = [...current];
        const exactGroups = new Map();
        for (const agent of next)
            exactGroups.set(agentIdentity(agent), [...(exactGroups.get(agentIdentity(agent)) ?? []), agent]);
        for (const group of exactGroups.values()) {
            const ordered = [...group].sort((left, right) => left.id.value.localeCompare(right.id.value));
            for (const duplicate of ordered.slice(1))
                replaceAgent(next, duplicate, suspend(duplicate, at));
        }
        for (const candidate of legacy) {
            if (next.some((agent) => agentIdentity(agent) === agentIdentity(candidate)))
                continue;
            const conflicts = next.filter((agent) => agent.id.equals(candidate.id) || (agent.provider === candidate.provider && agent.role === candidate.role));
            if (conflicts.length === 0) {
                next.push(candidate);
                continue;
            }
            for (const conflict of conflicts)
                replaceAgent(next, conflict, suspend(conflict, at));
            if (!next.some((agent) => agent.id.equals(candidate.id)))
                next.push(suspend(candidate, at));
        }
        return next;
    });
}
function deserializeLegacyAgent(value, projectId) {
    if (!isRecord(value) || typeof value["id"] !== "string" || typeof value["provider"] !== "string" || typeof value["role"] !== "string" || typeof value["active"] !== "boolean" || !isRecord(value["scope"]) || !Array.isArray(value["scope"]["featureIds"]) || !Array.isArray(value["scope"]["paths"]) || !Array.isArray(value["scope"]["responsibilities"]) || typeof value["registeredAt"] !== "string" || typeof value["updatedAt"] !== "string")
        throw new Error("Quarantine contains an invalid Agent identity.");
    const strings = (entries, field) => { if (entries.some((entry) => typeof entry !== "string"))
        throw new Error(`Quarantine Agent ${field} is invalid.`); return entries; };
    return AgentRegistration.create({
        id: AgentId.of(value["id"]), provider: value["provider"], role: value["role"], active: value["active"],
        scope: { projectId, featureIds: strings(value["scope"]["featureIds"], "featureIds").map((id) => FeatureId.of(id)), paths: strings(value["scope"]["paths"], "paths"), responsibilities: strings(value["scope"]["responsibilities"], "responsibilities") },
        registeredAt: new Date(value["registeredAt"]), updatedAt: new Date(value["updatedAt"]),
        ...(typeof value["deactivatedAt"] === "string" ? { deactivatedAt: new Date(value["deactivatedAt"]) } : {}),
        ...(typeof value["replacedByAgentId"] === "string" ? { replacedByAgentId: AgentId.of(value["replacedByAgentId"]) } : {}),
        ...(typeof value["replacesAgentId"] === "string" ? { replacesAgentId: AgentId.of(value["replacesAgentId"]) } : {}),
    });
}
function agentIdentity(agent) { return JSON.stringify({ provider: agent.provider, role: agent.role, featureIds: agent.scope.featureIds.map((id) => id.value).sort(), paths: [...agent.scope.paths].sort(), responsibilities: [...agent.scope.responsibilities].sort() }); }
function suspend(agent, at) { return agent.active ? agent.deactivate(new Date(Math.max(at.getTime(), agent.updatedAt.getTime()))) : agent; }
function replaceAgent(agents, current, replacement) { const index = agents.findIndex((agent) => agent.id.equals(current.id)); if (index >= 0)
    agents[index] = replacement; }
async function collect(path, source, logicalPath, entries, counter) {
    let info;
    try {
        info = await lstat(path);
    }
    catch (error) {
        if (isNodeError(error, "ENOENT"))
            return;
        throw error;
    }
    counter.entries += 1;
    counter.bytes += info.size;
    if (counter.entries > MAX_ENTRIES || counter.bytes > MAX_TOTAL_BYTES)
        throw new Error("Recovery inventory exceeds the safe inspection limits.");
    if (info.isSymbolicLink()) {
        entries.push({ source, logicalPath, kind: "symlink", size: info.size });
        return;
    }
    if (info.isFile()) {
        entries.push({ source, logicalPath, kind: "file", size: info.size, sha256: await hashFile(path) });
        return;
    }
    if (!info.isDirectory())
        return;
    entries.push({ source, logicalPath, kind: "directory", size: 0 });
    for (const entry of await readdir(path, { withFileTypes: true }))
        await collect(join(path, entry.name), source, `${logicalPath}/${entry.name}`, entries, counter);
}
async function hashFile(path) {
    const hash = createHash("sha256");
    await new Promise((resolvePromise, reject) => {
        const stream = createReadStream(path);
        stream.on("data", (chunk) => hash.update(chunk));
        stream.on("error", reject);
        stream.on("end", resolvePromise);
    });
    return hash.digest("hex");
}
async function exactDuplicateAgentGroups(path) {
    const raw = await readJson(path);
    if (!isRecord(raw) || !Array.isArray(raw["agents"]))
        return [];
    const groups = new Map();
    for (const agent of raw["agents"]) {
        if (!isRecord(agent) || typeof agent["id"] !== "string")
            continue;
        const identity = Object.fromEntries(Object.entries(agent).filter(([key]) => !["id", "registeredAt", "updatedAt"].includes(key)));
        const key = JSON.stringify(identity, Object.keys(identity).sort());
        groups.set(key, [...(groups.get(key) ?? []), agent["id"]]);
    }
    return [...groups.values()].filter((ids) => ids.length > 1).map((ids) => Object.freeze(ids.sort()));
}
async function legacyCampaignIds(path) {
    const raw = await readJson(path);
    if (!isRecord(raw) || !Array.isArray(raw["campaigns"]))
        return [];
    return raw["campaigns"].flatMap((campaign) => isRecord(campaign) && typeof campaign["id"] === "string" ? [campaign["id"]] : []);
}
async function moveIfPresent(source, target) { try {
    await lstat(source);
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return;
    throw error;
} await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await rename(source, target); }
async function copyIfPresent(source, target) { try {
    await lstat(source);
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return;
    throw error;
} await mkdir(dirname(target), { recursive: true, mode: 0o700 }); await copyFile(source, target); }
async function assertAbsent(path) { try {
    await lstat(path);
    throw new Error(`Restore target already exists: ${path}`);
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return;
    throw error;
} }
async function directoryNames(path) { try {
    return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return [];
    throw error;
} }
async function makeReadOnly(root) { for (const path of (await treePaths(root)).reverse()) {
    const info = await lstat(path);
    if (!info.isSymbolicLink())
        await chmod(path, info.isDirectory() ? 0o500 : 0o400);
} }
async function makeWritable(root) { for (const path of await treePaths(root)) {
    const info = await lstat(path);
    if (!info.isSymbolicLink())
        await chmod(path, info.isDirectory() ? 0o700 : 0o600);
} }
async function treePaths(root) { const paths = [root]; for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    paths.push(path);
    if (entry.isDirectory() && !entry.isSymbolicLink())
        paths.push(...(await treePaths(path)).slice(1));
} return paths; }
async function readReceipt(base) { const raw = await readJson(join(base, "receipt.json")); if (!isRecord(raw) || raw["schemaVersion"] !== 1 || typeof raw["id"] !== "string" || typeof raw["projectId"] !== "string" || typeof raw["manifestFingerprint"] !== "string" || typeof raw["path"] !== "string" || typeof raw["quarantinedAt"] !== "string")
    throw new Error("Invalid orchestration quarantine receipt."); return freezeReceipt({ schemaVersion: 1, id: raw["id"], projectId: raw["projectId"], manifestFingerprint: raw["manifestFingerprint"], path: raw["path"], quarantinedAt: new Date(raw["quarantinedAt"]) }); }
async function readStoredManifest(base) { const raw = await readJson(join(base, "manifest.json")); if (!isRecord(raw) || raw["schemaVersion"] !== 1 || !Array.isArray(raw["entries"]) || typeof raw["fingerprint"] !== "string")
    throw new Error("Invalid orchestration quarantine manifest."); return raw; }
async function entryNames(path) { try {
    return (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isFile() && !entry.isSymbolicLink()).map((entry) => entry.name).sort();
}
catch (error) {
    if (isNodeError(error, "ENOENT"))
        return [];
    throw error;
} }
function quarantinePath(homeDir, projectId, id) { return join(homeDir, ".arka-norn", "quarantine", projectId, id); }
function validateQuarantineId(value) { if (!/^quarantine-[a-z0-9-]{10,80}$/u.test(value))
    throw new TypeError("Invalid orchestration quarantine id."); }
function serializeManifest(value) { return { ...value, entries: value.entries.map((entry) => ({ ...entry })), exactDuplicateAgentGroups: value.exactDuplicateAgentGroups.map((group) => [...group]), inspectedAt: value.inspectedAt.toISOString() }; }
function serializeReceipt(value) { return { ...value, quarantinedAt: value.quarantinedAt.toISOString() }; }
function freezeManifest(value) { return Object.freeze({ ...value, entries: Object.freeze(value.entries.map((entry) => Object.freeze({ ...entry }))), exactDuplicateAgentGroups: Object.freeze(value.exactDuplicateAgentGroups.map((group) => Object.freeze([...group]))), inspectedAt: new Date(value.inspectedAt) }); }
function freezeReceipt(value) { return Object.freeze({ ...value, quarantinedAt: new Date(value.quarantinedAt) }); }
function legacyTransport(value) { if (value === "codex-cli" || value === "claude-cli")
    return value; return "api"; }
function legacyCapabilities(value) { if (!Array.isArray(value))
    return []; return value.filter((entry) => typeof entry === "string" && ["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"].includes(entry)); }
function uniqueProfileId(configuration, candidate) { const base = candidate.toLowerCase().replaceAll(/[^a-z0-9._-]+/gu, "-").replaceAll(/^-+|-+$/gu, "").slice(0, 70) || "legacy-profile"; let value = base; let index = 2; const ids = new Set(configuration.profiles.map((profile) => profile.id)); while (ids.has(value)) {
    value = `${base}-${index}`;
    index += 1;
} return value; }
async function canonicalDirectory(path) { const resolved = resolve(path); const info = await stat(resolved); if (!info.isDirectory())
    throw new Error(`Expected directory: ${path}`); return realpath(resolved); }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isNodeError(error, code) { return error instanceof Error && "code" in error && error.code === code; }
//# sourceMappingURL=fs-orchestration-recovery.js.map