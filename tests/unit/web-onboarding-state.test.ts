/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { FsLocalePreferenceStore } from "../../src/adapters/outbound/filesystem/fs-locale-preference-store.ts";
import { createWebOnboardingState, parseWebOnboardingState } from "../../src/domain/onboarding/web-onboarding-state.ts";

test("Web onboarding requires a verified first Feature before completion", () => {
  assert.throws(() => createWebOnboardingState(
    { status: "completed", step: 2 },
    "human_0123456789abcdef01234567",
    new Date("2026-08-25T08:00:00.000Z"),
  ), /requires a Feature/);
  assert.doesNotThrow(() => createWebOnboardingState(
    { status: "completed", step: 4, projectId: "norn", featureId: "customer-export", lastRoute: "/projects/norn/overview" },
    "human_0123456789abcdef01234567",
    new Date("2026-08-25T08:00:00.000Z"),
  ));
  const legacyNavigation = createWebOnboardingState(
    { status: "not_started", step: 2, projectId: "norn", lastRoute: "/projects/norn/overview" },
    "human_0123456789abcdef01234567",
    new Date("2026-08-25T08:00:00.000Z"),
  );
  assert.equal(legacyNavigation.status, "not_started");
  assert.equal(legacyNavigation.featureId, undefined);
});

test("Web onboarding rejects external routes and unsupported pipelines", () => {
  const base = {
    schemaVersion: 1,
    ownerHumanProfileId: "human_0123456789abcdef01234567",
    status: "in_progress",
    step: 2,
    updatedAt: "2026-08-25T08:00:00.000Z",
  } as const;
  assert.throws(() => parseWebOnboardingState({ ...base, lastRoute: "https://example.test" }), /route/);
  assert.throws(() => parseWebOnboardingState({ ...base, draft: { pipelineId: "default" } }), /pipeline/);
});

test("Web onboarding persists locally and remains bound to the human profile", async (context) => {
  const home = mkdtempSync(resolve(tmpdir(), "arka-norn-web-onboarding-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const store = new FsLocalePreferenceStore(home);
  const profile = await store.saveHumanProfile({ name: "Norn QA" });
  const state = createWebOnboardingState({
    status: "in_progress",
    step: 3,
    projectId: "norn",
    draft: {
      projectName: "Norn",
      projectId: "norn",
      projectRoot: "/work/norn",
      featureName: "Customer export",
      featureId: "customer-export",
      pipelineId: "arka-norn-essential",
    },
  }, profile.id, new Date("2026-08-25T08:00:00.000Z"));
  await store.saveOnboardingState(state);
  assert.deepEqual((await store.loadPreferences()).onboarding, state);
  const raw = readFileSync(resolve(home, ".arka-norn", "preferences.json"), "utf8");
  assert.doesNotMatch(raw, /token|secret|credential/i);
  await assert.rejects(store.saveOnboardingState({ ...state, ownerHumanProfileId: "human_aaaaaaaaaaaaaaaaaaaaaaaa" }), /another human profile/);
});
