/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { FramingPlan } from "../../domain/framing/framing-plan.js";
import type { ProjectDraft } from "../../domain/project/project-draft.js";
import type { ProjectPublicationJournal } from "../../domain/project/project-publication.js";
import type { PublishedFramingPlan } from "./framing-store.js";

export interface ProjectPublicationInspection {
  readonly journal: ProjectPublicationJournal;
  readonly healthy: boolean;
  readonly recoverable: boolean;
  readonly message: string;
}

export interface ProjectPublicationStore {
  publish(input: { readonly draft: ProjectDraft; readonly plan: FramingPlan; readonly now: Date }): Promise<PublishedFramingPlan>;
  list(): Promise<readonly ProjectPublicationJournal[]>;
  inspect(projectId: string): Promise<ProjectPublicationInspection>;
  recover(projectId: string, now: Date): Promise<ProjectPublicationJournal>;
}
