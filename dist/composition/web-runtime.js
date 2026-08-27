/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { join, resolve } from "node:path";
import { FsGovernanceStore } from "../adapters/outbound/filesystem/fs-governance-store.js";
import { FsLocalePreferenceStore } from "../adapters/outbound/filesystem/fs-locale-preference-store.js";
import { NativeFolderPicker } from "../adapters/outbound/filesystem/native-folder-picker.js";
import { FsOrchestrationConfigurationStore } from "../adapters/outbound/filesystem/fs-orchestration-configuration-store.js";
import { FsAgentRegistryStore } from "../adapters/outbound/filesystem/fs-agent-registry-store.js";
import { FsOrchestrationCampaignV23Store } from "../adapters/outbound/filesystem/fs-orchestration-campaign-v23-store.js";
import { FsOrchestrationEventStore } from "../adapters/outbound/filesystem/fs-orchestration-event-store.js";
import { GitWorktreeWorkspaceAdapter } from "../adapters/outbound/execution/git-workspace-adapter.js";
import { LocalExecutionProfileRuntimeAdapter } from "../adapters/outbound/execution/execution-profile-runtime-adapter.js";
import { MastraTaskWorkerAdapter } from "../adapters/outbound/execution/mastra-task-worker-adapter.js";
import { withFileLock } from "../adapters/outbound/filesystem/_shared/file-lock.js";
import { startWebServer } from "../adapters/inbound/web/web-server.js";
import { ProjectTrackingService } from "../application/web/project-tracking-service.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
import { createOrchestrationV23Runtime } from "./orchestration-v23-runtime.js";
import { createDoctorRuntime } from "./doctor-runtime.js";
import { createManagementRuntime } from "./management-runtime.js";
import { createPipelineRuntime } from "./pipeline-runtime.js";
import { createFramingRuntime } from "./framing-runtime.js";
export async function createWebRuntime(options) {
    const management = createManagementRuntime({
        homeDir: options.homeDir,
        frameworkRoot: options.frameworkRoot,
        sessionId: options.sessionId,
    });
    const pipeline = createPipelineRuntime(options.frameworkRoot, { homeDir: options.homeDir });
    const preferences = new FsLocalePreferenceStore(options.homeDir);
    const orchestrationConfigurations = new FsOrchestrationConfigurationStore();
    const orchestrationV23 = createOrchestrationV23Runtime({
        projects: management.projects,
        features: management.features,
        agents: management.agents,
        configurations: orchestrationConfigurations,
        campaigns: new FsOrchestrationCampaignV23Store(options.homeDir),
        events: new FsOrchestrationEventStore(options.homeDir),
        git: new GitWorktreeWorkspaceAdapter(options.homeDir),
        profiles: new LocalExecutionProfileRuntimeAdapter(options.homeDir, options.environment ?? process.env),
        worker: new MastraTaskWorkerAdapter(),
    });
    const service = new ProjectTrackingService({
        management,
        pipeline,
        agentOrchestration: createAgentOrchestrationRuntime({ ...management, pipeline, preferredSurface: () => Promise.resolve("web"), allowEmptyAuthorRegistry: true }),
        governance: new FsGovernanceStore(),
        preferences,
        folderPicker: options.folderPicker ?? new NativeFolderPicker(),
        doctor: createDoctorRuntime(options.homeDir, options.cwd),
        homeDir: options.homeDir,
        framing: createFramingRuntime({ homeDir: options.homeDir, frameworkRoot: options.frameworkRoot }),
        orchestrationConfigurations,
        orchestrationV23,
        agentRegistry: new FsAgentRegistryStore(),
        agentsForSession: (sessionId) => createManagementRuntime({ homeDir: options.homeDir, frameworkRoot: options.frameworkRoot, sessionId }).agents,
        doctorExclusive: (operation) => withFileLock(join(options.homeDir, ".arka-norn", "doctor", "repair"), operation),
        ...(options.environment === undefined ? {} : { environment: options.environment }),
    });
    return startWebServer({
        ...(options.port === undefined ? {} : { port: options.port }),
        ...(options.token === undefined ? {} : { token: options.token }),
        webRoot: resolve(options.frameworkRoot, "dist", "web"),
        homeDir: options.homeDir,
        management,
        service,
    });
}
//# sourceMappingURL=web-runtime.js.map