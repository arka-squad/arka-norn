/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsFramingStore } from "../../src/adapters/outbound/filesystem/fs-framing-store.ts";
import { FsRepositoryProbe } from "../../src/adapters/outbound/filesystem/fs-repository-probe.ts";
import { createFramingRuntime } from "../../src/composition/framing-runtime.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { loadTaskPlans } from "../../src/composition/orchestration-v23-plan-builder.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { framingPlanFingerprint, type FramingPlan, type PlanDelta } from "../../src/domain/framing/framing-plan.ts";

const FRAMEWORK_ROOT = resolve(import.meta.dirname, "..", "..");

test("la sonde distingue vide, squelette, implémenté et indéterminé sans compter GitNexus", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "norn-framing-probe-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const probe = new FsRepositoryProbe();
  const empty = resolve(sandbox, "empty");
  mkdirSync(join(empty, ".gitnexus"), { recursive: true });
  writeFileSync(join(empty, "README.md"), "# Product\n");
  writeFileSync(join(empty, ".gitnexus", "cache.bin"), "x".repeat(1024));
  assert.equal((await probe.inspect({ projectId: "empty", projectRoot: empty })).nature, "empty");
  assert.equal((await probe.inspect({ projectId: "empty", projectRoot: empty })).inventory.files, 1);

  const skeleton = resolve(sandbox, "skeleton");
  mkdirSync(skeleton);
  writeFileSync(join(skeleton, "package.json"), "{}\n");
  assert.equal((await probe.inspect({ projectId: "skeleton", projectRoot: skeleton })).nature, "skeleton");

  const implemented = resolve(sandbox, "implemented");
  mkdirSync(join(implemented, "src"), { recursive: true });
  writeFileSync(join(implemented, "src", "index.ts"), "export const value = 1;\n");
  assert.equal((await probe.inspect({ projectId: "implemented", projectRoot: implemented })).nature, "implemented");

  symlinkSync(join(implemented, "src", "index.ts"), join(implemented, "unsafe-link"));
  const unsafe = await probe.inspect({ projectId: "implemented", projectRoot: implemented });
  assert.equal(unsafe.nature, "indeterminate");
  assert.equal(unsafe.inventory.symlinks, 1);
});

test("le store reconstruit le front sans current.json et fusionne deux deltas disjoints", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "norn-framing-store-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const runtime = createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT });
  const entry = await runtime.enter({ path: projectRoot, contentLocale: "fr" });
  const baseRevision = entry.plan.revision;
  const first = delta(entry.plan, "intent.problem", "problem", "La reprise dépend de la session.");
  const second = delta(entry.plan, "intent.desired_effects", "effect", "Le plan porte la reprise.");
  const [left, right] = await Promise.all([
    runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, first),
    runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, second),
  ]);
  assert.ok(Math.max(left.revision, right.revision) >= baseRevision + 1);
  const current = await runtime.show(entry.project.id.value, entry.plan.target.framingId);
  assert.equal(current.revision, baseRevision + 2);
  assert.equal(current.knowledge["intent.problem"].filter((item) => item.status === "active").length, 1);
  assert.equal(current.knowledge["intent.desired_effects"].filter((item) => item.status === "active").length, 1);

  const pointer = resolve(home, ".arka-norn", "framing", entry.project.id.value, entry.plan.target.framingId, "current.json");
  unlinkSync(pointer);
  const reconstructed = await new FsFramingStore(home).load(entry.project.id.value, entry.plan.target.framingId);
  assert.equal(reconstructed?.revision, current.revision);

  const concurrentBase = reconstructed!;
  const [firstConflict, secondConflict] = await Promise.all([
    runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, delta(concurrentBase, "intent.problem", "concurrent-choice", "Première interprétation.")),
    runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, delta(concurrentBase, "intent.problem", "concurrent-choice", "Interprétation contradictoire.")),
  ]);
  assert.ok(firstConflict.revision !== secondConflict.revision);
  const confronted = await runtime.show(entry.project.id.value, entry.plan.target.framingId);
  assert.equal(confronted.knowledge["intent.problem"].filter((item) => item.status === "active" && item.id.startsWith("concurrent-choice")).length, 2);
  assert.equal(confronted.knowledge.decisions.some((item) => item.status === "active" && item.provenance.kind === "open" && item.blocksProgress === true), true);
});

