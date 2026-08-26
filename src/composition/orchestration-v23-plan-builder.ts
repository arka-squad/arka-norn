/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

import type { AgentRegistration } from "../domain/agent/agent.js";
import type { Feature } from "../domain/feature/feature.js";
import { assertPlan, framingPlanFingerprint, type FeatureLot, type FramingPlan } from "../domain/framing/framing-plan.js";
import type { BaseSnapshot, CampaignPlanProps, TaskPlan } from "../domain/orchestration/orchestration-plan.js";
import { CampaignPlan } from "../domain/orchestration/orchestration-plan.js";
import type { Project } from "../domain/project/project.js";

interface BriefBatch { readonly id: string; readonly title: string; readonly dependsOn: readonly string[] }
interface BriefInput { readonly batches: readonly BriefBatch[]; readonly impactedScopes: readonly string[]; readonly validations: readonly string[] }

export interface AssignedTaskPlans {
  readonly tasks: readonly TaskPlan[];
  readonly integrationAgentId: string;
}

export async function loadTaskPlans(feature: Feature, project: Project, agents: readonly AgentRegistration[]): Promise<AssignedTaskPlans> {
  const proposed = serializeOverlaps(feature.schemaVersion === 5
    ? await loadPublishedLotTasks(feature, project)
    : assignScopes(await loadBrief(feature, project)));
  const tasks = proposed.map((task) => Object.freeze({ ...task, agentId: assignedAgent(agents, feature, task.role, task.writeScopes, task.id).id.value }));
  const integrationAgentId = assignedAgent(agents, feature, "integrator", ["."], "integration").id.value;
  return Object.freeze({ tasks: Object.freeze(tasks), integrationAgentId });
}

async function loadPublishedLotTasks(feature: Feature, project: Project): Promise<readonly Omit<TaskPlan, "agentId">[]> {
  const reference = feature.framingPlanRef;
  if (reference === null) throw new Error("framing_plan_unpublished: Feature v5 has no published framing plan reference.");
  const candidate = resolve(project.root, reference.relativePath);
  if (candidate !== project.root && !candidate.startsWith(`${project.root}${sep}`)) throw new Error("framing_plan_divergent: published plan path escapes the Project.");
  const stat = await lstat(candidate).catch(() => undefined);
  if (stat === undefined || !stat.isFile() || stat.isSymbolicLink()) throw new Error("framing_plan_unpublished: exact published framing plan is unavailable.");
  const canonicalProject = await realpath(project.root);
  const canonicalCandidate = await realpath(candidate);
  if (!canonicalCandidate.startsWith(`${canonicalProject}${sep}`)) throw new Error("framing_plan_divergent: published plan resolves outside the Project.");
  let plan: FramingPlan;
  try { plan = JSON.parse(await readFile(canonicalCandidate, "utf8")) as FramingPlan; }
  catch { throw new Error("framing_plan_divergent: published plan is not valid JSON."); }
  try { assertPlan(plan); }
  catch { throw new Error("framing_plan_divergent: published plan contract is invalid."); }
  if (plan.id !== reference.planId || plan.revision !== reference.revision || framingPlanFingerprint(plan) !== reference.fingerprint) {
    throw new Error("framing_plan_divergent: Feature marker does not reference the exact published plan revision.");
  }
  if (plan.target.projectId !== project.id.value || plan.stabilizations.groundedPlan === null || plan.target.kind !== "feature" || plan.decomposition?.kind !== "feature_lots") {
    throw new Error("framing_plan_unpublished: orchestration requires a grounded Feature plan decomposed into Lots.");
  }
  return plan.decomposition.lots.map(lotTask);
}

function lotTask(lot: FeatureLot, index: number, lots: readonly FeatureLot[]): Omit<TaskPlan, "agentId"> {
  const id = normalizeId(lot.id);
  const readScopes = lot.readScopes.length === 0 ? ["."] : lot.readScopes.map(requireSafeScope);
  const writeScopes = lot.writeScopes.map(requireSafeScope);
  if (writeScopes.length === 0) throw new Error(`scope_unresolvable: framing Lot ${id} has no write scope.`);
  const validations = Object.entries(lot.acceptanceProofs)
    .flatMap(([kind, proofs]) => proofs.map((proof) => `${kind}: ${proof}`));
  if (validations.length === 0) throw new Error(`framing_plan_divergent: framing Lot ${id} has no acceptance proof.`);
  return {
    id,
    role: "development",
    requiredProfile: executionRequirement(),
    priority: lots.length - index,
    dependencies: lot.dependsOn.map(normalizeId),
    readScopes,
    writeScopes,
    deliverables: [`${lot.title}: ${lot.objective}`, `Observable effect: ${lot.observableEffect}`],
    validations,
  };
}

