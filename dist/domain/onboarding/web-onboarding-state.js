/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { FeatureId } from "../feature/feature-id.js";
import { ProjectId } from "../project/project-id.js";
export function createWebOnboardingState(input, ownerHumanProfileId, updatedAt) {
    return parseWebOnboardingState({ schemaVersion: 1, ownerHumanProfileId, updatedAt: updatedAt.toISOString(), ...input });
}
export function parseWebOnboardingState(value) {
    if (!isRecord(value) || value["schemaVersion"] !== 1)
        throw new Error("Invalid Web onboarding state.");
    const status = onboardingStatus(value["status"]);
    const step = onboardingStep(value["step"]);
    const ownerHumanProfileId = text(value["ownerHumanProfileId"], "owner", 64);
    if (!/^human_[a-f0-9]{24}$/u.test(ownerHumanProfileId))
        throw new Error("Invalid Web onboarding owner.");
    const projectId = optionalId(value["projectId"], (candidate) => ProjectId.isValid(candidate), "Project");
    const featureId = optionalId(value["featureId"], (candidate) => FeatureId.isValid(candidate), "Feature");
    const draft = value["draft"] === undefined ? undefined : onboardingDraft(value["draft"]);
    const lastRoute = value["lastRoute"] === undefined ? undefined : route(value["lastRoute"]);
    const updatedAt = text(value["updatedAt"], "updated date", 64);
    if (!Number.isFinite(Date.parse(updatedAt)))
        throw new Error("Invalid Web onboarding update date.");
    if (step >= 3 && projectId === undefined)
        throw new Error("Web onboarding requires a Project from step 3.");
    if (step === 4 && featureId === undefined)
        throw new Error("Web onboarding requires a Feature at step 4.");
    if (featureId !== undefined && projectId === undefined)
        throw new Error("Web onboarding Feature requires a Project.");
    if (status === "completed" && featureId === undefined)
        throw new Error("Completed Web onboarding requires a Feature.");
    return Object.freeze({
        schemaVersion: 1,
        status,
        step,
        ownerHumanProfileId,
        updatedAt,
        ...(projectId === undefined ? {} : { projectId }),
        ...(featureId === undefined ? {} : { featureId }),
        ...(draft === undefined ? {} : { draft }),
        ...(lastRoute === undefined ? {} : { lastRoute }),
    });
}
function onboardingDraft(value) {
    if (!isRecord(value))
        throw new Error("Invalid Web onboarding draft.");
    const projectName = optionalText(value["projectName"], "Project name", 256);
    const projectId = optionalId(value["projectId"], (candidate) => ProjectId.isValid(candidate), "Project draft");
    const projectRoot = optionalText(value["projectRoot"], "Project root", 4_096);
    const featureName = optionalText(value["featureName"], "Feature name", 256);
    const featureId = optionalId(value["featureId"], (candidate) => FeatureId.isValid(candidate), "Feature draft");
    const pipelineId = optionalText(value["pipelineId"], "pipeline", 64);
    if (pipelineId !== undefined && !/^arka-norn-(?:complete|essential|fastdev)$/u.test(pipelineId)) {
        throw new Error("Invalid Web onboarding pipeline.");
    }
    return Object.freeze({
        ...(projectName === undefined ? {} : { projectName }),
        ...(projectId === undefined ? {} : { projectId }),
        ...(projectRoot === undefined ? {} : { projectRoot }),
        ...(featureName === undefined ? {} : { featureName }),
        ...(featureId === undefined ? {} : { featureId }),
        ...(pipelineId === undefined ? {} : { pipelineId }),
    });
}
function onboardingStatus(value) {
    if (value !== "not_started" && value !== "in_progress" && value !== "completed")
        throw new Error("Invalid Web onboarding status.");
    return value;
}
function onboardingStep(value) {
    if (value !== 1 && value !== 2 && value !== 3 && value !== 4)
        throw new Error("Invalid Web onboarding step.");
    return value;
}
function optionalId(value, valid, label) {
    if (value === undefined || typeof value === "string" && value.trim().length === 0)
        return undefined;
    const candidate = text(value, `${label} id`, 64);
    if (!valid(candidate))
        throw new Error(`Invalid Web onboarding ${label} id.`);
    return candidate;
}
function optionalText(value, label, max) {
    return value === undefined || typeof value === "string" && value.trim().length === 0 ? undefined : text(value, label, max);
}
function route(value) {
    const candidate = text(value, "route", 2_048);
    if (!/^\/projects(?:\/|$)/u.test(candidate))
        throw new Error("Invalid Web onboarding route.");
    return candidate;
}
function text(value, label, max) {
    if (typeof value !== "string")
        throw new Error(`Web onboarding ${label} must be a string.`);
    const candidate = value.trim();
    if (candidate.length === 0 || candidate.length > max || /[\u0000-\u001f\u007f]/u.test(candidate))
        throw new Error(`Invalid Web onboarding ${label}.`);
    return candidate;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
//# sourceMappingURL=web-onboarding-state.js.map