test("une nouvelle Feature n'existe qu'après le plan fondé publié et pointe sa révision exacte", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "norn-framing-publish-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const runtime = createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT });
  const entry = await runtime.enter({ path: projectRoot, newFeatureTitle: "Reprise du cadrage", contentLocale: "fr" });
  assert.equal(existsSync(resolve(projectRoot, "features")), false);
  let plan = await runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, {
    schemaVersion: 1, planId: entry.plan.id, baseRevision: entry.plan.revision, reason: "intention",
    operations: [
      item("intent.problem", "problem", "Une session perdue bloque la reprise.", "human_decision"),
      item("intent.desired_effects", "effect", "Un autre Agent reprend au front exact.", "human_decision"),
      item("intent.exact_objective", "objective", "Faire du plan la mémoire durable.", "human_decision"),
    ],
  });
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "intent", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  plan = await runtime.applyDelta(entry.project.id.value, plan.target.framingId, {
    schemaVersion: 1, planId: plan.id, baseRevision: plan.revision, reason: "conception et lots",
    operations: [
      item("solution.design", "design", "Un journal atomique conserve les révisions.", "technical_design"),
      { op: "propose_decomposition", value: { kind: "feature_lots", lots: [{
        id: "lot-store", title: "Journal", objective: "Persister", observableEffect: "Le front est reconstructible",
        readScopes: ["src"], writeScopes: ["src/framing"], dependsOn: [],
        acceptanceProofs: { functional: ["reprendre"], ux: ["voir la suite"], code: ["test crash"], security: ["expurger"] },
      }] } },
    ],
  });
  assert.equal(plan.derivedState.recommendedPipelineId, "arka-norn-essential-2.3");
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "grounded_plan", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  const stabilizedRevision = plan.revision;
  plan = await runtime.publish(entry.project.id.value, plan.target.framingId);
  assert.equal(plan.publication?.revision, stabilizedRevision);
  const featureMarkers = findFeatureMarkers(projectRoot);
  assert.equal(featureMarkers.length, 1);
  const marker = JSON.parse(readFileSync(featureMarkers[0]!, "utf8")) as Record<string, unknown>;
  assert.equal(marker["schemaVersion"], 5);
  assert.equal(marker["pipelineDefinitionVersion"], "2.3");
  assert.equal(marker["pipelineId"], "arka-norn-essential-2.3");
  assert.deepEqual((marker["framingPlanRef"] as Record<string, unknown>)["revision"], stabilizedRevision);
  const management = createManagementRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT, sessionId: AgentSessionId.of("development-framing") });
  const feature = await management.features.show(FeatureId.of(String(marker["id"])));
  await management.agents.register({ project: entry.project, provider: "Codex", role: "development", featureIds: [feature.id], paths: [], responsibilities: ["development", "integrator"] });
  const taskPlans = await loadTaskPlans(feature, entry.project, await management.agents.list(entry.project));
  assert.deepEqual(taskPlans.tasks.map((task) => task.id), ["lot-store"]);
  assert.deepEqual(taskPlans.tasks[0]?.writeScopes, ["src/framing"]);
  await assert.rejects(
    loadTaskPlans(feature.withPipelineId("arka-norn-complete-2.3", new Date()), entry.project, await management.agents.list(entry.project)),
    /Feature pipeline does not match the delivery route calculated/u,
  );
  const publicationRef = marker["framingPlanRef"] as Record<string, unknown>;
  const publishedPath = resolve(projectRoot, String(publicationRef["relativePath"]));
  const tampered = JSON.parse(readFileSync(publishedPath, "utf8")) as { knowledge: Record<string, Array<{ statement: string }>> };
  tampered.knowledge["intent.problem"]![0]!.statement = "Contenu altéré";
  writeFileSync(publishedPath, `${JSON.stringify(tampered, null, 2)}\n`);
  await assert.rejects(loadTaskPlans(feature, entry.project, await management.agents.list(entry.project)), /framing_plan_divergent/u);
});

