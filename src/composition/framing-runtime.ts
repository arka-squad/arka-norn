/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { FramingService } from "../application/framing/framing-service.js";
import { FsFramingStore } from "../adapters/outbound/filesystem/fs-framing-store.js";
import { FsProjectIndexStore } from "../adapters/outbound/filesystem/fs-project-index-store.js";
import { FsProjectDraftStore } from "../adapters/outbound/filesystem/fs-project-draft-store.js";
import { FsProjectPublicationStore } from "../adapters/outbound/filesystem/fs-project-publication-store.js";
import { FsRepositoryProbe } from "../adapters/outbound/filesystem/fs-repository-probe.js";
import type { ForFraming } from "../ports/inbound/for-framing.js";

import { createManagementRuntime } from "./management-runtime.js";

export function createFramingRuntime(options: {
  readonly homeDir: string;
  readonly frameworkRoot?: string;
}): ForFraming {
  const management = createManagementRuntime(options);
  const projectDrafts = new FsProjectDraftStore(options.homeDir);
  const store = new FsFramingStore(options.homeDir);
  return new FramingService({
    projects: management.projects,
    features: management.features,
    projectDrafts,
    projectPublications: new FsProjectPublicationStore({
      homeDir: options.homeDir,
      drafts: projectDrafts,
      framing: store,
      projectIndex: new FsProjectIndexStore({ homeDir: options.homeDir }),
    }),
    store,
    repositoryProbe: new FsRepositoryProbe(),
  });
}
