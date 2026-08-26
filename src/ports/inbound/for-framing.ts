/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { Project } from "../../domain/project/project.js";
import type { ProjectDraft } from "../../domain/project/project-draft.js";
import type {
  FramingPlan, FramingResumePacket, PlanDelta,
} from "../../domain/framing/framing-plan.js";
import type { FramingPlanReference } from "../outbound/framing-store.js";

export type FramingView = "summary" | "plan" | "evidence" | "map";

export interface FramingEntry {
  readonly project: Project;
  readonly projectDraft: ProjectDraft | null;
  readonly plan: FramingPlan;
  readonly resumed: boolean;
}

export interface ForFraming {
  enter(input: {
    readonly path: string;
    readonly existingFeatureId?: string;
    readonly newFeatureTitle?: string;
    readonly contentLocale: "en" | "fr";
  }): Promise<FramingEntry>;
  locateProject(path: string, initialize: boolean): Promise<Project>;
  list(projectId: string): Promise<readonly FramingPlanReference[]>;
  show(projectId: string, framingId?: string): Promise<FramingPlan>;
  showRevision(projectId: string, framingId: string, revision: number): Promise<FramingPlan | undefined>;
  project(plan: FramingPlan, view: FramingView): unknown;
  resume(projectId: string, framingId?: string): Promise<FramingResumePacket>;
  applyDelta(projectId: string, framingId: string, delta: PlanDelta): Promise<FramingPlan>;
  stabilize(input: {
    readonly projectId: string;
    readonly framingId: string;
    readonly kind: "intent" | "grounded_plan";
    readonly actorId: string;
    readonly fingerprint: string;
  }): Promise<FramingPlan>;
  publish(projectId: string, framingId: string): Promise<FramingPlan>;
}
