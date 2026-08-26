/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { ProjectId } from "./project-id.js";

export const PROJECT_DRAFT_MATERIALIZATIONS = ["draft", "publishing", "materialized", "recovery_required"] as const;

export type ProjectDraftMaterialization = (typeof PROJECT_DRAFT_MATERIALIZATIONS)[number];

export interface ProjectDraft {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly name: string;
  readonly root: string;
  readonly orchestrationMode: "manual";
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly materialization: ProjectDraftMaterialization;
  readonly rootFingerprint: string;
}

export function createProjectDraft(input: Omit<ProjectDraft, "schemaVersion" | "orchestrationMode" | "materialization">): ProjectDraft {
  return parseProjectDraft({
    ...input,
    schemaVersion: 1,
    orchestrationMode: "manual",
    materialization: "draft",
  });
}

export function parseProjectDraft(value: unknown): ProjectDraft {
  if (!isRecord(value)) throw new Error("Invalid ProjectDraft: expected an object.");
  if (value["schemaVersion"] !== 1) throw new Error("Invalid ProjectDraft schemaVersion.");
  const id = requiredString(value, "id", 64);
  ProjectId.of(id);
  const name = requiredString(value, "name", 256);
  const root = requiredString(value, "root", 4_096);
  if (!root.startsWith("/") && !/^[A-Za-z]:[\\/]/u.test(root)) throw new Error("Invalid ProjectDraft root.");
  if (value["orchestrationMode"] !== "manual") throw new Error("A ProjectDraft must remain in manual orchestration mode.");
  const createdAt = dateString(value, "createdAt");
  const updatedAt = dateString(value, "updatedAt");
  if (Date.parse(updatedAt) < Date.parse(createdAt)) throw new Error("Invalid ProjectDraft timestamps.");
  const materialization = value["materialization"];
  if (!PROJECT_DRAFT_MATERIALIZATIONS.includes(materialization as ProjectDraftMaterialization)) {
    throw new Error("Invalid ProjectDraft materialization state.");
  }
  const rootFingerprint = requiredString(value, "rootFingerprint", 64);
  if (!/^[a-f0-9]{64}$/u.test(rootFingerprint)) throw new Error("Invalid ProjectDraft root fingerprint.");
  return Object.freeze({
    schemaVersion: 1,
    id,
    name,
    root,
    orchestrationMode: "manual",
    createdAt,
    updatedAt,
    materialization: materialization as ProjectDraftMaterialization,
    rootFingerprint,
  });
}

function requiredString(value: Readonly<Record<string, unknown>>, field: string, maximum: number): string {
  const candidate = value[field];
  if (typeof candidate !== "string" || candidate.trim().length === 0 || candidate.length > maximum) {
    throw new Error(`Invalid ProjectDraft ${field}.`);
  }
  return candidate;
}

function dateString(value: Readonly<Record<string, unknown>>, field: string): string {
  const candidate = requiredString(value, field, 64);
  if (Number.isNaN(Date.parse(candidate))) throw new Error(`Invalid ProjectDraft ${field}.`);
  return candidate;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
