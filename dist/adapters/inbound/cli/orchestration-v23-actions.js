/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { FsOrchestrationConfigurationStore, serializeOrchestrationConfiguration } from "../../outbound/filesystem/fs-orchestration-configuration-store.js";
import { FsOrchestrationRecovery } from "../../outbound/filesystem/fs-orchestration-recovery.js";
import { LocalExecutionProfileRuntimeAdapter } from "../../outbound/execution/execution-profile-runtime-adapter.js";
import { ExecutionProfile, isCostMeterKind, isCredentialReferenceKind, isExecutionTransport } from "../../../domain/orchestration/execution-profile.js";
import { OrchestrationConfiguration } from "../../../domain/orchestration/orchestration-configuration.js";
import { CliUsageError } from "./strict-arguments.js";
export async function runOrchestrationV23Action(input) {
    return input.action === "profile" ? runProfile(input) : runRecovery(input);
}
function profilePayload(value) { return serializeOrchestrationConfiguration(value); }
async function runProfile(input) {
    const operation = input.args.positionals[0];
    const store = new FsOrchestrationConfigurationStore();
    if (operation === "show") {
        const configuration = await store.load(input.project);
        return configuration === undefined ? null : profilePayload(configuration);
    }
    if (operation === "register") {
        const at = new Date();
        const current = await store.load(input.project) ?? OrchestrationConfiguration.empty(input.project.id.value, at);
        const profile = await executionProfileFrom(input.args, at);
        let updated = current.register(profile, at);
        if (input.args.booleans.has("activate"))
            updated = updated.activate(at);
        await store.save(input.project, updated);
        return profilePayload(updated);
    }
    if (operation === "doctor") {
        const configuration = await store.load(input.project);
        if (configuration === undefined)
            return { schemaVersion: 1, healthy: false, checks: [{ code: "profile_missing", healthy: false, message: "No 2.3 execution profile is configured." }] };
        const requestedId = input.args.positionals[1];
        const profiles = requestedId === undefined ? configuration.profiles : configuration.profiles.filter((profile) => profile.id === requestedId);
        if (profiles.length === 0)
            throw new CliUsageError(`execution profile not found: ${requestedId ?? "unknown"}`);
        const runtime = new LocalExecutionProfileRuntimeAdapter(input.homeDir, input.environment);
        const checks = await Promise.all(profiles.map((profile) => runtime.preflight(profile, input.project.root)));
        return { schemaVersion: 1, healthy: checks.every((check) => check.healthy), checks };
    }
    throw new CliUsageError("profile action must be register, show or doctor");
}
async function runRecovery(input) {
    const operation = input.args.positionals[0];
    const recovery = new FsOrchestrationRecovery(input.homeDir);
    if (operation === "inspect")
        return serializeManifest(await recovery.inspect(input.project));
    if (operation === "quarantine")
        return serializeReceipt(await recovery.quarantine(input.project, required(input.args, "confirm")));
    const quarantineId = input.args.positionals[1];
    if (quarantineId === undefined)
        throw new CliUsageError(`recovery ${operation ?? "action"} requires a quarantine id`);
    if (operation === "restore")
        return serializeReceipt(await recovery.restore(input.project, quarantineId, required(input.args, "confirm")));
    if (operation === "import-legacy") {
        const configuration = await recovery.importLegacy(input.project, quarantineId, required(input.args, "confirm"), new Date());
        const store = new FsOrchestrationConfigurationStore();
        await store.save(input.project, configuration);
        return profilePayload(configuration);
    }
    throw new CliUsageError("recovery action must be inspect, quarantine, restore or import-legacy");
}
async function executionProfileFrom(args, at) {
    const transport = required(args, "transport");
    const costMeter = args.values.get("cost-meter") ?? "unknown";
    if (!isExecutionTransport(transport))
        throw new CliUsageError("--transport must be codex-cli, claude-cli, gemini-cli or api");
    if (!isCostMeterKind(costMeter))
        throw new CliUsageError("--cost-meter is invalid");
    const credentialKind = args.values.get("credential-kind");
    if (credentialKind !== undefined && !isCredentialReferenceKind(credentialKind))
        throw new CliUsageError("--credential-kind must be environment or keychain");
    const gatewayKind = args.values.get("gateway-kind");
    const catalogRef = args.values.get("catalog-ref");
    const gatewayEndpoint = args.values.get("gateway-endpoint");
    if (gatewayKind === undefined && (catalogRef !== undefined || gatewayEndpoint !== undefined))
        throw new CliUsageError("--gateway-kind is required with a gateway endpoint or catalog");
    if (gatewayKind !== undefined && (catalogRef === undefined || gatewayEndpoint === undefined))
        throw new CliUsageError("gateway profiles require both --gateway-endpoint and --catalog-ref");
    const catalogSha256 = catalogRef === undefined ? undefined : createHash("sha256").update(await readFile(catalogRef)).digest("hex");
    const gateway = gatewayKind === undefined ? undefined : { kind: gatewayKind, ...(gatewayEndpoint === undefined ? {} : { endpoint: gatewayEndpoint }), ...(catalogRef === undefined ? {} : { catalogRef }), fingerprint: createHash("sha256").update(JSON.stringify({ kind: gatewayKind, endpoint: gatewayEndpoint, catalogSha256 })).digest("hex") };
    const credentialRef = credentialKind === undefined ? undefined : {
        kind: credentialKind,
        name: required(args, "credential-ref"),
        environmentVariable: args.values.get("credential-env") ?? (credentialKind === "environment" ? required(args, "credential-ref") : (() => { throw new CliUsageError("--credential-env is required for keychain credentials"); })()),
    };
    return ExecutionProfile.create({
        schemaVersion: 1,
        id: required(args, "id"),
        transport,
        ...(gateway === undefined ? {} : { gateway }),
        provider: required(args, "provider"),
        model: required(args, "model"),
        ...(credentialRef === undefined ? {} : { credentialRef }),
        capabilities: csvCapabilities(args.values.get("capabilities") ?? "inspect_workspace,modify_workspace,run_commands,read_pipeline"),
        egressHosts: csv(args.values.get("egress") ?? ""),
        costMeter: { kind: costMeter, observable: args.booleans.has("cost-observable") },
        enabled: inputEnabled(args),
        createdAt: at,
        updatedAt: at,
    });
}
function inputEnabled(args) { return args.booleans.has("enabled") || args.booleans.has("activate"); }
function csv(value) { return value === "" ? [] : value.split(",").map((entry) => entry.trim()).filter((entry) => entry.length > 0); }
function csvCapabilities(value) { const values = csv(value); const allowed = new Set(["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"]); if (values.some((entry) => !allowed.has(entry)))
    throw new CliUsageError("--capabilities contains an unsupported value"); return values; }
function required(args, name) { const value = args.values.get(name); if (value === undefined)
    throw new CliUsageError(`--${name} is required`); return value; }
function serializeManifest(value) { return { ...value, entries: value.entries.map((entry) => ({ ...entry })), exactDuplicateAgentGroups: value.exactDuplicateAgentGroups.map((group) => [...group]), inspectedAt: value.inspectedAt.toISOString() }; }
function serializeReceipt(value) { return { ...value, quarantinedAt: value.quarantinedAt.toISOString() }; }
//# sourceMappingURL=orchestration-v23-actions.js.map