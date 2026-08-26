/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { assertPlanDeltaContract } from "./framing-delta-validation.js";
import { sha256 } from "../shared/sha256.js";

export const REPOSITORY_NATURES = ["empty", "skeleton", "implemented", "indeterminate"] as const;
export type RepositoryNature = typeof REPOSITORY_NATURES[number];

export const KNOWLEDGE_PROVENANCE_KINDS = [
  "human_decision", "agent_deduction", "source_fact", "inventory_fact",
  "technical_design", "recommendation", "open",
] as const;
export type KnowledgeProvenanceKind = typeof KNOWLEDGE_PROVENANCE_KINDS[number];

export const FRAMING_ATTENTIONS = [
  "agent", "human_substance", "human_stabilization", "worker", "complete", "recoverable_failure",
] as const;
export type FramingAttention = typeof FRAMING_ATTENTIONS[number];

export const FRAMING_SECTIONS = [
  "intent.definition", "intent.problem", "intent.desired_effects", "intent.non_negotiable_rules",
  "intent.exact_objective", "intent.capabilities", "intent.included", "intent.excluded",
  "intent.behaviors", "decisions", "evidence.claims", "solution.context", "solution.reuse",
  "solution.design", "solution.risks",
] as const;
export type FramingSection = typeof FRAMING_SECTIONS[number];

export interface ProjectFramingTarget {
  readonly kind: "project";
  readonly projectId: string;
  readonly framingId: string;
}

export interface FeatureFramingTarget {
  readonly kind: "feature";
  readonly projectId: string;
  readonly framingId: string;
  readonly origin: "existing" | "new";
  readonly featureId: string | null;
  readonly workingTitle: string;
}

export type FramingTarget = ProjectFramingTarget | FeatureFramingTarget;

export interface RepositoryProbeSnapshot {
  readonly gitCommit: string | null;
  readonly workspaceFingerprint: string;
}

export interface RepositoryInventory {
  readonly files: number;
  readonly sourceFiles: number;
  readonly testFiles: number;
  readonly manifestFiles: number;
  readonly constraintFiles: number;
  readonly symlinks: number;
  readonly submodules: number;
  readonly truncated: boolean;
  readonly ignoredRoots: readonly string[];
}

export interface RepositoryProbeReason {
  readonly code: string;
  readonly evidenceRef: string;
}

export interface RepositoryProbe {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly projectRoot: string;
  readonly scopePaths: readonly string[];
  readonly nature: RepositoryNature;
  readonly snapshot: RepositoryProbeSnapshot;
  readonly inventory: RepositoryInventory;
  readonly inventoryFingerprint: string;
  readonly reasons: readonly RepositoryProbeReason[];
  readonly observedAt: string;
}

export interface KnowledgeProvenance {
  readonly kind: KnowledgeProvenanceKind;
  readonly reference: string;
  readonly snapshotFingerprint?: string;
  readonly path?: string;
  readonly lineStart?: number;
  readonly lineEnd?: number;
  readonly inventoryFingerprint?: string;
}

export interface KnowledgeItem {
  readonly id: string;
  readonly statement: string;
  readonly provenance: KnowledgeProvenance;
  readonly status: "active" | "superseded";
  readonly introducedInRevision: number;
  readonly supersededInRevision: number | null;
  readonly supersededBy: string | null;
  readonly blocksProgress?: boolean;
  readonly dependsOn?: readonly string[];
}

export interface ProjectFeatureCandidate {
  readonly candidateId: string;
  readonly title: string;
  readonly observableOutcome: string;
  readonly acceptanceScenario: string;
  readonly included: readonly string[];
  readonly excluded: readonly string[];
  readonly dependsOn: readonly string[];
  readonly cohesionRationale: string;
}

export interface FeatureLot {
  readonly id: string;
  readonly title: string;
  readonly objective: string;
  readonly observableEffect: string;
  readonly readScopes: readonly string[];
  readonly writeScopes: readonly string[];
  readonly dependsOn: readonly string[];
  readonly acceptanceProofs: Readonly<Record<"functional" | "ux" | "code" | "security", readonly string[]>>;
}

export type FramingDecomposition =
  | { readonly kind: "project_features"; readonly features: readonly ProjectFeatureCandidate[] }
  | { readonly kind: "feature_lots"; readonly lots: readonly FeatureLot[] };

export interface FramingStabilization {
  readonly kind: "intent" | "grounded_plan";
  readonly revision: number;
  readonly fingerprint: string;
  readonly actorId: string;
  readonly confirmedAt: string;
}

