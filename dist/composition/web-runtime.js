/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { resolve } from "node:path";
import { FsGovernanceStore } from "../adapters/outbound/filesystem/fs-governance-store.js";
import { FsLocalePreferenceStore } from "../adapters/outbound/filesystem/fs-locale-preference-store.js";
import { startWebServer } from "../adapters/inbound/web/web-server.js";
import { ProjectTrackingService } from "../application/web/project-tracking-service.js";
import { createDoctorRuntime } from "./doctor-runtime.js";
import { createManagementRuntime } from "./management-runtime.js";
import { createPipelineRuntime } from "./pipeline-runtime.js";
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
        governance: new FsGovernanceStore(),
        preferences,
        doctor: createDoctorRuntime(options.homeDir, options.cwd),
        homeDir: options.homeDir,
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