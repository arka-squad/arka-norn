/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { resolve } from "node:path";
import { FsGovernanceStore } from "../adapters/outbound/filesystem/fs-governance-store.js";
import { FsLocalePreferenceStore } from "../adapters/outbound/filesystem/fs-locale-preference-store.js";
import { NativeFolderPicker } from "../adapters/outbound/filesystem/native-folder-picker.js";
import { FsOrchestrationConfigurationStore } from "../adapters/outbound/filesystem/fs-orchestration-configuration-store.js";
import { FsAgentRegistryStore } from "../adapters/outbound/filesystem/fs-agent-registry-store.js";
import { startWebServer } from "../adapters/inbound/web/web-server.js";
import { ProjectTrackingService } from "../application/web/project-tracking-service.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
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
        orchestrationConfigurations: new FsOrchestrationConfigurationStore(),
        agentRegistry: new FsAgentRegistryStore(),
        agentsForSession: (sessionId) => createManagementRuntime({ homeDir: options.homeDir, frameworkRoot: options.frameworkRoot, sessionId }).agents,
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