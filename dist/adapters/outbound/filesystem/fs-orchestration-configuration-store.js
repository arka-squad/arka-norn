/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { join } from "node:path";
import { ExecutionProfile } from "../../../domain/orchestration/execution-profile.js";
import { ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION, OrchestrationConfiguration } from "../../../domain/orchestration/orchestration-configuration.js";
import { readJson, writeJsonAtomic } from "./_shared/atomic-json.js";
import { withFileLock } from "./_shared/file-lock.js";
import { FsPathPolicy } from "./fs-path-policy.js";
export class FsOrchestrationConfigurationStore {
    paths;
    constructor(paths = new FsPathPolicy()) { this.paths = paths; }
    async load(project) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        const value = await readJson(configurationPath(project.root));
        if (value === undefined)
            return undefined;
        if (!isRecord(value) || value["schemaVersion"] !== ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION) {
            throw new Error("Legacy orchestration state is read-only; inspect and import it explicitly before using automatic orchestration 2.3.");
        }
        const configuration = deserialize(value);
        if (configuration.projectId !== project.id.value)
            throw new Error("Orchestration configuration projectId mismatch.");
        return configuration;
    }
    async save(project, configuration) {
        await this.paths.assertMarkerRoot(project.root, project.root);
        if (configuration.projectId !== project.id.value)
            throw new Error("Orchestration configuration projectId mismatch.");
        const path = configurationPath(project.root);
        await withFileLock(path, async () => {
            const current = await readJson(path);
            if (current !== undefined && (!isRecord(current) || current["schemaVersion"] !== ORCHESTRATION_CONFIGURATION_SCHEMA_VERSION)) {
                throw new Error("Refusing to overwrite legacy orchestration state; quarantine or import it first.");
            }
            await writeJsonAtomic(path, serialize(configuration), { mode: 0o600 });
        });
    }
}
export function serializeOrchestrationConfiguration(value) {
    const props = value.props;
    return {
        schemaVersion: 4,
        projectId: props.projectId,
        automaticEnabled: props.automaticEnabled,
        profiles: props.profiles.map((profile) => ({ ...profile, createdAt: profile.createdAt.toISOString(), updatedAt: profile.updatedAt.toISOString() })),
        riskPolicy: { ...props.riskPolicy, ...(props.riskPolicy.extraWeights === undefined ? {} : { extraWeights: { ...props.riskPolicy.extraWeights } }) },
        createdAt: props.createdAt.toISOString(),
        updatedAt: props.updatedAt.toISOString(),
    };
}
export function configurationPath(projectRoot) { return join(projectRoot, ".arka-norn", "orchestration.json"); }
function serialize(value) { return serializeOrchestrationConfiguration(value); }
function deserialize(value) {
    if (!hasExactKeys(value, ["schemaVersion", "projectId", "automaticEnabled", "profiles", "riskPolicy", "createdAt", "updatedAt"]) || value["schemaVersion"] !== 4 || typeof value["projectId"] !== "string" || typeof value["automaticEnabled"] !== "boolean" || !Array.isArray(value["profiles"]) || !isRecord(value["riskPolicy"]) || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string")
        throw new Error("Invalid orchestration configuration file.");
    const profiles = value["profiles"].map(deserializeProfile);
    const risk = value["riskPolicy"];
    if (typeof risk["automaticThreshold"] !== "number" || (risk["extraWeights"] !== undefined && !isNumberRecord(risk["extraWeights"])))
        throw new Error("Invalid orchestration risk policy.");
    return OrchestrationConfiguration.create({
        schemaVersion: 4,
        projectId: value["projectId"],
        automaticEnabled: value["automaticEnabled"],
        profiles,
        riskPolicy: { automaticThreshold: risk["automaticThreshold"], ...(risk["extraWeights"] === undefined ? {} : { extraWeights: risk["extraWeights"] }) },
        createdAt: parseDate(value["createdAt"]),
        updatedAt: parseDate(value["updatedAt"]),
    });
}
function deserializeProfile(value) {
    if (!isRecord(value) || typeof value["createdAt"] !== "string" || typeof value["updatedAt"] !== "string")
        throw new Error("Invalid execution profile in orchestration configuration.");
    return ExecutionProfile.create({ ...value, createdAt: parseDate(value["createdAt"]), updatedAt: parseDate(value["updatedAt"]) }).props;
}
function parseDate(value) { const parsed = new Date(value); if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value)
    throw new Error("Invalid orchestration timestamp."); return parsed; }
function isRecord(value) { return typeof value === "object" && value !== null && !Array.isArray(value); }
function isNumberRecord(value) { return isRecord(value) && Object.values(value).every((entry) => typeof entry === "number"); }
function hasExactKeys(value, keys) { const actual = Object.keys(value).sort(); const expected = [...keys].sort(); return actual.length === expected.length && actual.every((key, index) => key === expected[index]); }
//# sourceMappingURL=fs-orchestration-configuration-store.js.map