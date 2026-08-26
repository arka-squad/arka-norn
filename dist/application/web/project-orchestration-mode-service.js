/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { ProjectId } from "../../domain/project/project-id.js";
import { assertExpectedTimestamp, WebMutationError } from "./web-mutation-concurrency.js";
export async function projectOrchestrationModeView(configurations, project, orchestrations) {
    const activeRuns = orchestrations.filter((item) => isActive(item.status)).map((item) => ({ id: item.id, status: item.status }));
    try {
        const configuration = await configurations.load(project);
        if (configuration === undefined)
            return {
                activeRuns,
                preflight: { readyForPreview: false, configurationPresent: false, configuredProfiles: 0, enabledProfiles: 0, missing: ["configuration_missing"] },
            };
        const enabledProfiles = configuration.profiles.filter((profile) => profile.enabled).length;
        return {
            activeRuns,
            preflight: {
                readyForPreview: enabledProfiles > 0,
                configurationPresent: true,
                configuredProfiles: configuration.profiles.length,
                enabledProfiles,
                missing: enabledProfiles > 0 ? [] : ["enabled_profile_missing"],
            },
        };
    }
    catch {
        return {
            activeRuns,
            preflight: { readyForPreview: false, configurationPresent: true, configuredProfiles: 0, enabledProfiles: 0, missing: ["configuration_invalid"] },
        };
    }
}
export async function setProjectOrchestrationMode(deps, projectId, input) {
    if (input.mode !== "manual" && input.mode !== "automatic")
        throw new WebMutationError(400, "invalid_orchestration_mode");
    const indexed = (await deps.management.projects.list()).find((candidate) => candidate.id.value === projectId);
    if (indexed === undefined) {
        if (await deps.framing.showProjectDraft(projectId) !== undefined)
            throw new WebMutationError(409, "project_draft_not_materialized");
        await deps.management.projects.show(ProjectId.of(projectId));
        throw new Error("Unreachable Project resolution.");
    }
    const project = await deps.management.projects.show(indexed.id);
    assertExpectedTimestamp(input.expectedUpdatedAt, project.updatedAt, "project_changed");
    if (project.orchestrationMode === input.mode)
        return;
    if (input.mode === "automatic") {
        const configuration = await requiredConfiguration(deps.configurations, project);
        const enabledProfiles = configuration?.profiles.filter((profile) => profile.enabled) ?? [];
        if (configuration === undefined || enabledProfiles.length === 0) {
            throw new WebMutationError(422, "automatic_preflight_required", {
                configurationPresent: configuration !== undefined,
                configuredProfiles: configuration?.profiles.length ?? 0,
                enabledProfiles: enabledProfiles.length,
            });
        }
        if (!configuration.automaticEnabled)
            await deps.configurations.save(project, configuration.activate(deps.now()));
        await deps.management.projects.setOrchestrationMode({ id: project.id, orchestrationMode: "automatic" });
        return;
    }
    await deps.management.projects.setOrchestrationMode({ id: project.id, orchestrationMode: "manual" });
    const configuration = await deps.configurations.load(project).catch(() => undefined);
    if (configuration?.automaticEnabled === true)
        await deps.configurations.save(project, configuration.deactivate(deps.now()));
}
async function requiredConfiguration(store, project) {
    try {
        return await store.load(project);
    }
    catch {
        throw new WebMutationError(422, "automatic_preflight_required", {
            configurationPresent: true, configurationInvalid: true, configuredProfiles: 0, enabledProfiles: 0,
        });
    }
}
function isActive(status) {
    return ["planned", "prepared", "authorized", "running", "awaiting_approval", "awaiting_application", "blocked", "budget_stopped"].includes(status);
}
//# sourceMappingURL=project-orchestration-mode-service.js.map