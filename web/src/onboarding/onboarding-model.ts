import type { ProjectListItem, WebPreferences } from "../../../src/application/web/contracts";
import type { WebOnboardingProgress, WebOnboardingStep } from "../../../src/domain/onboarding/web-onboarding-state";
import { contracts } from "../generated/contracts";

export interface OnboardingEntry {
  readonly active: boolean;
  readonly step?: WebOnboardingStep;
  readonly progress?: WebOnboardingProgress;
  readonly recovery: "none" | "project_missing" | "owner_changed";
}

export function decideOnboarding(preferences: WebPreferences, projects: readonly ProjectListItem[]): OnboardingEntry {
  const profile = preferences.humanProfile;
  const saved = preferences.onboarding;
  if (profile === undefined) return { active: true, step: 1, recovery: saved === undefined ? "none" : "owner_changed" };
  if (saved !== undefined && saved.ownerHumanProfileId !== profile.id) {
    return projects.length === 0
      ? { active: true, step: 2, progress: freshProgress(2), recovery: "owner_changed" }
      : { active: false, recovery: "owner_changed" };
  }
  if (saved?.status === "completed") return { active: false, recovery: "none" };
  if (saved?.status === "in_progress") {
    const projectExists = saved.projectId === undefined || projects.some((project) => project.id === saved.projectId);
    if (!projectExists) return { active: true, step: 2, progress: freshProgress(2, saved), recovery: "project_missing" };
    return { active: true, step: saved.step, progress: toProgress(saved), recovery: "none" };
  }
  if (projects.length === 0) return { active: true, step: 2, progress: freshProgress(2), recovery: "none" };
  return { active: false, recovery: "none" };
}

export function freshProgress(step: WebOnboardingStep, previous?: WebOnboardingProgress): WebOnboardingProgress {
  return {
    status: "in_progress",
    step,
    ...(previous?.draft === undefined ? {} : { draft: previous.draft }),
    ...(previous?.lastRoute === undefined ? {} : { lastRoute: previous.lastRoute }),
  };
}

export function toProgress(preferences: NonNullable<WebPreferences["onboarding"]>): WebOnboardingProgress {
  return {
    status: preferences.status,
    step: preferences.step,
    ...(preferences.projectId === undefined ? {} : { projectId: preferences.projectId }),
    ...(preferences.featureId === undefined ? {} : { featureId: preferences.featureId }),
    ...(preferences.draft === undefined ? {} : { draft: preferences.draft }),
    ...(preferences.lastRoute === undefined ? {} : { lastRoute: preferences.lastRoute }),
  };
}

export function featureRoot(projectRoot: string, featureId: string): string {
  const separator = projectRoot.includes("\\") && !projectRoot.includes("/") ? "\\" : "/";
  return `${projectRoot.replace(/[\\/]+$/u, "")}${separator}features${separator}${featureId}`;
}

export function slug(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "").slice(0, 64);
}

export function isSafeRememberedRoute(value: string | undefined): value is string {
  return value !== undefined && /^\/projects(?:\/[a-z0-9][a-z0-9._-]{0,127})?(?:\/.*)?$/u.test(value);
}

export function pipelineName(id: string): string {
  return contracts.pipelines.find((pipeline) => pipeline.id === id)?.name ?? "—";
}
