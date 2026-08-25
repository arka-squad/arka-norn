/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { FeatureId } from "../feature/feature-id.js";
import { ProjectId } from "../project/project-id.js";

export type WebOnboardingStatus = "not_started" | "in_progress" | "completed";
export type WebOnboardingStep = 1 | 2 | 3 | 4;

export interface WebOnboardingDraft {
  readonly projectName?: string;
  readonly projectId?: string;
  readonly projectRoot?: string;
  readonly featureName?: string;
  readonly featureId?: string;
  readonly pipelineId?: string;
}

export interface WebOnboardingProgress {
  readonly status: WebOnboardingStatus;
  readonly step: WebOnboardingStep;
  readonly projectId?: string;
  readonly featureId?: string;
  readonly draft?: WebOnboardingDraft;
  readonly lastRoute?: string;
}

export interface WebOnboardingState extends WebOnboardingProgress {
  readonly schemaVersion: 1;
  readonly ownerHumanProfileId: string;
  readonly updatedAt: string;
}

export function createWebOnboardingState(
  input: WebOnboardingProgress,
  ownerHumanProfileId: string,
  updatedAt: Date,
): WebOnboardingState {
  return parseWebOnboardingState({ schemaVersion: 1, ownerHumanProfileId, updatedAt: updatedAt.toISOString(), ...input });
}

export function parseWebOnboardingState(value: unknown): WebOnboardingState {
  if (!isRecord(value) || value["schemaVersion"] !== 1) throw new Error("Invalid Web onboarding state.");
  const status = onboardingStatus(value["status"]);
  const step = onboardingStep(value["step"]);
  const ownerHumanProfileId = text(value["ownerHumanProfileId"], "owner", 64);
  if (!/^human_[a-f0-9]{24}$/u.test(ownerHumanProfileId)) throw new Error("Invalid Web onboarding owner.");
  const projectId = optionalId(value["projectId"], (candidate) => ProjectId.isValid(candidate), "Project");
  const featureId = optionalId(value["featureId"], (candidate) => FeatureId.isValid(candidate), "Feature");
  const draft = value["draft"] === undefined ? undefined : onboardingDraft(value["draft"]);
  const lastRoute = value["lastRoute"] === undefined ? undefined : route(value["lastRoute"]);
  const updatedAt = text(value["updatedAt"], "updated date", 64);
  if (!Number.isFinite(Date.parse(updatedAt))) throw new Error("Invalid Web onboarding update date.");
  if (step >= 3 && projectId === undefined) throw new Error("Web onboarding requires a Project from step 3.");
  if (step === 4 && featureId === undefined) throw new Error("Web onboarding requires a Feature at step 4.");
  if (featureId !== undefined && projectId === undefined) throw new Error("Web onboarding Feature requires a Project.");
  if (status === "completed" && featureId === undefined) throw new Error("Completed Web onboarding requires a Feature.");
  return Object.freeze({
    schemaVersion: 1,
    status,
    step,
    ownerHumanProfileId,
    updatedAt,
    ...(projectId === undefined ? {} : { projectId }),
    ...(featureId === undefined ? {} : { featureId }),
    ...(draft === undefined ? {} : { draft }),
    ...(lastRoute === undefined ? {} : { lastRoute }),
  });
}

function onboardingDraft(value: unknown): WebOnboardingDraft {
  if (!isRecord(value)) throw new Error("Invalid Web onboarding draft.");
  const projectName = optionalText(value["projectName"], "Project name", 256);
  const projectId = optionalId(value["projectId"], (candidate) => ProjectId.isValid(candidate), "Project draft");
  const projectRoot = optionalText(value["projectRoot"], "Project root", 4_096);
  const featureName = optionalText(value["featureName"], "Feature name", 256);
  const featureId = optionalId(value["featureId"], (candidate) => FeatureId.isValid(candidate), "Feature draft");
  const pipelineId = optionalText(value["pipelineId"], "pipeline", 64);
  if (pipelineId !== undefined && !/^arka-norn-(?:complete|essential|fastdev)$/u.test(pipelineId)) {
    throw new Error("Invalid Web onboarding pipeline.");
  }
  return Object.freeze({
    ...(projectName === undefined ? {} : { projectName }),
    ...(projectId === undefined ? {} : { projectId }),
    ...(projectRoot === undefined ? {} : { projectRoot }),
    ...(featureName === undefined ? {} : { featureName }),
    ...(featureId === undefined ? {} : { featureId }),
    ...(pipelineId === undefined ? {} : { pipelineId }),
  });
}

function onboardingStatus(value: unknown): WebOnboardingStatus {
  if (value !== "not_started" && value !== "in_progress" && value !== "completed") throw new Error("Invalid Web onboarding status.");
  return value;
}

function onboardingStep(value: unknown): WebOnboardingStep {
  if (value !== 1 && value !== 2 && value !== 3 && value !== 4) throw new Error("Invalid Web onboarding step.");
  return value;
}

function optionalId(value: unknown, valid: (candidate: string) => boolean, label: string): string | undefined {
  if (value === undefined || typeof value === "string" && value.trim().length === 0) return undefined;
  const candidate = text(value, `${label} id`, 64);
  if (!valid(candidate)) throw new Error(`Invalid Web onboarding ${label} id.`);
  return candidate;
}

function optionalText(value: unknown, label: string, max: number): string | undefined {
  return value === undefined || typeof value === "string" && value.trim().length === 0 ? undefined : text(value, label, max);
}

function route(value: unknown): string {
  const candidate = text(value, "route", 2_048);
  if (!/^\/projects(?:\/|$)/u.test(candidate)) throw new Error("Invalid Web onboarding route.");
  return candidate;
}

function text(value: unknown, label: string, max: number): string {
  if (typeof value !== "string") throw new Error(`Web onboarding ${label} must be a string.`);
  const candidate = value.trim();
  if (candidate.length === 0 || candidate.length > max || /[\u0000-\u001f\u007f]/u.test(candidate)) throw new Error(`Invalid Web onboarding ${label}.`);
  return candidate;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