export interface FramingPublication {
  readonly revision: number;
  readonly fingerprint: string;
  readonly relativePath: string;
  readonly publishedAt: string;
}

export interface FramingAction {
  readonly kind: string;
  readonly attention: FramingAttention;
  readonly humanSummary: string;
  readonly workerRole?: "technical_reader" | "technical_designer";
}

export interface FramingDerivedState {
  readonly repositoryNature: RepositoryNature;
  readonly productClarity: "emerging" | "stabilized";
  readonly grounding: "not_applicable" | "pending" | "in_progress" | "complete" | "degraded";
  readonly planAuthority: "conversational" | "intent_stabilized" | "grounded" | "consumable" | "degraded";
  readonly recommendedPipelineId: "arka-norn-essential-2.3" | "arka-norn-complete-2.3" | null;
  readonly nextAction: FramingAction;
}

export type FramingKnowledge = Readonly<Record<FramingSection, readonly KnowledgeItem[]>>;

export interface FramingPlan {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly target: FramingTarget;
  readonly revision: number;
  readonly previousRevision: number | null;
  readonly contentLocale: "en" | "fr";
  readonly knowledge: FramingKnowledge;
  readonly repositoryProbe: RepositoryProbe;
  readonly decomposition: FramingDecomposition | null;
  readonly stabilizations: {
    readonly intent: FramingStabilization | null;
    readonly groundedPlan: FramingStabilization | null;
  };
  readonly publication: FramingPublication | null;
  readonly derivedState: FramingDerivedState;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PlanDeltaOperation =
  | { readonly op: "upsert_knowledge"; readonly section: FramingSection; readonly value: Omit<KnowledgeItem, "status" | "introducedInRevision" | "supersededInRevision" | "supersededBy"> }
  | { readonly op: "supersede_knowledge"; readonly section: FramingSection; readonly id: string; readonly supersededBy: string }
  | { readonly op: "record_probe"; readonly value: RepositoryProbe }
  | { readonly op: "invalidate_evidence"; readonly id: string; readonly supersededBy: string }
  | { readonly op: "propose_decomposition"; readonly value: FramingDecomposition };

export interface PlanDelta {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly baseRevision: number;
  readonly operations: readonly PlanDeltaOperation[];
  readonly reason: string;
}

export interface FramingResumePacket {
  readonly schemaVersion: 1;
  readonly planId: string;
  readonly target: FramingTarget;
  readonly revision: number;
  readonly summary: string;
  readonly nextAction: FramingAction;
  readonly fingerprint: string;
  readonly expiresOnRevisionChange: true;
}

export function createFramingPlan(input: {
  readonly id: string;
  readonly target: FramingTarget;
  readonly contentLocale: "en" | "fr";
  readonly repositoryProbe: RepositoryProbe;
  readonly now: Date;
}): FramingPlan {
  assertIdentifier(input.id, "plan id");
  assertTarget(input.target);
  const createdAt = input.now.toISOString();
  const base = {
    schemaVersion: 1 as const,
    id: input.id,
    target: input.target,
    revision: 1,
    previousRevision: null,
    contentLocale: input.contentLocale,
    knowledge: emptyKnowledge(),
    repositoryProbe: input.repositoryProbe,
    decomposition: null,
    stabilizations: { intent: null, groundedPlan: null },
    publication: null,
    createdAt,
    updatedAt: createdAt,
  };
  return withDerivedState(base);
}

export function applyFramingDelta(plan: FramingPlan, delta: PlanDelta, now: Date): FramingPlan {
  assertPlan(plan);
  assertPlanDeltaContract(delta);
  if (plan.publication !== null || plan.stabilizations.groundedPlan !== null) throw new Error("A published or stabilized plan cannot accept new deltas; open a new framing cycle.");
  if (delta.planId !== plan.id) throw new Error("Framing delta targets a different plan.");
  if (delta.baseRevision !== plan.revision) throw new Error(`Framing revision conflict: expected ${plan.revision}, received ${delta.baseRevision}.`);
  if (delta.operations.length === 0) throw new Error("Framing delta must contain at least one operation.");
  const revision = plan.revision + 1;
  let knowledge = cloneKnowledge(plan.knowledge);
  let probe = plan.repositoryProbe;
  let decomposition = plan.decomposition;
  for (const operation of delta.operations) {
    if (operation.op === "upsert_knowledge") knowledge = upsertKnowledge(knowledge, operation.section, operation.value, revision);
    else if (operation.op === "supersede_knowledge") knowledge = supersedeKnowledge(knowledge, operation.section, operation.id, operation.supersededBy, revision);
    else if (operation.op === "invalidate_evidence") knowledge = supersedeKnowledge(knowledge, "evidence.claims", operation.id, operation.supersededBy, revision);
    else if (operation.op === "record_probe") { assertProbe(operation.value, plan.target.projectId); probe = operation.value; }
    else { assertDecomposition(plan.target, operation.value); decomposition = operation.value; }
  }
  return withDerivedState({ ...plan, revision, previousRevision: plan.revision, knowledge, repositoryProbe: probe, decomposition, updatedAt: now.toISOString() });
}

export function stabilizeFramingPlan(plan: FramingPlan, kind: "intent" | "grounded_plan", actorId: string, expectedFingerprint: string, now: Date): FramingPlan {
  assertPlan(plan);
  assertIdentifier(actorId, "actor id");
  const actual = framingPlanFingerprint(plan);
  if (actual !== expectedFingerprint) throw new Error("Framing plan changed before stabilization.");
  if (kind === "intent") {
    if (plan.stabilizations.intent !== null) throw new Error("Intent stabilization already exists; a third confirmation is forbidden.");
    if (!hasProductSubstance(plan)) throw new Error("Intent cannot be stabilized before the problem, effect and objective are explicit.");
    return nextRevision(plan, { ...plan.stabilizations, intent: stabilization(kind, plan.revision, actual, actorId, now) }, now);
  }
  if (plan.stabilizations.intent === null) throw new Error("Grounded plan stabilization requires the intent stabilization.");
  if (plan.stabilizations.groundedPlan !== null) throw new Error("Grounded plan stabilization already exists; a third confirmation is forbidden.");
  if (!canStabilizeGroundedPlan(plan)) throw new Error("Grounded plan requires verified grounding, a decomposition and no blocking open item.");
  return nextRevision(plan, { ...plan.stabilizations, groundedPlan: stabilization(kind, plan.revision, actual, actorId, now) }, now);
}

export function markFramingPublished(plan: FramingPlan, publication: FramingPublication, now: Date): FramingPlan {
  if (plan.stabilizations.groundedPlan === null) throw new Error("Only a grounded stabilized plan can be published.");
  if (plan.publication !== null) {
    if (plan.publication.fingerprint === publication.fingerprint) return plan;
    throw new Error("Framing plan is already published with another fingerprint.");
  }
  return withDerivedState({ ...plan, revision: plan.revision + 1, previousRevision: plan.revision, publication, updatedAt: now.toISOString() });
}

export function framingPlanFingerprint(plan: FramingPlan): string {
  return sha256(stableJson({
    id: plan.id, target: plan.target, revision: plan.revision, knowledge: plan.knowledge,
    probe: plan.repositoryProbe, decomposition: plan.decomposition, stabilizations: plan.stabilizations,
  }));
}

export function createResumePacket(plan: FramingPlan): FramingResumePacket {
  return {
    schemaVersion: 1,
    planId: plan.id,
    target: plan.target,
    revision: plan.revision,
    summary: humanFramingSummary(plan),
    nextAction: plan.derivedState.nextAction,
    fingerprint: framingPlanFingerprint(plan),
    expiresOnRevisionChange: true,
  };
}

export function humanFramingSummary(plan: FramingPlan): string {
  const title = plan.target.kind === "project" ? `Project ${plan.target.projectId}` : plan.target.workingTitle;
  const effect = active(plan, "intent.desired_effects")[0]?.statement ?? "expected effect still being framed";
  const last = latestActive(plan)?.statement ?? "no product element established yet";
  return `${title} — objective: ${effect}. Latest established element: ${last}. Next: ${plan.derivedState.nextAction.humanSummary}`;
}

export function assertPlan(plan: FramingPlan): void {
  assertOnlyKeys(plan as unknown as Record<string, unknown>, ["schemaVersion", "id", "target", "revision", "previousRevision", "contentLocale", "knowledge", "repositoryProbe", "decomposition", "stabilizations", "publication", "derivedState", "createdAt", "updatedAt"], [], "Framing plan");
  if (plan.schemaVersion !== 1 || !Number.isInteger(plan.revision) || plan.revision < 1) throw new Error("Invalid framing plan envelope.");
  if ((plan.revision === 1 && plan.previousRevision !== null) || (plan.revision > 1 && plan.previousRevision !== plan.revision - 1)) throw new Error("Invalid framing revision lineage.");
  if (!Number.isFinite(Date.parse(plan.createdAt)) || !Number.isFinite(Date.parse(plan.updatedAt)) || Date.parse(plan.updatedAt) < Date.parse(plan.createdAt)) throw new Error("Invalid framing timestamps.");
  assertIdentifier(plan.id, "plan id");
  assertTarget(plan.target);
  assertProbe(plan.repositoryProbe, plan.target.projectId);
  assertOnlyKeys(plan.knowledge, FRAMING_SECTIONS, [], "Framing knowledge");
  const activeIds = new Set<string>();
  for (const section of FRAMING_SECTIONS) for (const item of plan.knowledge[section]) {
    assertKnowledge(item);
    if (item.introducedInRevision > plan.revision || (item.supersededInRevision ?? 0) > plan.revision) throw new Error(`Knowledge ${item.id} refers to a future revision.`);
    if (item.status === "active") {
      if (activeIds.has(item.id)) throw new Error(`Active knowledge id is ambiguous: ${item.id}.`);
      activeIds.add(item.id);
    }
  }
  for (const section of FRAMING_SECTIONS) for (const item of plan.knowledge[section].filter((candidate) => candidate.status === "active")) {
    for (const dependency of item.dependsOn ?? []) if (!activeIds.has(dependency)) throw new Error(`Knowledge ${item.id} depends on inactive knowledge ${dependency}.`);
  }
  for (const item of plan.knowledge["evidence.claims"].filter((candidate) => candidate.status === "active")) {
    if ((item.provenance.kind === "source_fact" || item.provenance.kind === "inventory_fact")
      && item.provenance.snapshotFingerprint !== plan.repositoryProbe.snapshot.workspaceFingerprint) {
      throw new Error(`Evidence ${item.id} does not belong to the current repository snapshot.`);
    }
    if (item.provenance.kind === "inventory_fact" && item.provenance.inventoryFingerprint !== plan.repositoryProbe.inventoryFingerprint) {
      throw new Error(`Inventory evidence ${item.id} does not belong to the current inventory.`);
    }
  }
  if (plan.decomposition !== null) assertDecomposition(plan.target, plan.decomposition);
  assertStabilizations(plan);
  assertPublication(plan);
  assertOnlyKeys(plan.derivedState as unknown as Record<string, unknown>, ["repositoryNature", "productClarity", "grounding", "planAuthority", "recommendedPipelineId", "nextAction"], [], "Framing derived state");
  assertOnlyKeys(plan.derivedState.nextAction as unknown as Record<string, unknown>, ["kind", "attention", "humanSummary"], ["workerRole"], "Framing action");
  const expected = deriveState(plan);
  if (stableJson(expected) !== stableJson(plan.derivedState)) throw new Error("Framing derived state does not match its source data.");
}

function nextRevision(plan: FramingPlan, stabilizations: FramingPlan["stabilizations"], now: Date): FramingPlan {
  return withDerivedState({ ...plan, revision: plan.revision + 1, previousRevision: plan.revision, stabilizations, updatedAt: now.toISOString() });
}

function withDerivedState(plan: Omit<FramingPlan, "derivedState"> | FramingPlan): FramingPlan {
  const source = plan as Omit<FramingPlan, "derivedState">;
  const complete = { ...source, derivedState: undefined } as unknown as FramingPlan;
  return { ...source, derivedState: deriveState(complete) };
}

function deriveState(plan: FramingPlan): FramingDerivedState {
  const nature = plan.repositoryProbe.nature;
  const intent = plan.stabilizations.intent;
  const grounded = isGrounded(plan);
  const blocked = active(plan, "decisions").some((item) => item.provenance.kind === "open" && item.blocksProgress === true);
  let grounding: FramingDerivedState["grounding"] = intent === null ? "pending" : grounded ? "complete" : nature === "indeterminate" ? "degraded" : "in_progress";
  if (nature === "empty" && intent === null) grounding = "not_applicable";
  const authority: FramingDerivedState["planAuthority"] = nature === "indeterminate" && intent !== null
    ? "degraded" : plan.stabilizations.groundedPlan !== null ? "consumable" : grounded ? "grounded" : intent !== null ? "intent_stabilized" : "conversational";
  return {
    repositoryNature: nature,
    productClarity: intent === null ? "emerging" : "stabilized",
    grounding,
    planAuthority: authority,
    recommendedPipelineId: recommendedPipeline(plan),
    nextAction: nextAction(plan, grounded, blocked),
  };
}

function nextAction(plan: FramingPlan, grounded: boolean, blocked: boolean): FramingAction {
  if (plan.publication !== null) return { kind: "framing_complete", attention: "complete", humanSummary: "The published plan is ready for delivery." };
  if (plan.stabilizations.groundedPlan !== null) return { kind: "publish_plan", attention: "agent", humanSummary: "Publish the stabilized revision." };
  if (plan.stabilizations.intent === null) return hasProductSubstance(plan)
    ? { kind: "stabilize_intent", attention: "human_stabilization", humanSummary: "Review the established intent and authorize technical grounding." }
    : { kind: "continue_conversation", attention: "agent", humanSummary: "Continue clarifying the problem, expected effect and objective." };
  if (blocked) return { kind: "resolve_substance", attention: "human_substance", humanSummary: "Resolve the product substance that cannot be inferred." };
  if (!grounded) {
    if (plan.repositoryProbe.nature === "indeterminate") return { kind: "recover_repository_probe", attention: "recoverable_failure", humanSummary: "Restore repository observability before making broad claims." };
    if (plan.repositoryProbe.nature === "empty") return { kind: "design_greenfield", attention: "worker", workerRole: "technical_designer", humanSummary: "Design the technical response without pretending to inspect an existing implementation." };
    return { kind: plan.repositoryProbe.nature === "skeleton" ? "read_constraints" : "read_code_blind", attention: "worker", workerRole: "technical_reader", humanSummary: "Confront the intent with the available technical material." };
  }
  if (plan.decomposition === null) return { kind: "prepare_decomposition", attention: "agent", humanSummary: "Split the plan into cohesive product units." };
  const pipeline = recommendedPipeline(plan);
  return { kind: "stabilize_grounded_plan", attention: "human_stabilization", humanSummary: pipeline === null ? "The grounded plan can be stabilized and published." : `The grounded plan and ${pipeline} delivery route can be stabilized and published.` };
}

function recommendedPipeline(plan: FramingPlan): FramingDerivedState["recommendedPipelineId"] {
  if (plan.target.kind !== "feature" || plan.decomposition?.kind !== "feature_lots") return null;
  const hasRisk = active(plan, "solution.risks").length > 0;
  return hasRisk || plan.decomposition.lots.length >= 4 ? "arka-norn-complete-2.3" : "arka-norn-essential-2.3";
}

function hasProductSubstance(plan: FramingPlan): boolean {
  return active(plan, "intent.problem").length > 0 && active(plan, "intent.desired_effects").length > 0 && active(plan, "intent.exact_objective").length > 0;
}

function isGrounded(plan: FramingPlan): boolean {
  if (plan.stabilizations.intent === null || plan.repositoryProbe.nature === "indeterminate") return false;
  const design = active(plan, "solution.design");
  if (plan.repositoryProbe.nature === "empty") return design.some((item) => item.provenance.kind === "technical_design");
  const facts = active(plan, "evidence.claims");
  return facts.some((item) => (item.provenance.kind === "source_fact" || item.provenance.kind === "inventory_fact")
    && item.provenance.snapshotFingerprint === plan.repositoryProbe.snapshot.workspaceFingerprint) && design.length > 0;
}

function canStabilizeGroundedPlan(plan: FramingPlan): boolean {
  return isGrounded(plan) && plan.decomposition !== null
    && !active(plan, "decisions").some((item) => item.provenance.kind === "open" && item.blocksProgress === true);
}

function active(plan: FramingPlan, section: FramingSection): readonly KnowledgeItem[] {
  return plan.knowledge[section].filter((item) => item.status === "active");
}

function latestActive(plan: FramingPlan): KnowledgeItem | undefined {
  return FRAMING_SECTIONS.flatMap((section) => active(plan, section)).sort((left, right) => right.introducedInRevision - left.introducedInRevision)[0];
}

function emptyKnowledge(): FramingKnowledge {
  return Object.fromEntries(FRAMING_SECTIONS.map((section) => [section, []])) as unknown as FramingKnowledge;
}

function cloneKnowledge(source: FramingKnowledge): Record<FramingSection, readonly KnowledgeItem[]> {
  return Object.fromEntries(FRAMING_SECTIONS.map((section) => [section, [...source[section]]])) as unknown as Record<FramingSection, readonly KnowledgeItem[]>;
}

function upsertKnowledge(knowledge: Record<FramingSection, readonly KnowledgeItem[]>, section: FramingSection, input: Omit<KnowledgeItem, "status" | "introducedInRevision" | "supersededInRevision" | "supersededBy">, revision: number): Record<FramingSection, readonly KnowledgeItem[]> {
  assertIdentifier(input.id, "knowledge id");
  if (input.statement.trim().length === 0) throw new Error("Knowledge statement cannot be empty.");
  const item: KnowledgeItem = { ...input, statement: input.statement.trim(), status: "active", introducedInRevision: revision, supersededInRevision: null, supersededBy: null };
  assertKnowledge(item);
  const current = knowledge[section];
  const existing = current.find((candidate) => candidate.id === item.id && candidate.status === "active");
  if (existing !== undefined && stableJson({ statement: existing.statement, provenance: existing.provenance, blocksProgress: existing.blocksProgress, dependsOn: existing.dependsOn }) === stableJson({ statement: item.statement, provenance: item.provenance, blocksProgress: item.blocksProgress, dependsOn: item.dependsOn })) return knowledge;
  const replaced = current.map((candidate) => candidate.id === item.id && candidate.status === "active" ? { ...candidate, status: "superseded" as const, supersededInRevision: revision, supersededBy: item.id } : candidate);
  return { ...knowledge, [section]: [...replaced, item] };
}

function supersedeKnowledge(knowledge: Record<FramingSection, readonly KnowledgeItem[]>, section: FramingSection, id: string, supersededBy: string, revision: number): Record<FramingSection, readonly KnowledgeItem[]> {
  assertIdentifier(supersededBy, "replacement id");
  let found = false;
  const values = knowledge[section].map((item) => {
    if (item.id !== id || item.status !== "active") return item;
    found = true;
    return { ...item, status: "superseded" as const, supersededInRevision: revision, supersededBy };
  });
  if (!found) throw new Error(`Active framing knowledge not found: ${section}/${id}.`);
  return cascadeInvalidation({ ...knowledge, [section]: values }, new Set([id]), supersededBy, revision);
}

function cascadeInvalidation(
  knowledge: Record<FramingSection, readonly KnowledgeItem[]>,
  invalidated: Set<string>,
  supersededBy: string,
  revision: number,
): Record<FramingSection, readonly KnowledgeItem[]> {
  let changed = true;
  let result = knowledge;
  while (changed) {
    changed = false;
    for (const candidateSection of FRAMING_SECTIONS) {
      const values = result[candidateSection].map((item) => {
        if (item.status !== "active" || !(item.dependsOn ?? []).some((dependency) => invalidated.has(dependency))) return item;
        invalidated.add(item.id);
        changed = true;
        return { ...item, status: "superseded" as const, supersededInRevision: revision, supersededBy };
      });
      if (changed) result = { ...result, [candidateSection]: values };
    }
  }
  return result;
}

function assertKnowledge(item: KnowledgeItem): void {
  assertOnlyKeys(item as unknown as Record<string, unknown>, ["id", "statement", "provenance", "status", "introducedInRevision", "supersededInRevision", "supersededBy"], ["blocksProgress", "dependsOn"], "Framing knowledge item");
  assertIdentifier(item.id, "knowledge id");
  if (item.statement.trim().length === 0 || item.statement.length > 4_000 || !KNOWLEDGE_PROVENANCE_KINDS.includes(item.provenance.kind)) throw new Error(`Invalid framing knowledge ${item.id}.`);
  if (item.provenance.reference.trim().length === 0 || item.provenance.reference.length > 512) throw new Error(`Invalid provenance reference for ${item.id}.`);
  if (item.status === "active" && (item.supersededInRevision !== null || item.supersededBy !== null)) throw new Error(`Active knowledge ${item.id} cannot be superseded.`);
  if (item.status === "superseded" && (item.supersededInRevision === null || item.supersededBy === null)) throw new Error(`Superseded knowledge ${item.id} requires its replacement.`);
  for (const dependency of item.dependsOn ?? []) assertIdentifier(dependency, "knowledge dependency");
  const provenance = item.provenance;
  assertOnlyKeys(provenance as unknown as Record<string, unknown>, ["kind", "reference"], ["snapshotFingerprint", "path", "lineStart", "lineEnd", "inventoryFingerprint"], "Knowledge provenance");
  if (provenance.kind === "source_fact" && (provenance.snapshotFingerprint === undefined || provenance.path === undefined || provenance.lineStart === undefined)) {
    throw new Error(`Source fact ${item.id} requires snapshot, path and line.`);
  }
  if (provenance.kind === "source_fact") {
    if (!/^[a-f0-9]{64}$/u.test(provenance.snapshotFingerprint!) || provenance.path!.startsWith("/") || provenance.path!.split(/[\\/]/u).includes("..")
      || (provenance.lineEnd !== undefined && provenance.lineEnd < provenance.lineStart!)) throw new Error(`Source fact ${item.id} has an invalid source anchor.`);
  }
  if (provenance.kind === "inventory_fact" && (provenance.snapshotFingerprint === undefined || provenance.inventoryFingerprint === undefined)) {
    throw new Error(`Inventory fact ${item.id} requires snapshot and inventory fingerprint.`);
  }
  if (provenance.kind === "inventory_fact" && (!/^[a-f0-9]{64}$/u.test(provenance.snapshotFingerprint!) || !/^[a-f0-9]{64}$/u.test(provenance.inventoryFingerprint!))) throw new Error(`Inventory fact ${item.id} has invalid fingerprints.`);
}

function assertTarget(target: FramingTarget): void {
  assertOnlyKeys(target as unknown as Record<string, unknown>, target.kind === "feature"
    ? ["kind", "projectId", "framingId", "origin", "featureId", "workingTitle"]
    : ["kind", "projectId", "framingId"], [], "Framing target");
  assertIdentifier(target.projectId, "project id");
  assertIdentifier(target.framingId, "framing id");
  if (target.kind === "feature") {
    if (target.workingTitle.trim().length === 0) throw new Error("Feature framing requires a working title.");
    if (target.origin === "existing" && target.featureId === null) throw new Error("Existing Feature framing requires feature id.");
    if (target.featureId !== null) assertIdentifier(target.featureId, "feature id");
  }
}

function assertProbe(probe: RepositoryProbe, projectId: string): void {
  assertOnlyKeys(probe as unknown as Record<string, unknown>, ["schemaVersion", "projectId", "projectRoot", "scopePaths", "nature", "snapshot", "inventory", "inventoryFingerprint", "reasons", "observedAt"], [], "Repository probe");
  assertOnlyKeys(probe.snapshot as unknown as Record<string, unknown>, ["gitCommit", "workspaceFingerprint"], [], "Repository snapshot");
  assertOnlyKeys(probe.inventory as unknown as Record<string, unknown>, ["files", "sourceFiles", "testFiles", "manifestFiles", "constraintFiles", "symlinks", "submodules", "truncated", "ignoredRoots"], [], "Repository inventory");
  for (const reason of probe.reasons) assertOnlyKeys(reason as unknown as Record<string, unknown>, ["code", "evidenceRef"], [], "Repository probe reason");
  if (probe.schemaVersion !== 1 || probe.projectId !== projectId || !REPOSITORY_NATURES.includes(probe.nature)) throw new Error("Invalid repository probe.");
  if (probe.inventory.files < 0 || probe.inventory.sourceFiles < 0) throw new Error("Repository probe counts cannot be negative.");
  if (!/^[a-f0-9]{64}$/u.test(probe.inventoryFingerprint) || !/^[a-f0-9]{64}$/u.test(probe.snapshot.workspaceFingerprint)) throw new Error("Repository probe fingerprints are invalid.");
}

function assertDecomposition(target: FramingTarget, decomposition: FramingDecomposition): void {
  assertOnlyKeys(decomposition, ["kind", decomposition.kind === "project_features" ? "features" : "lots"], [], "Framing decomposition");
  if (target.kind === "project" && decomposition.kind !== "project_features") throw new Error("A Project framing must decompose into Features.");
  if (target.kind === "feature" && decomposition.kind !== "feature_lots") throw new Error("A Feature framing must decompose into Lots.");
  const entries = decomposition.kind === "project_features" ? decomposition.features : decomposition.lots;
  if (entries.length === 0 || entries.length > 100) throw new Error("Framing decomposition must contain 1..100 entries.");
  const ids = entries.map((entry) => decomposition.kind === "project_features" ? (entry as ProjectFeatureCandidate).candidateId : (entry as FeatureLot).id);
  for (const id of ids) assertIdentifier(id, "decomposition id");
  if (new Set(ids).size !== ids.length) throw new Error("Framing decomposition identifiers must be unique.");
  const known = new Set(ids);
  for (const entry of entries) {
    const id = decomposition.kind === "project_features" ? (entry as ProjectFeatureCandidate).candidateId : (entry as FeatureLot).id;
    for (const dependency of entry.dependsOn) {
      assertIdentifier(dependency, "decomposition dependency");
      if (!known.has(dependency) || dependency === id) throw new Error(`Invalid dependency ${dependency} for ${id}.`);
    }
  }
  assertAcyclic(entries.map((entry) => ({
    id: decomposition.kind === "project_features" ? (entry as ProjectFeatureCandidate).candidateId : (entry as FeatureLot).id,
    dependencies: entry.dependsOn,
  })));
  if (decomposition.kind === "project_features") {
    for (const feature of decomposition.features) {
      assertOnlyKeys(feature as unknown as Record<string, unknown>, ["candidateId", "title", "observableOutcome", "acceptanceScenario", "included", "excluded", "dependsOn", "cohesionRationale"], [], "Feature candidate");
      assertText(feature.title, "Feature title");
      assertText(feature.observableOutcome, "Feature outcome");
      assertText(feature.acceptanceScenario, "Feature acceptance scenario");
      assertText(feature.cohesionRationale, "Feature cohesion rationale");
      for (const statement of [...feature.included, ...feature.excluded]) assertText(statement, "Feature boundary");
    }
    return;
  }
  for (const lot of decomposition.lots) {
    assertOnlyKeys(lot as unknown as Record<string, unknown>, ["id", "title", "objective", "observableEffect", "readScopes", "writeScopes", "dependsOn", "acceptanceProofs"], [], "Feature Lot");
    assertOnlyKeys(lot.acceptanceProofs, ["functional", "ux", "code", "security"], [], "Lot acceptance proofs");
    assertText(lot.title, "Lot title");
    assertText(lot.objective, "Lot objective");
    assertText(lot.observableEffect, "Lot observable effect");
    if (lot.writeScopes.length === 0) throw new Error(`Lot ${lot.id} requires at least one write scope.`);
    for (const scope of [...lot.readScopes, ...lot.writeScopes]) assertSafeScope(scope);
    const proofs = Object.values(lot.acceptanceProofs).flat();
    if (proofs.length === 0) throw new Error(`Lot ${lot.id} requires at least one acceptance proof.`);
    for (const proof of proofs) assertText(proof, "Lot acceptance proof");
  }
}

function assertAcyclic(entries: readonly { readonly id: string; readonly dependencies: readonly string[] }[]): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(entries.map((entry) => [entry.id, entry.dependencies]));
  const visit = (id: string): void => {
    if (visiting.has(id)) throw new Error(`Framing decomposition contains a dependency cycle at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id) ?? []) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const entry of entries) visit(entry.id);
}

function assertSafeScope(value: string): void {
  if (value !== "." && (value.length === 0 || value.length > 512 || value.startsWith("/") || value.includes("\\")
    || value.split("/").some((part) => part === "" || part === "." || part === ".."))) throw new Error(`Unsafe framing scope: ${value}.`);
}

function assertText(value: string, field: string): void {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 4_000) throw new Error(`${field} must contain 1..4000 characters.`);
}

function assertStabilizations(plan: FramingPlan): void {
  assertOnlyKeys(plan.stabilizations, ["intent", "groundedPlan"], [], "Framing stabilizations");
  for (const [expected, stabilization] of [["intent", plan.stabilizations.intent], ["grounded_plan", plan.stabilizations.groundedPlan]] as const) {
    if (stabilization === null) continue;
    assertOnlyKeys(stabilization as unknown as Record<string, unknown>, ["kind", "revision", "fingerprint", "actorId", "confirmedAt"], [], "Framing stabilization");
    if (stabilization.kind !== expected || stabilization.revision > plan.revision || !/^[a-f0-9]{64}$/u.test(stabilization.fingerprint) || !Number.isFinite(Date.parse(stabilization.confirmedAt))) throw new Error(`Invalid ${expected} stabilization.`);
  }
  if (plan.stabilizations.groundedPlan !== null && plan.stabilizations.intent === null) throw new Error("Grounded stabilization requires intent stabilization.");
}

function assertPublication(plan: FramingPlan): void {
  if (plan.publication === null) return;
  assertOnlyKeys(plan.publication as unknown as Record<string, unknown>, ["revision", "fingerprint", "relativePath", "publishedAt"], [], "Framing publication");
  if (plan.stabilizations.groundedPlan === null || plan.publication.revision >= plan.revision || !/^[a-f0-9]{64}$/u.test(plan.publication.fingerprint)
    || !plan.publication.relativePath.startsWith(".arka-norn/plans/") || !Number.isFinite(Date.parse(plan.publication.publishedAt))) throw new Error("Invalid framing publication.");
}

function assertOnlyKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[], label: string): void {
  const keys = Object.keys(value);
  if (required.some((key) => !(key in value)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) throw new Error(`${label} has missing or unknown properties.`);
}

function stabilization(kind: "intent" | "grounded_plan", revision: number, fingerprint: string, actorId: string, now: Date): FramingStabilization {
  return { kind, revision, fingerprint, actorId, confirmedAt: now.toISOString() };
}

function assertIdentifier(value: string, field: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value)) throw new Error(`Invalid ${field}.`);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Readonly<Record<string, unknown>>).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
