/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { PlanDelta } from "./framing-plan.js";

const SECTIONS = new Set([
  "intent.definition", "intent.problem", "intent.desired_effects", "intent.non_negotiable_rules",
  "intent.exact_objective", "intent.capabilities", "intent.included", "intent.excluded",
  "intent.behaviors", "decisions", "evidence.claims", "solution.context", "solution.reuse",
  "solution.design", "solution.risks",
]);
const PROVENANCE = new Set(["human_decision", "agent_deduction", "source_fact", "inventory_fact", "technical_design", "recommendation", "open"]);

export function assertPlanDeltaContract(value: unknown): asserts value is PlanDelta {
  const delta = object(value, "Framing delta");
  exact(delta, ["schemaVersion", "planId", "baseRevision", "operations", "reason"], "Framing delta");
  if (delta.schemaVersion !== 1 || !id(delta.planId) || !integer(delta.baseRevision, 1) || !text(delta.reason, 1, 512)) throw new Error("Invalid framing delta envelope.");
  if (!Array.isArray(delta.operations) || delta.operations.length < 1 || delta.operations.length > 128) throw new Error("Framing delta requires 1..128 operations.");
  for (const operation of delta.operations) assertOperation(operation);
}

function assertOperation(value: unknown): void {
  const operation = object(value, "Framing operation");
  if (operation.op === "upsert_knowledge") {
    exact(operation, ["op", "section", "value"], "Knowledge operation");
    if (!SECTIONS.has(String(operation.section))) throw new Error("Invalid framing section.");
    assertKnowledgeInput(operation.value);
    return;
  }
  if (operation.op === "supersede_knowledge") {
    exact(operation, ["op", "section", "id", "supersededBy"], "Knowledge supersession");
    if (!SECTIONS.has(String(operation.section)) || !id(operation.id) || !id(operation.supersededBy)) throw new Error("Invalid knowledge supersession.");
    return;
  }
  if (operation.op === "record_probe") {
    exact(operation, ["op", "value"], "Probe operation");
    assertProbe(operation.value);
    return;
  }
  if (operation.op === "invalidate_evidence") {
    exact(operation, ["op", "id", "supersededBy"], "Evidence invalidation");
    if (!id(operation.id) || !id(operation.supersededBy)) throw new Error("Invalid evidence invalidation.");
    return;
  }
  if (operation.op === "propose_decomposition") {
    exact(operation, ["op", "value"], "Decomposition operation");
    assertDecomposition(operation.value);
    return;
  }
  throw new Error("Unknown framing delta operation.");
}

function assertKnowledgeInput(value: unknown): void {
  const input = object(value, "Knowledge input");
  exactOptional(input, ["id", "statement", "provenance"], ["blocksProgress", "dependsOn"], "Knowledge input");
  if (!id(input.id) || !text(input.statement, 1, 4_000)) throw new Error("Invalid framing knowledge input.");
  const provenance = object(input.provenance, "Knowledge provenance");
  exactOptional(provenance, ["kind", "reference"], ["snapshotFingerprint", "path", "lineStart", "lineEnd", "inventoryFingerprint"], "Knowledge provenance");
  if (!PROVENANCE.has(String(provenance.kind)) || !text(provenance.reference, 1, 512)) throw new Error("Invalid knowledge provenance.");
  if (input.blocksProgress !== undefined && typeof input.blocksProgress !== "boolean") throw new Error("Invalid knowledge blocking flag.");
  if (input.dependsOn !== undefined) assertIdArray(input.dependsOn, "Knowledge dependencies");
}

function assertProbe(value: unknown): void {
  const probe = object(value, "Repository probe");
  exact(probe, ["schemaVersion", "projectId", "projectRoot", "scopePaths", "nature", "snapshot", "inventory", "inventoryFingerprint", "reasons", "observedAt"], "Repository probe");
  if (probe.schemaVersion !== 1 || !id(probe.projectId) || !text(probe.projectRoot, 1, 4_096)
    || !["empty", "skeleton", "implemented", "indeterminate"].includes(String(probe.nature)) || !hash(probe.inventoryFingerprint)
    || !date(probe.observedAt)) throw new Error("Invalid repository probe.");
  assertStringArray(probe.scopePaths, "Probe scopes", true);
  const snapshot = object(probe.snapshot, "Probe snapshot");
  exact(snapshot, ["gitCommit", "workspaceFingerprint"], "Probe snapshot");
  if (!(snapshot.gitCommit === null || (typeof snapshot.gitCommit === "string" && /^[a-f0-9]{40,64}$/u.test(snapshot.gitCommit))) || !hash(snapshot.workspaceFingerprint)) throw new Error("Invalid repository snapshot.");
  const inventory = object(probe.inventory, "Probe inventory");
  exact(inventory, ["files", "sourceFiles", "testFiles", "manifestFiles", "constraintFiles", "symlinks", "submodules", "truncated", "ignoredRoots"], "Probe inventory");
  for (const field of ["files", "sourceFiles", "testFiles", "manifestFiles", "constraintFiles", "symlinks", "submodules"]) if (!integer(inventory[field], 0)) throw new Error("Invalid repository inventory count.");
  if (typeof inventory.truncated !== "boolean") throw new Error("Invalid repository inventory truncation flag.");
  assertStringArray(inventory.ignoredRoots, "Ignored roots", false);
  if (!Array.isArray(probe.reasons)) throw new Error("Invalid repository probe reasons.");
  for (const reasonValue of probe.reasons) {
    const reason = object(reasonValue, "Probe reason");
    exact(reason, ["code", "evidenceRef"], "Probe reason");
    if (typeof reason.code !== "string" || !/^[a-z0-9_]+$/u.test(reason.code) || !text(reason.evidenceRef, 1, 512)) throw new Error("Invalid repository probe reason.");
  }
}

