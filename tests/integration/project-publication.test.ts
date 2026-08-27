/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsDoctor } from "../../src/adapters/outbound/filesystem/fs-doctor.ts";
import { FsFramingStore } from "../../src/adapters/outbound/filesystem/fs-framing-store.ts";
import { FsProjectDraftStore } from "../../src/adapters/outbound/filesystem/fs-project-draft-store.ts";
import { FsProjectIndexStore } from "../../src/adapters/outbound/filesystem/fs-project-index-store.ts";
import { FsProjectPublicationStore } from "../../src/adapters/outbound/filesystem/fs-project-publication-store.ts";
import { createFramingRuntime } from "../../src/composition/framing-runtime.ts";
import { framingPlanFingerprint, type FramingPlan } from "../../src/domain/framing/framing-plan.ts";
import type { ProjectPublicationState } from "../../src/domain/project/project-publication.ts";

const FRAMEWORK_ROOT = resolve(import.meta.dirname, "..", "..");
const CRASH_STATES: readonly ProjectPublicationState[] = [
  "prepared", "staged", "plan_committed", "marker_committed", "indexed", "materialized",
];

test("la publication ProjectDraft matérialise marker, plan, index et journal de façon idempotente", async (context) => {
  const fixture = await groundedFixture(context, "complete");
  const before = existsSync(resolve(fixture.root, ".arka-norn"));
  assert.equal(before, false);

  const published = await fixture.runtime.publish(fixture.projectId, fixture.plan.target.framingId);
  assert.equal(published.publication?.revision, fixture.plan.revision);
  const markerPath = resolve(fixture.root, ".arka-norn", "project.json");
  const planPath = resolve(fixture.root, published.publication!.relativePath);
  const journalPath = resolve(fixture.home, ".arka-norn", "framing-projects", fixture.projectId, "publication.json");
  assert.equal(existsSync(markerPath), true);
  assert.equal(existsSync(planPath), true);
  assert.equal(JSON.parse(readFileSync(journalPath, "utf8")).state, "materialized");
  assert.equal((await new FsProjectDraftStore(fixture.home).load(fixture.projectId))?.materialization, "materialized");
  assert.equal((await new FsProjectIndexStore({ homeDir: fixture.home }).load())[0]?.root, fixture.root);

  const markerBeforeRetry = readFileSync(markerPath, "utf8");
  const retried = await fixture.runtime.publish(fixture.projectId, fixture.plan.target.framingId);
  assert.equal(retried.revision, published.revision);
  assert.equal(readFileSync(markerPath, "utf8"), markerBeforeRetry);
});

test("chaque interruption de publication est reconstructible sans écraser les artefacts", async (context) => {
  for (const state of CRASH_STATES) {
    const fixture = await groundedFixture(context, state);
    const drafts = new FsProjectDraftStore(fixture.home);
    const draft = await drafts.verify(fixture.projectId);
    const publicationTime = after(draft.updatedAt, 1_000);
    const interrupted = publicationStore(fixture.home, drafts, state);
    await assert.rejects(interrupted.publish({ draft, plan: fixture.plan, now: publicationTime }), /Simulated publication interruption/u);
    const journalPath = resolve(fixture.home, ".arka-norn", "framing-projects", fixture.projectId, "publication.json");
    assert.equal(JSON.parse(readFileSync(journalPath, "utf8")).state, state);

    const recovery = publicationStore(fixture.home, drafts);
    const inspection = await recovery.inspect(fixture.projectId);
    if (state === "materialized") assert.equal(inspection.healthy, true);
    else assert.equal(inspection.recoverable, true, `${state}: ${inspection.message}`);
    const recovered = await recovery.recover(fixture.projectId, after(publicationTime.toISOString(), 1_000));
    assert.equal(recovered.state, "materialized");
    assert.equal(existsSync(resolve(fixture.root, ".arka-norn", "project.json")), true);
    assert.equal(existsSync(resolve(fixture.root, ...recovered.relativePlanPath.split("/"))), true);
  }
});

test("Doctor propose puis applique la reprise exacte d'une publication interrompue", async (context) => {
  const fixture = await groundedFixture(context, "doctor");
  const drafts = new FsProjectDraftStore(fixture.home);
  const draft = await drafts.verify(fixture.projectId);
  // Base the interrupted publication on the draft timestamp without pushing it
  // into the future, so Doctor recovery (which uses the real clock) never
  // observes updatedAt < createdAt under a fast or parallel test run.
  const publicationTime = new Date(Math.max(Date.parse(draft.updatedAt), Date.now()));
  await assert.rejects(
    publicationStore(fixture.home, drafts, "staged").publish({ draft, plan: fixture.plan, now: publicationTime }),
    /Simulated publication interruption/u,
  );

  const doctor = new FsDoctor(fixture.home, fixture.root);
  const preview = await doctor.inspectRuntime(true, false);
  const previewed = preview.find((item) => item.check.id === `framing.publication.${fixture.projectId}`);
  assert.equal(previewed?.check.status, "fail");
  assert.equal(previewed?.repair?.action, "recover_project_publication");
  assert.equal(previewed?.repair?.applied, false);

  const applied = await doctor.inspectRuntime(true, true);
  const repaired = applied.find((item) => item.check.id === `framing.publication.${fixture.projectId}`);
  assert.equal(repaired?.check.status, "pass");
  assert.equal(repaired?.repair?.applied, true);
});