export function createCampaignPlan(input: {
  readonly campaignId: string;
  readonly projectId: string;
  readonly featureId: string;
  readonly snapshot: BaseSnapshot;
  readonly tasks: readonly TaskPlan[];
  readonly integrationAgentId: string;
  readonly createdAt: Date;
  readonly maximumParallelism?: number;
}): CampaignPlan {
  const unsigned = {
    schemaVersion: 1 as const,
    id: input.campaignId,
    projectId: input.projectId,
    featureId: input.featureId,
    snapshot: input.snapshot,
    tasks: input.tasks,
    integrationRole: "integrator",
    integrationAgentId: input.integrationAgentId,
    integrationRequiredProfile: executionRequirement(),
    maximumParallelism: input.maximumParallelism ?? 3,
    createdAt: input.createdAt,
  };
  const fingerprint = planFingerprint(unsigned);
  return CampaignPlan.create({ ...unsigned, fingerprint });
}

export function planFingerprint(value: Omit<CampaignPlanProps, "fingerprint">): string {
  const canonical = { ...value, createdAt: value.createdAt.toISOString(), tasks: value.tasks.map((task) => ({ ...task, dependencies: [...task.dependencies].sort(), readScopes: [...task.readScopes].sort(), writeScopes: [...task.writeScopes].sort(), deliverables: [...task.deliverables], validations: [...task.validations] })), snapshot: { ...value.snapshot, declaredUntracked: [...value.snapshot.declaredUntracked].sort() } };
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

async function loadBrief(feature: Feature, project: Project): Promise<BriefInput> {
  const candidates = ["feature_brief.json", "01-feature-brief.json"];
  let raw: string | undefined;
  for (const name of candidates) {
    try { raw = await readFile(`${feature.root}/${name}`, "utf8"); break; } catch { continue; }
  }
  if (raw === undefined) throw new Error("Automatic orchestration requires a validated Feature Brief with batches.");
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("Feature Brief is not valid JSON."); }
  if (!isRecord(value) || !Array.isArray(value["batches"]) || value["batches"].length === 0) throw new Error("Feature Brief has no executable batches.");
  const batches = value["batches"].map(parseBatch);
  const impacted = Array.isArray(value["impacted_areas"]) ? value["impacted_areas"].filter((entry): entry is string => typeof entry === "string").map(scopeFromArea) : [];
  const featureRelative = relative(project.root, feature.root).replaceAll("\\", "/");
  const scopes = [...new Set(impacted)].filter(safeScope);
  if (scopes.length === 0) throw new Error(`scope_unresolvable: Feature Brief impacted_areas must begin with explicit Project-relative paths; Feature documents are under ${featureRelative}.`);
  const validations = Array.isArray(value["expected_tests"]) ? value["expected_tests"].filter((entry): entry is string => typeof entry === "string").slice(0, 100) : ["Run the declared test recipe."];
  return { batches, impactedScopes: scopes, validations };
}

function parseBatch(value: unknown): BriefBatch {
  if (!isRecord(value) || typeof value["id"] !== "string") throw new Error("Feature Brief batch is invalid.");
  const title = typeof value["title"] === "string" ? value["title"] : typeof value["name"] === "string" ? value["name"] : value["id"];
  const dependencies = value["depends_on"];
  if (!Array.isArray(dependencies) || dependencies.some((entry) => typeof entry !== "string")) throw new Error(`Feature Brief batch ${value["id"]} has invalid dependencies.`);
  return { id: normalizeId(value["id"]), title, dependsOn: dependencies.map((entry) => normalizeId(String(entry))) };
}

function assignScopes(input: BriefInput): Omit<TaskPlan, "agentId">[] {
  const tokenized = input.batches.map((batch) => ({ batch, tokens: tokens(batch.title) }));
  const assignments = new Map(input.batches.map((batch) => [batch.id, [] as string[]]));
  for (const scope of input.impactedScopes) {
    const scopeTokens = tokens(scope);
    const ranked = tokenized.map(({ batch, tokens: batchTokens }) => ({ id: batch.id, score: [...scopeTokens].filter((token) => batchTokens.has(token)).length })).sort((left, right) => right.score - left.score || left.id.localeCompare(right.id));
    const best = ranked[0]?.score ?? 0;
    const targets = best === 0 ? input.batches.map((batch) => batch.id) : ranked.filter((entry) => entry.score === best).map((entry) => entry.id);
    for (const id of targets) { const assignment = assignments.get(id); if (assignment === undefined) throw new Error(`Unknown batch scope assignment: ${id}`); assignment.push(scope); }
  }
  return input.batches.map((batch, index) => {
    const assigned = assignments.get(batch.id);
    if (assigned === undefined) throw new Error(`Missing batch scope assignment: ${batch.id}`);
    const writeScopes = [...new Set(assigned)].sort();
    return {
      id: batch.id,
      role: "development",
      requiredProfile: executionRequirement(),
      priority: input.batches.length - index,
      dependencies: [...batch.dependsOn],
      readScopes: ["."],
      writeScopes: writeScopes.length === 0 ? ["."] : writeScopes,
      deliverables: [batch.title.slice(0, 300)],
      validations: [...input.validations],
    };
  });
}

