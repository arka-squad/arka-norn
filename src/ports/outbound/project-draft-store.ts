/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { ProjectDraft, ProjectDraftMaterialization } from "../../domain/project/project-draft.js";

export interface ProjectDraftResolution {
  readonly draft: ProjectDraft;
  readonly resumed: boolean;
}

export interface ProjectDraftStore {
  resolve(input: {
    readonly id: string;
    readonly name: string;
    readonly root: string;
    readonly now: Date;
  }): Promise<ProjectDraftResolution>;
  load(id: string): Promise<ProjectDraft | undefined>;
  list(): Promise<readonly ProjectDraft[]>;
  verify(id: string): Promise<ProjectDraft>;
  setMaterialization(input: {
    readonly id: string;
    readonly expectedRootFingerprint: string;
    readonly materialization: ProjectDraftMaterialization;
    readonly now: Date;
  }): Promise<ProjectDraft>;
}
