import { describe, expect, it } from "vitest";

import type { ProjectListItem, WebPreferences } from "../../../src/application/web/contracts";
import { decideOnboarding, featureRoot, isSafeRememberedRoute, slug } from "./onboarding-model";

const project: ProjectListItem = {
  id: "norn",
  name: "Norn",
  root: "/work/norn",
  featureCount: 1,
  health: "healthy",
  updatedAt: "2026-08-25T08:00:00.000Z",
};
const profile = { id: "human_0123456789abcdef01234567", name: "Norn QA" };
const base: WebPreferences = { locale: "fr", resolvedLocale: "fr", preferredSurface: "web", humanProfile: profile };

describe("onboarding entry", () => {
  it("starts with identity when no human profile exists", () => {
    expect(decideOnboarding({ locale: "en", resolvedLocale: "en", preferredSurface: "web" }, [])).toMatchObject({ active: true, step: 1 });
  });

  it("skips onboarding for a legacy configured user", () => {
    expect(decideOnboarding(base, [project])).toEqual({ active: false, recovery: "none" });
  });

  it("keeps a completed configured user outside onboarding", () => {
    const preferences: WebPreferences = {
      ...base,
      onboarding: {
        schemaVersion: 1,
        ownerHumanProfileId: profile.id,
        status: "completed",
        step: 4,
        projectId: project.id,
        featureId: "customer-export",
        lastRoute: "/projects/norn/features/customer-export",
        updatedAt: "2026-08-25T08:00:00.000Z",
      },
    };
    expect(decideOnboarding(preferences, [project])).toEqual({ active: false, recovery: "none" });
  });

  it("resumes the exact persisted step", () => {
    const preferences: WebPreferences = {
      ...base,
      onboarding: {
        schemaVersion: 1,
        ownerHumanProfileId: profile.id,
        status: "in_progress",
        step: 3,
        projectId: project.id,
        draft: { featureName: "Customer export", featureId: "customer-export", pipelineId: "arka-norn-essential" },
        updatedAt: "2026-08-25T08:00:00.000Z",
      },
    };
    expect(decideOnboarding(preferences, [project])).toMatchObject({ active: true, step: 3, recovery: "none" });
  });

  it("returns to Project selection when the remembered Project disappeared", () => {
    const preferences: WebPreferences = {
      ...base,
      onboarding: {
        schemaVersion: 1,
        ownerHumanProfileId: profile.id,
        status: "in_progress",
        step: 3,
        projectId: "missing",
        updatedAt: "2026-08-25T08:00:00.000Z",
      },
    };
    expect(decideOnboarding(preferences, [project])).toMatchObject({ active: true, step: 2, recovery: "project_missing" });
  });

  it("does not reuse another local identity's unfinished onboarding", () => {
    const preferences: WebPreferences = {
      ...base,
      onboarding: {
        schemaVersion: 1,
        ownerHumanProfileId: "human_abcdef0123456789abcdef01",
        status: "in_progress",
        step: 2,
        draft: { projectName: "Private draft" },
        updatedAt: "2026-08-25T08:00:00.000Z",
      },
    };
    expect(decideOnboarding(preferences, [])).toMatchObject({ active: true, step: 2, recovery: "owner_changed" });
  });
});

describe("onboarding path helpers", () => {
  it("creates Feature folders under the canonical features directory", () => {
    expect(featureRoot("/work/norn/", "customer-export")).toBe("/work/norn/features/customer-export");
    expect(featureRoot("C:\\work\\norn", "customer-export")).toBe("C:\\work\\norn\\features\\customer-export");
    expect(slug("Customer export")).toBe("customer-export");
  });

  it("accepts only local Project routes for resume", () => {
    expect(isSafeRememberedRoute("/projects/norn/features/customer-export")).toBe(true);
    expect(isSafeRememberedRoute("https://example.test")).toBe(false);
    expect(isSafeRememberedRoute("/settings")).toBe(false);
  });
});