function assertDecomposition(value: unknown): void {
  const decomposition = object(value, "Framing decomposition");
  if (decomposition.kind === "project_features") {
    exact(decomposition, ["kind", "features"], "Project decomposition");
    if (!Array.isArray(decomposition.features)) throw new Error("Project decomposition requires Features.");
    for (const valueEntry of decomposition.features) {
      const entry = object(valueEntry, "Feature candidate");
      exact(entry, ["candidateId", "title", "observableOutcome", "acceptanceScenario", "included", "excluded", "dependsOn", "cohesionRationale"], "Feature candidate");
      if (!id(entry.candidateId) || !text(entry.title) || !text(entry.observableOutcome) || !text(entry.acceptanceScenario) || !text(entry.cohesionRationale)) throw new Error("Invalid Feature candidate.");
      assertStringArray(entry.included, "Feature included boundary", false);
      assertStringArray(entry.excluded, "Feature excluded boundary", false);
      assertIdArray(entry.dependsOn, "Feature dependencies");
    }
    return;
  }
  if (decomposition.kind !== "feature_lots") throw new Error("Invalid framing decomposition kind.");
  exact(decomposition, ["kind", "lots"], "Feature decomposition");
  if (!Array.isArray(decomposition.lots)) throw new Error("Feature decomposition requires Lots.");
  for (const valueEntry of decomposition.lots) {
    const entry = object(valueEntry, "Feature Lot");
    exact(entry, ["id", "title", "objective", "observableEffect", "readScopes", "writeScopes", "dependsOn", "acceptanceProofs"], "Feature Lot");
    if (!id(entry.id) || !text(entry.title) || !text(entry.objective) || !text(entry.observableEffect)) throw new Error("Invalid Feature Lot.");
    assertStringArray(entry.readScopes, "Lot read scopes", false);
    assertStringArray(entry.writeScopes, "Lot write scopes", false);
    assertIdArray(entry.dependsOn, "Lot dependencies");
    const proofs = object(entry.acceptanceProofs, "Lot acceptance proofs");
    exact(proofs, ["functional", "ux", "code", "security"], "Lot acceptance proofs");
    for (const kind of ["functional", "ux", "code", "security"]) assertStringArray(proofs[kind], `Lot ${kind} proofs`, false);
  }
}

function object(value: unknown, label: string): Record<string, unknown> { if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object.`); return value as Record<string, unknown>; }
function exact(value: Record<string, unknown>, keys: readonly string[], label: string): void { exactOptional(value, keys, [], label); }
function exactOptional(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void { const keys = Object.keys(value); if (required.some((key) => !(key in value)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) throw new Error(`${label} has missing or unknown properties.`); }
function id(value: unknown): value is string { return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u.test(value); }
function text(value: unknown, minimum = 1, maximum = 4_000): value is string { return typeof value === "string" && value.trim().length >= minimum && value.length <= maximum; }
function integer(value: unknown, minimum: number): value is number { return typeof value === "number" && Number.isInteger(value) && value >= minimum; }
function hash(value: unknown): value is string { return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value); }
function date(value: unknown): value is string { return typeof value === "string" && !Number.isNaN(Date.parse(value)); }
function assertIdArray(value: unknown, label: string): void { if (!Array.isArray(value) || value.some((item) => !id(item)) || new Set(value).size !== value.length) throw new Error(`${label} must contain unique identifiers.`); }
function assertStringArray(value: unknown, label: string, nonEmpty: boolean): void { if (!Array.isArray(value) || (nonEmpty && value.length === 0) || value.some((item) => !text(item))) throw new Error(`${label} must contain strings.`); }