function serializeOverlaps(tasks: readonly Omit<TaskPlan, "agentId">[]): Omit<TaskPlan, "agentId">[] {
  const output = tasks.map((task) => ({ ...task, dependencies: [...task.dependencies], readScopes: [...task.readScopes], writeScopes: [...task.writeScopes], deliverables: [...task.deliverables], validations: [...task.validations] }));
  for (let right = 0; right < output.length; right += 1) for (let left = 0; left < right; left += 1) {
    const earlier = output[left]!;
    const later = output[right]!;
    if (!scopesOverlap(earlier.writeScopes, later.writeScopes) || transitivelyDepends(output, later.id, earlier.id) || transitivelyDepends(output, earlier.id, later.id)) continue;
    later.dependencies = [...later.dependencies, earlier.id];
  }
  return output;
}

function assignedAgent(agents: readonly AgentRegistration[], feature: Feature, role: string, scopes: readonly string[], taskId: string): AgentRegistration {
  const eligible = agents.filter((agent) => agent.active && agent.coversFeature(feature.id) && scopes.every((scope) => scope === "." ? agent.scope.paths.length === 0 : agent.coversProjectPath(scope)) && agentCoversRole(agent, role));
  if (eligible.length === 0) throw new Error(`agent_scope_unavailable: no active Agent covers task ${taskId}, role ${role} and its write scopes.`);
  if (eligible.length > 1) throw new Error(`agent_scope_ambiguous: ${eligible.length} active Agents cover task ${taskId}; bind one unambiguous Agent before preview.`);
  return eligible[0]!;
}

function agentCoversRole(agent: AgentRegistration, role: string): boolean {
  const expected = normalizeRole(role);
  const candidates = [agent.role, ...agent.scope.responsibilities].map(normalizeRole);
  return candidates.some((candidate) => candidate === expected || (expected === "development" && ["dev", "developer"].includes(candidate)));
}

function transitivelyDepends(tasks: readonly Omit<TaskPlan, "agentId">[], taskId: string, dependencyId: string, seen = new Set<string>()): boolean { if (seen.has(taskId)) return false; seen.add(taskId); const task = tasks.find((entry) => entry.id === taskId); return task?.dependencies.some((dependency) => dependency === dependencyId || transitivelyDepends(tasks, dependency, dependencyId, seen)) ?? false; }
function scopesOverlap(left: readonly string[], right: readonly string[]): boolean { return left.some((a) => right.some((b) => a === "." || b === "." || a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`))); }
function scopeFromArea(value: string): string { return value.split(/\s+\(/u)[0]!.trim().replaceAll("\\", "/").replace(/\/\*$/u, ""); }
function tokens(value: string): Set<string> { return new Set(value.toLocaleLowerCase("en").split(/[^a-z0-9]+/u).filter((entry) => entry.length >= 3)); }
function safeScope(value: string): boolean { return value === "." || (value.length > 0 && value.length <= 512 && !value.startsWith("/") && value.split("/").every((part) => part !== "" && part !== "." && part !== "..")); }
function requireSafeScope(value: string): string { const normalized = value.replaceAll("\\", "/"); if (!safeScope(normalized)) throw new Error(`scope_unresolvable: unsafe framing scope ${value}.`); return normalized; }
function normalizeId(value: string): string { const normalized = value.toLocaleLowerCase("en").replace(/[^a-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 100); if (!/^[a-z0-9]/u.test(normalized)) throw new Error("Feature Brief batch id is invalid."); return normalized; }
function normalizeRole(value: string): string { return value.toLocaleLowerCase("en").replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, ""); }
function executionRequirement(): TaskPlan["requiredProfile"] { return { transports: ["codex-cli", "claude-cli"], capabilities: ["inspect_workspace", "modify_workspace", "run_commands", "read_pipeline"] }; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
