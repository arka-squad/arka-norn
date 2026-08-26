/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { FramingPlan } from "../../domain/framing/framing-plan.js";

export interface FramingPlanReference {
  readonly projectId: string;
  readonly framingId: string;
  readonly planId: string;
  readonly targetKind: "project" | "feature";
  readonly featureId: string | null;
  readonly revision: number;
  readonly fingerprint: string;
  readonly updatedAt: string;
  readonly published: boolean;
}

export interface FramingEvent {
  readonly schemaVersion: 1;
  readonly sequence: number;
  readonly planId: string;
  readonly revision: number;
  readonly kind: "created" | "delta_applied" | "intent_stabilized" | "plan_stabilized" | "published";
  readonly fingerprint: string;
  readonly occurredAt: string;
  readonly metadata: Readonly<Record<string, string | number | boolean | null>>;
}

export interface PublishedFramingPlan {
  readonly plan: FramingPlan;
  readonly absolutePath: string;
  readonly relativePath: string;
  readonly fingerprint: string;
}

export interface FramingStore {
  create(plan: FramingPlan): Promise<FramingPlan>;
  load(projectId: string, framingId: string): Promise<FramingPlan | undefined>;
  loadRevision(projectId: string, framingId: string, revision: number): Promise<FramingPlan | undefined>;
  save(input: {
    readonly projectId: string;
    readonly framingId: string;
    readonly expectedRevision: number;
    readonly plan: FramingPlan;
    readonly eventKind: FramingEvent["kind"];
    readonly metadata?: FramingEvent["metadata"];
  }): Promise<FramingPlan>;
  list(projectId: string): Promise<readonly FramingPlanReference[]>;
  publish(input: {
    readonly projectRoot: string;
    readonly plan: FramingPlan;
  }): Promise<PublishedFramingPlan>;
}
