/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyFramingDelta, assertPlan, createFramingPlan, framingPlanFingerprint, stabilizeFramingPlan,
  type FramingPlan, type FramingSection, type PlanDelta, type RepositoryProbe,
} from "../../src/domain/framing/framing-plan.ts";
import { sha256 } from "../../src/domain/shared/sha256.ts";

const at = new Date("2026-08-26T10:00:00.000Z");

test("l'empreinte SHA-256 du domaine suit le vecteur de référence", () => {
  assert.equal(sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

test("un dépôt vide construit le plan sans audit et n'autorise que deux stabilisations", () => {
  let plan = featurePlan("empty");
  assert.equal(plan.derivedState.nextAction.kind, "continue_conversation");
  plan = applyFramingDelta(plan, delta(plan, productOperations()), at);
  assert.equal(plan.derivedState.nextAction.kind, "stabilize_intent");
  assert.equal(plan.derivedState.nextAction.attention, "human_stabilization");
  plan = stabilizeFramingPlan(plan, "intent", "human-owner", framingPlanFingerprint(plan), at);
  assert.equal(plan.derivedState.nextAction.kind, "design_greenfield");
  assert.equal(plan.derivedState.nextAction.workerRole, "technical_designer");

  plan = applyFramingDelta(plan, delta(plan, [
    knowledge("solution.design", "greenfield-design", "Le service conserve un plan révisionné hors dépôt.", "technical_design"),
    {
      op: "propose_decomposition",
      value: {
        kind: "feature_lots",
        lots: [{
          id: "lot-store", title: "Store", objective: "Conserver le plan", observableEffect: "Une reprise retrouve la dernière révision",
          readScopes: ["src"], writeScopes: ["src/framing"], dependsOn: [],
          acceptanceProofs: { functional: ["reprise"], ux: ["suite visible"], code: ["test store"], security: ["aucun secret"] },
        }],
      },
    },
  ]), at);
  assert.equal(plan.derivedState.nextAction.attention, "human_stabilization");
  assert.equal(plan.derivedState.recommendedPipelineId, "arka-norn-essential-2.3");
  plan = stabilizeFramingPlan(plan, "grounded_plan", "human-owner", framingPlanFingerprint(plan), at);
  assert.equal(plan.derivedState.nextAction.kind, "publish_plan");
  assert.throws(() => stabilizeFramingPlan(plan, "grounded_plan", "human-owner", framingPlanFingerprint(plan), at), /third confirmation is forbidden/);
});

test("une correction invalide seulement les conclusions qui en dépendent", () => {
  let plan = featurePlan("empty");
  plan = applyFramingDelta(plan, delta(plan, [
    knowledge("intent.problem", "fact-a", "La reprise est perdue.", "human_decision"),
    { ...knowledge("solution.design", "dependent", "Stocker le front.", "agent_deduction"), value: { ...knowledge("solution.design", "dependent", "Stocker le front.", "agent_deduction").value, dependsOn: ["fact-a"] } },
    knowledge("solution.design", "independent", "Expurger les transports.", "recommendation"),
  ]), at);
  plan = applyFramingDelta(plan, delta(plan, [{ op: "supersede_knowledge", section: "intent.problem", id: "fact-a", supersededBy: "fact-a-corrected" }]), at);
  assert.equal(active(plan, "dependent"), false);
  assert.equal(active(plan, "independent"), true);
});

test("les faits code sans snapshot et fichier:ligne sont rejetés et l'état calculé est non falsifiable", () => {
  const plan = featurePlan("implemented");
  assert.throws(() => applyFramingDelta(plan, delta(plan, [knowledge("evidence.claims", "claim", "Une route existe.", "source_fact")]), at), /requires snapshot, path and line/);
  assert.throws(() => assertPlan({ ...plan, derivedState: { ...plan.derivedState, planAuthority: "consumable" } }), /does not match/);
});

test("un delta forgé avec un champ hors contrat est rejeté avant toute mutation", () => {
  const plan = featurePlan("empty");
  const forged = {
    ...delta(plan, [knowledge("intent.problem", "problem", "Le cadrage doit rester reprenable.", "human_decision")]),
    derivedState: { planAuthority: "consumable" },
  } as unknown as PlanDelta;

  assert.throws(() => applyFramingDelta(plan, forged, at), /unknown properties/);
});

function featurePlan(nature: RepositoryProbe["nature"]): FramingPlan {
  return createFramingPlan({
    id: "plan-test",
    target: { kind: "feature", projectId: "project", framingId: "feature-new", origin: "new", featureId: null, workingTitle: "Plan vivant" },
    contentLocale: "fr",
    repositoryProbe: probe(nature),
    now: at,
  });
}

function probe(nature: RepositoryProbe["nature"]): RepositoryProbe {
  return {
    schemaVersion: 1, projectId: "project", projectRoot: "/workspace/project", scopePaths: ["."], nature,
    snapshot: { gitCommit: null, workspaceFingerprint: "a".repeat(64) },
    inventory: { files: 0, sourceFiles: 0, testFiles: 0, manifestFiles: 0, constraintFiles: 0, symlinks: 0, submodules: 0, truncated: false, ignoredRoots: [] },
    inventoryFingerprint: "b".repeat(64),
    reasons: [{ code: `repository_${nature}`, evidenceRef: "files:0" }], observedAt: at.toISOString(),
  };
}

function productOperations(): PlanDelta["operations"] {
  return [
    knowledge("intent.problem", "problem", "La session ne doit pas être la mémoire du cadrage.", "human_decision"),
    knowledge("intent.desired_effects", "effect", "La reprise retrouve le front exact.", "human_decision"),
    knowledge("intent.exact_objective", "objective", "Conduire un cadrage en deux stabilisations.", "human_decision"),
  ];
}

function knowledge(section: FramingSection, id: string, statement: string, kind: "human_decision" | "agent_deduction" | "source_fact" | "technical_design" | "recommendation") {
  return { op: "upsert_knowledge" as const, section, value: { id, statement, provenance: { kind, reference: "test" } } };
}

function active(plan: FramingPlan, id: string): boolean {
  return Object.values(plan.knowledge).flat().some((item) => item.id === id && item.status === "active");
}

function delta(plan: FramingPlan, operations: PlanDelta["operations"]): PlanDelta {
  return { schemaVersion: 1, planId: plan.id, baseRevision: plan.revision, operations, reason: "test" };
}
