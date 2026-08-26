/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { FramingService } from "../application/framing/framing-service.js";
import { FsFramingStore } from "../adapters/outbound/filesystem/fs-framing-store.js";
import { FsProjectDraftStore } from "../adapters/outbound/filesystem/fs-project-draft-store.js";
import { FsRepositoryProbe } from "../adapters/outbound/filesystem/fs-repository-probe.js";
import { createManagementRuntime } from "./management-runtime.js";
export function createFramingRuntime(options) {
    const management = createManagementRuntime(options);
    return new FramingService({
        projects: management.projects,
        features: management.features,
        projectDrafts: new FsProjectDraftStore(options.homeDir),
        store: new FsFramingStore(options.homeDir),
        repositoryProbe: new FsRepositoryProbe(),
    });
}
//# sourceMappingURL=framing-runtime.js.map