test("une divergence du dépôt reconfronte les preuves et interdit une publication périmée", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "norn-framing-divergence-"));
  const home = resolve(sandbox, "home");
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const runtime = createFramingRuntime({ homeDir: home, frameworkRoot: FRAMEWORK_ROOT });
  const entry = await runtime.enter({ path: projectRoot, newFeatureTitle: "Plan vivant", contentLocale: "fr" });
  let plan = await runtime.applyDelta(entry.project.id.value, entry.plan.target.framingId, {
    schemaVersion: 1, planId: entry.plan.id, baseRevision: entry.plan.revision, reason: "intention",
    operations: [
      item("intent.problem", "problem", "Une révision périmée peut guider l'exécution.", "human_decision"),
      item("intent.desired_effects", "effect", "Toute divergence force une reconfrontation.", "human_decision"),
      item("intent.exact_objective", "objective", "Lier les preuves au snapshot exact.", "human_decision"),
    ],
  });
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "intent", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  plan = await runtime.applyDelta(entry.project.id.value, plan.target.framingId, {
    schemaVersion: 1, planId: plan.id, baseRevision: plan.revision, reason: "conception",
    operations: [
      item("solution.design", "design", "Le contrôleur re-sonde avant de stabiliser.", "technical_design"),
      { op: "propose_decomposition", value: { kind: "feature_lots", lots: [{
        id: "lot-probe", title: "Sonde", objective: "Détecter la divergence", observableEffect: "Une preuve périmée est invalidée",
        readScopes: ["src"], writeScopes: ["src/framing"], dependsOn: [],
        acceptanceProofs: { functional: ["refus périmé"], ux: ["suite explicite"], code: ["test divergence"], security: ["scope borné"] },
      }] } },
    ],
  });
  mkdirSync(resolve(projectRoot, "src"));
  writeFileSync(resolve(projectRoot, "src", "index.ts"), "export const value = 1;\n");
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "grounded_plan", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  assert.equal(plan.stabilizations.groundedPlan, null);
  assert.equal(plan.repositoryProbe.nature, "implemented");
  plan = await runtime.applyDelta(entry.project.id.value, plan.target.framingId, {
    schemaVersion: 1, planId: plan.id, baseRevision: plan.revision, reason: "preuve actualisée",
    operations: [{ op: "upsert_knowledge", section: "evidence.claims", value: {
      id: "source-index", statement: "Le dépôt expose une surface TypeScript.",
      provenance: { kind: "source_fact", reference: "src/index.ts:1", snapshotFingerprint: plan.repositoryProbe.snapshot.workspaceFingerprint, path: "src/index.ts", lineStart: 1, lineEnd: 1 },
    } }],
  });
  plan = await runtime.stabilize({ projectId: entry.project.id.value, framingId: plan.target.framingId, kind: "grounded_plan", actorId: "human-owner", fingerprint: framingPlanFingerprint(plan) });
  assert.notEqual(plan.stabilizations.groundedPlan, null);
  writeFileSync(resolve(projectRoot, "src", "changed.ts"), "export const changed = true;\n");
  await assert.rejects(runtime.publish(entry.project.id.value, plan.target.framingId), /Repository changed after/u);
});

function delta(plan: FramingPlan, section: "intent.problem" | "intent.desired_effects", id: string, statement: string): PlanDelta {
  return { schemaVersion: 1, planId: plan.id, baseRevision: plan.revision, reason: id, operations: [item(section, id, statement, "human_decision")] };
}

function item(section: keyof FramingPlan["knowledge"], id: string, statement: string, kind: "human_decision" | "technical_design") {
  return { op: "upsert_knowledge" as const, section, value: { id, statement, provenance: { kind, reference: "test" } } };
}

function findFeatureMarkers(root: string): string[] {
  const features = resolve(root, "features");
  if (!existsSync(features)) return [];
  return Array.from(new Set(readDirectories(features).map((directory) => resolve(features, directory, ".arka-norn", "feature.json")))).filter(existsSync);
}

function readDirectories(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}