test("Doctor expose un journal corrompu sans interrompre son diagnostic", async (context) => {
  const fixture = await groundedFixture(context, "corrupt-journal");
  const directory = resolve(fixture.home, ".arka-norn", "framing-projects", fixture.projectId);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, "publication.json"), "{not-json}\n");

  const result = await new FsDoctor(fixture.home, fixture.root).inspectRuntime(false, false);
  const publication = result.find((item) => item.check.id === "framing.publications");
  assert.equal(publication?.check.status, "fail");
  assert.match(publication?.check.message ?? "", /journal unreadable/iu);
  assert.equal(publication?.check.repairable, false);
});

test("la publication refuse marker concurrent, répertoire Norn symbolique et sous-module", async (context) => {
  const concurrent = await groundedFixture(context, "concurrent");
  mkdirSync(resolve(concurrent.root, ".arka-norn"));
  writeFileSync(resolve(concurrent.root, ".arka-norn", "project.json"), "{}\n");
  const concurrentDrafts = new FsProjectDraftStore(concurrent.home);
  const concurrentDraft = await concurrentDrafts.verify(concurrent.projectId);
  await assert.rejects(
    publicationStore(concurrent.home, concurrentDrafts).publish({
      draft: concurrentDraft,
      plan: concurrent.plan,
      now: after(concurrentDraft.updatedAt, 1_000),
    }),
    /marker already exists/u,
  );
  assert.equal(existsSync(resolve(concurrent.home, ".arka-norn", "framing-projects", concurrent.projectId, "publication.json")), false);

  const linked = await groundedFixture(context, "symlink");
  const outside = resolve(dirnameFor(linked.root), "outside-marker");
  mkdirSync(outside);
  symlinkSync(outside, resolve(linked.root, ".arka-norn"));
  const linkedDrafts = new FsProjectDraftStore(linked.home);
  const linkedDraft = await linkedDrafts.verify(linked.projectId);
  await assert.rejects(
    publicationStore(linked.home, linkedDrafts).publish({
      draft: linkedDraft,
      plan: linked.plan,
      now: after(linkedDraft.updatedAt, 1_000),
    }),
    /marker destination|publication directory|symbolic-link/iu,
  );
  assert.equal(existsSync(resolve(outside, "project.json")), false);

  const submodule = await groundedFixture(context, "submodule");
  writeFileSync(resolve(submodule.root, ".git"), "gitdir: ../.git/modules/unsafe\n");
  const submoduleDrafts = new FsProjectDraftStore(submodule.home);
  const submoduleDraft = await submoduleDrafts.verify(submodule.projectId);
  await assert.rejects(
    publicationStore(submodule.home, submoduleDrafts).publish({
      draft: submoduleDraft,
      plan: submodule.plan,
      now: after(submoduleDraft.updatedAt, 1_000),
    }),
    /submodule is forbidden/iu,
  );
});

function publicationStore(home: string, drafts: FsProjectDraftStore, interruptAfter?: ProjectPublicationState) {
  const framing = new FsFramingStore(home);
  return new FsProjectPublicationStore({
    homeDir: home,
    drafts,
    framing,
    projectIndex: new FsProjectIndexStore({ homeDir: home }),
    ...(interruptAfter === undefined ? {} : { interruptAfter }),
  });
}

async function groundedFixture(context: { after(callback: () => void): void }, suffix: string) {
  const sandbox = mkdtempSync(join(tmpdir(), `norn-project-publication-${suffix}-`));
  const home = resolve(sandbox, "home");
  const requestedRoot = resolve(sandbox, "product");
  mkdirSync(requestedRoot, { recursive: true });
  const root = realpathSync(requestedRoot);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const runtime = createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT });
  const entry = await runtime.enter({ path: root, contentLocale: "en" });
  let plan = await runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, {
    schemaVersion: 1, planId: entry.plan.id, baseRevision: entry.plan.revision, reason: "product intent",
    operations: [
      item("intent.problem", "problem", "The product lacks a durable project frame.", "human_decision"),
      item("intent.desired_effects", "effect", "The team resumes from an explicit plan.", "human_decision"),
      item("intent.exact_objective", "objective", "Publish the framed Project safely.", "human_decision"),
    ],
  });
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "intent", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  plan = await runtime.applyDelta(entry.project.id.value, plan.target.framingId, {
    schemaVersion: 1, planId: plan.id, baseRevision: plan.revision, reason: "design and decomposition",
    operations: [
      item("solution.design", "design", "An atomic journal materializes the Project.", "technical_design"),
      { op: "propose_decomposition", value: { kind: "project_features", features: [{
        candidateId: "safe-publication", title: "Safe publication", observableOutcome: "The Project becomes resumable",
        acceptanceScenario: "A stopped publication is recovered without overwrite", included: ["marker and plan"], excluded: ["delivery execution"],
        dependsOn: [], cohesionRationale: "The result can be validated independently.",
      }] } },
    ],
  });
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "grounded_plan", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  return { home, root, runtime, projectId: entry.project.id.value, plan };
}

function item(section: keyof FramingPlan["knowledge"], id: string, statement: string, kind: "human_decision" | "technical_design") {
  return { op: "upsert_knowledge" as const, section, value: { id, statement, provenance: { kind, reference: "test" } } };
}

function dirnameFor(path: string): string {
  return resolve(path, "..");
}

function after(timestamp: string, milliseconds: number): Date {
  return new Date(Date.parse(timestamp) + milliseconds);
}
