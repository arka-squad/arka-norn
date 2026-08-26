/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash, randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, dirname, join, resolve, sep } from "node:path";
import { promisify } from "node:util";

import {
  applyFramingDelta, createFramingPlan, createResumePacket, framingPlanFingerprint,
  markFramingPublished, stabilizeFramingPlan,
  type FramingPlan, type FramingSection, type FramingTarget, type PlanDelta,
} from "../../domain/framing/framing-plan.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
import type { ProjectDraft } from "../../domain/project/project-draft.js";
import { Project } from "../../domain/project/project.js";
import { ProjectId } from "../../domain/project/project-id.js";
import type { ForFraming, FramingEntry, FramingView } from "../../ports/inbound/for-framing.js";
import type { ForFeatures } from "../../ports/inbound/for-features.js";
import type { ForProjects } from "../../ports/inbound/for-projects.js";
import type { FramingStore } from "../../ports/outbound/framing-store.js";
import type { ProjectDraftStore } from "../../ports/outbound/project-draft-store.js";
import type { ProjectPublicationStore } from "../../ports/outbound/project-publication-store.js";
import type { RepositoryProbePort } from "../../ports/outbound/repository-probe.js";
import { translate, type MessageKey } from "../localization/locale.js";

const execFileAsync = promisify(execFile);

export interface FramingServiceDependencies {
  readonly projects: ForProjects;
  readonly features: ForFeatures;
  readonly projectDrafts: ProjectDraftStore;
  readonly projectPublications: ProjectPublicationStore;
  readonly store: FramingStore;
  readonly repositoryProbe: RepositoryProbePort;
  readonly now?: () => Date;
}

export class FramingService implements ForFraming {
  private readonly now: () => Date;

  public constructor(private readonly dependencies: FramingServiceDependencies) {
    this.now = dependencies.now ?? (() => new Date());
  }

  public async enter(input: {
    readonly path: string;
    readonly existingFeatureId?: string;
    readonly newFeatureTitle?: string;
    readonly contentLocale: "en" | "fr";
  }): Promise<FramingEntry> {
    if (input.existingFeatureId !== undefined && input.newFeatureTitle !== undefined) throw new Error("Choose an existing Feature or a new Feature, not both.");
    const context = await this.locateProjectContext(input.path, true);
    const { project } = context;
    let target = await this.resolveTarget(project, input.existingFeatureId, input.newFeatureTitle);
    const existing = await this.findMatchingPlan(project.id.value, target);
    if (existing !== undefined) return { project, projectDraft: context.draft, plan: existing, resumed: true };
    if (await this.dependencies.store.load(project.id.value, target.framingId) !== undefined) {
      target = { ...target, framingId: `${target.framingId}-${randomUUID().slice(0, 8)}` };
    }
    const probe = await this.dependencies.repositoryProbe.inspect({ projectId: project.id.value, projectRoot: project.root });
    const plan = createFramingPlan({
      id: `plan-${randomUUID()}`,
      target,
      contentLocale: input.contentLocale,
      repositoryProbe: probe,
      now: this.now(),
    });
    return { project, projectDraft: context.draft, plan: await this.dependencies.store.create(plan), resumed: false };
  }

  public async locateProject(path: string, initialize: boolean): Promise<Project> {
    return (await this.locateProjectContext(path, initialize)).project;
  }

  public async listProjectDrafts(): Promise<readonly ProjectDraft[]> {
    return (await this.dependencies.projectDrafts.list()).filter((draft) => draft.materialization !== "materialized");
  }

  public async showProjectDraft(projectId: string): Promise<ProjectDraft | undefined> {
    const draft = await this.dependencies.projectDrafts.load(projectId);
    return draft?.materialization === "materialized" ? undefined : draft;
  }

  private async locateProjectContext(path: string, initialize: boolean): Promise<FramingProjectContext> {
    const canonical = await canonicalDirectory(path);
    const indexed = await this.dependencies.projects.list();
    const containing = await selectContainingProject(indexed, canonical);
    if (containing !== undefined) return { project: containing, draft: null };
    const markerRoot = await findMarkerRoot(canonical);
    if (markerRoot !== undefined) return { project: await this.dependencies.projects.importFrom({ root: markerRoot }), draft: null };
    const containingDraft = selectContainingDraft(await this.dependencies.projectDrafts.list(), canonical);
    if (containingDraft !== undefined) {
      const verified = await this.dependencies.projectDrafts.verify(containingDraft.id);
      return { project: projectFromDraft(verified), draft: verified };
    }
    if (!initialize) throw new Error(`No Norn Project contains ${canonical}.`);
    const root = await gitRoot(canonical) ?? canonical;
    const name = basename(root) || "project";
    const id = ProjectId.of(derivedIdentifier(name, root));
    const resolution = await this.dependencies.projectDrafts.resolve({ id: id.value, name, root, now: this.now() });
    return { project: projectFromDraft(resolution.draft), draft: resolution.draft };
  }

  public list(projectId: string) {
    return this.dependencies.store.list(projectId);
  }

  public async show(projectId: string, framingId?: string): Promise<FramingPlan> {
    if (framingId !== undefined) {
      const plan = await this.dependencies.store.load(projectId, framingId);
      if (plan === undefined) throw new Error(`Framing plan not found: ${framingId}.`);
      return plan;
    }
    const references = await this.dependencies.store.list(projectId);
    if (references.length === 0) throw new Error(`No framing plan exists for Project ${projectId}.`);
    const active = references.find((item) => !item.published) ?? references[0]!;
    const plan = await this.dependencies.store.load(projectId, active.framingId);
    if (plan === undefined) throw new Error("The selected framing journal cannot be reconstructed.");
    return plan;
  }

  public showRevision(projectId: string, framingId: string, revision: number): Promise<FramingPlan | undefined> {
    return this.dependencies.store.loadRevision(projectId, framingId, revision);
  }

  public project(plan: FramingPlan, view: FramingView): unknown {
    if (view === "summary") return summaryProjection(plan);
    if (view === "evidence") return evidenceProjection(plan);
    if (view === "map") return mapProjection(plan);
    return planProjection(plan);
  }

  public async resume(projectId: string, framingId?: string) {
    const plan = await this.show(projectId, framingId);
    const packet = createResumePacket(plan);
    return { ...packet, summary: localizedSummary(plan), nextAction: { ...packet.nextAction, humanSummary: localizedAction(plan) } };
  }

  public async applyDelta(projectId: string, framingId: string, delta: PlanDelta): Promise<FramingPlan> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const current = await this.show(projectId, framingId);
      let applicable = delta;
      if (delta.baseRevision !== current.revision) {
        const base = await this.dependencies.store.loadRevision(projectId, framingId, delta.baseRevision);
        if (base === undefined) throw new Error(`Framing base revision ${delta.baseRevision} is unavailable.`);
        const overlap = intersect(changedKeys(base, current), deltaKeys(delta));
        applicable = overlap.length === 0
          ? { ...delta, baseRevision: current.revision }
          : preserveConcurrentContradictions(delta, current.revision, overlap);
      }
      const next = applyFramingDelta(current, applicable, this.now());
      try {
        return await this.dependencies.store.save({
          projectId,
          framingId,
          expectedRevision: current.revision,
          plan: next,
          eventKind: "delta_applied",
          metadata: { reason: delta.reason.slice(0, 240), operations: delta.operations.length },
        });
      } catch (error) {
        if (!(error instanceof Error) || !error.message.startsWith("Framing revision conflict:")) throw error;
      }
    }
    throw new Error("Framing journal remained busy after five merge attempts.");
  }

  public async stabilize(input: {
    readonly projectId: string;
    readonly framingId: string;
    readonly kind: "intent" | "grounded_plan";
    readonly actorId: string;
    readonly fingerprint: string;
  }): Promise<FramingPlan> {
    const current = await this.show(input.projectId, input.framingId);
    if (framingPlanFingerprint(current) !== input.fingerprint) throw new Error("Framing plan changed before stabilization.");
    if (input.kind === "grounded_plan") {
      const project = (await this.projectContextById(input.projectId)).project;
      const observed = await this.dependencies.repositoryProbe.inspect({ projectId: project.id.value, projectRoot: project.root });
      if (observed.snapshot.workspaceFingerprint !== current.repositoryProbe.snapshot.workspaceFingerprint) {
        const operations: PlanDelta["operations"] = [
          { op: "record_probe", value: observed },
          ...activeSnapshotEvidence(current).map((item) => ({
            op: "invalidate_evidence" as const,
            id: item.id,
            supersededBy: `repository-snapshot-${observed.snapshot.workspaceFingerprint.slice(0, 12)}`,
          })),
        ];
        return this.applyDelta(input.projectId, input.framingId, {
          schemaVersion: 1,
          planId: current.id,
          baseRevision: current.revision,
          operations,
          reason: "Repository changed before grounded-plan stabilization; refresh the technical confrontation.",
        });
      }
    }
    const next = stabilizeFramingPlan(current, input.kind, input.actorId, input.fingerprint, this.now());
    return this.dependencies.store.save({
      projectId: input.projectId,
      framingId: input.framingId,
      expectedRevision: current.revision,
      plan: next,
      eventKind: input.kind === "intent" ? "intent_stabilized" : "plan_stabilized",
    });
  }

  public async publish(projectId: string, framingId: string): Promise<FramingPlan> {
    const current = await this.show(projectId, framingId);
    if (current.publication !== null) return current;
    const context = await this.projectContextById(projectId);
    let project = context.project;
    const observed = await this.dependencies.repositoryProbe.inspect({ projectId: project.id.value, projectRoot: project.root });
    if (observed.snapshot.workspaceFingerprint !== current.repositoryProbe.snapshot.workspaceFingerprint) {
      throw new Error("Repository changed after the grounded plan stabilization; publication is refused until a new confrontation is stabilized.");
    }
    const published = context.draft === null
      ? await this.dependencies.store.publish({ projectRoot: project.root, plan: current })
      : await this.dependencies.projectPublications.publish({ draft: context.draft, plan: current, now: this.now() });
    if (context.draft !== null) project = await this.dependencies.projects.importFrom({ root: context.draft.root });
    await this.materializeDirectFeature(project, current, published);
    const next = markFramingPublished(current, {
      revision: current.revision,
      fingerprint: published.fingerprint,
      relativePath: published.relativePath,
      publishedAt: this.now().toISOString(),
    }, this.now());
    return this.dependencies.store.save({
      projectId,
      framingId,
      expectedRevision: current.revision,
      plan: next,
      eventKind: "published",
      metadata: { relativePath: published.relativePath },
    });
  }

  private async materializeDirectFeature(
    project: Project,
    plan: FramingPlan,
    published: { readonly relativePath: string; readonly fingerprint: string },
  ): Promise<void> {
    if (plan.target.kind !== "feature" || plan.target.origin !== "new") return;
    const pipelineId = plan.derivedState.recommendedPipelineId;
    if (pipelineId === null) throw new Error("A new Feature cannot be materialized without a calculated 2.3 delivery route.");
    const featureId = FeatureId.of(derivedIdentifier(plan.target.workingTitle, plan.id));
    const feature = await this.dependencies.features.create({
      id: featureId,
      projectId: project.id,
      name: plan.target.workingTitle,
      root: join(project.root, "features", featureId.value),
      pipelineId,
      pipelineDefinitionVersion: "2.3",
      framingPlanRef: {
        planId: plan.id,
        revision: plan.revision,
        fingerprint: published.fingerprint,
        relativePath: published.relativePath,
      },
    });
    if (feature.schemaVersion !== 5 || feature.framingPlanRef?.fingerprint !== published.fingerprint) {
      throw new Error(`Feature ${featureId.value} already exists without the exact published framing plan.`);
    }
  }

  private async resolveTarget(project: Project, existingFeatureId?: string, newFeatureTitle?: string): Promise<FramingTarget> {
    if (existingFeatureId !== undefined) {
      const feature = await this.dependencies.features.show(FeatureId.of(existingFeatureId));
      if (!feature.projectId.equals(project.id)) throw new Error(`Feature ${existingFeatureId} does not belong to Project ${project.id.value}.`);
      return {
        kind: "feature", projectId: project.id.value, framingId: `feature-${feature.id.value}`,
        origin: "existing", featureId: feature.id.value, workingTitle: feature.name,
      };
    }
    if (newFeatureTitle !== undefined) {
      const title = newFeatureTitle.trim();
      if (title.length === 0) throw new Error("A new Feature requires a working title.");
      return {
        kind: "feature", projectId: project.id.value,
        framingId: `feature-new-${derivedIdentifier(title, `${project.root}:${title}`).slice(0, 48)}`,
        origin: "new", featureId: null, workingTitle: title,
      };
    }
    return { kind: "project", projectId: project.id.value, framingId: "project" };
  }

  private async findMatchingPlan(projectId: string, target: FramingTarget): Promise<FramingPlan | undefined> {
    const plan = await this.dependencies.store.load(projectId, target.framingId);
    if (plan === undefined || plan.publication !== null) return undefined;
    return plan;
  }

  private async projectContextById(projectId: string): Promise<FramingProjectContext> {
    const materialized = (await this.dependencies.projects.list()).find((project) => project.id.value === projectId);
    if (materialized !== undefined) return { project: materialized, draft: null };
    const draft = await this.dependencies.projectDrafts.verify(projectId);
    return { project: projectFromDraft(draft), draft };
  }
}

interface FramingProjectContext {
  readonly project: Project;
  readonly draft: ProjectDraft | null;
}

function activeSnapshotEvidence(plan: FramingPlan): readonly { readonly id: string }[] {
  return plan.knowledge["evidence.claims"].filter((item) => item.status === "active"
    && (item.provenance.kind === "source_fact" || item.provenance.kind === "inventory_fact"));
}

async function canonicalDirectory(value: string): Promise<string> {
  const root = resolve(value);
  const stat = await fs.lstat(root);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`Framing entry path must be a real directory: ${value}.`);
  return fs.realpath(root);
}

async function selectContainingProject(projects: readonly Project[], path: string): Promise<Project | undefined> {
  const candidates: { project: Project; root: string }[] = [];
  for (const project of projects) {
    const root = await fs.realpath(project.root).catch(() => project.root);
    if (path === root || path.startsWith(`${root}${sep}`)) candidates.push({ project, root });
  }
  return candidates.sort((left, right) => right.root.length - left.root.length)[0]?.project;
}

function selectContainingDraft(drafts: readonly ProjectDraft[], path: string): ProjectDraft | undefined {
  return drafts.filter((draft) => draft.materialization !== "materialized"
    && (path === draft.root || path.startsWith(`${draft.root}${sep}`)))
    .sort((left, right) => right.root.length - left.root.length)[0];
}

function projectFromDraft(draft: ProjectDraft): Project {
  return Project.create({
    id: ProjectId.of(draft.id),
    name: draft.name,
    root: draft.root,
    schemaVersion: 4,
    orchestrationMode: "manual",
    createdAt: new Date(draft.createdAt),
    updatedAt: new Date(draft.updatedAt),
  });
}

async function findMarkerRoot(start: string): Promise<string | undefined> {
  let current = start;
  while (true) {
    try {
      const stat = await fs.lstat(join(current, ".arka-norn", "project.json"));
      if (stat.isFile() && !stat.isSymbolicLink()) return current;
    } catch (error) {
      if (!isNodeError(error, "ENOENT")) throw error;
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

async function gitRoot(path: string): Promise<string | undefined> {
  try {
    const result = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "rev-parse", "--show-toplevel"], {
      cwd: path,
      env: { PATH: "/usr/bin:/bin:/usr/local/bin", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
      encoding: "utf8",
      timeout: 5_000,
    });
    return await fs.realpath(result.stdout.trim());
  } catch {
    return undefined;
  }
}

function derivedIdentifier(name: string, salt: string): string {
  const slug = name.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 47) || "project";
  return `${slug}-${createHash("sha256").update(salt).digest("hex").slice(0, 8)}`;
}

function summaryProjection(plan: FramingPlan): Readonly<Record<string, unknown>> {
  return {
    planId: plan.id, target: plan.target, revision: plan.revision,
    repository: { nature: plan.repositoryProbe.nature, inventory: plan.repositoryProbe.inventory },
    authority: plan.derivedState.planAuthority, recommendedPipelineId: plan.derivedState.recommendedPipelineId,
    nextAction: plan.derivedState.nextAction,
    summary: localizedSummary(plan), fingerprint: framingPlanFingerprint(plan),
  };
}

function planProjection(plan: FramingPlan): unknown {
  return {
    ...summaryProjection(plan),
    sections: Object.fromEntries(Object.entries(plan.knowledge).map(([section, items]) => [section, items
      .filter((item) => item.status === "active").map((item) => ({ id: item.id, statement: item.statement, provenance: item.provenance.kind }))])),
    decomposition: plan.decomposition,
    stabilizations: plan.stabilizations,
    publication: plan.publication,
  };
}

function evidenceProjection(plan: FramingPlan): unknown {
  return {
    planId: plan.id, revision: plan.revision, snapshot: plan.repositoryProbe.snapshot,
    inventory: plan.repositoryProbe.inventory, reasons: plan.repositoryProbe.reasons,
    claims: plan.knowledge["evidence.claims"].filter((item) => item.status === "active"),
  };
}

function mapProjection(plan: FramingPlan): unknown {
  return { planId: plan.id, revision: plan.revision, target: plan.target, decomposition: plan.decomposition, nextAction: plan.derivedState.nextAction };
}

function localizedAction(plan: FramingPlan): string {
  return translate(`framing.action.${plan.derivedState.nextAction.kind}` as MessageKey, {}, plan.contentLocale);
}

function localizedSummary(plan: FramingPlan): string {
  const activeItems = Object.values(plan.knowledge).flat().filter((item) => item.status === "active");
  return translate("framing.summary.full", {
    title: plan.target.kind === "project" ? `Project ${plan.target.projectId}` : plan.target.workingTitle,
    effect: plan.knowledge["intent.desired_effects"].find((item) => item.status === "active")?.statement ?? translate("framing.summary.effectMissing", {}, plan.contentLocale),
    last: activeItems.sort((left, right) => right.introducedInRevision - left.introducedInRevision)[0]?.statement ?? translate("framing.summary.lastMissing", {}, plan.contentLocale),
    next: localizedAction(plan),
  }, plan.contentLocale);
}

function changedKeys(base: FramingPlan, current: FramingPlan): readonly string[] {
  const keys: string[] = [];
  const sections = Object.keys(base.knowledge) as FramingSection[];
  for (const section of sections) {
    const ids = new Set([...base.knowledge[section], ...current.knowledge[section]].map((item) => item.id));
    for (const id of ids) {
      const before = base.knowledge[section].filter((item) => item.id === id);
      const after = current.knowledge[section].filter((item) => item.id === id);
      if (JSON.stringify(before) !== JSON.stringify(after)) keys.push(`knowledge:${section}:${id}`);
    }
  }
  if (JSON.stringify(base.repositoryProbe) !== JSON.stringify(current.repositoryProbe)) keys.push("repositoryProbe");
  if (JSON.stringify(base.decomposition) !== JSON.stringify(current.decomposition)) keys.push("decomposition");
  return keys;
}

function deltaKeys(delta: PlanDelta): readonly string[] {
  return delta.operations.map((operation) => {
    if (operation.op === "record_probe") return "repositoryProbe";
    if (operation.op === "propose_decomposition") return "decomposition";
    if (operation.op === "invalidate_evidence") return `knowledge:evidence.claims:${operation.id}`;
    return `knowledge:${operation.section}:${operation.op === "upsert_knowledge" ? operation.value.id : operation.id}`;
  });
}

function intersect(left: readonly string[], right: readonly string[]): readonly string[] {
  const rightSet = new Set(right);
  return [...new Set(left.filter((item) => rightSet.has(item)))];
}

function preserveConcurrentContradictions(delta: PlanDelta, revision: number, overlaps: readonly string[]): PlanDelta {
  const overlap = new Set(overlaps);
  const operations: Array<PlanDelta["operations"][number]> = [];
  for (const operation of delta.operations) {
    const key = operation.op === "record_probe" ? "repositoryProbe"
      : operation.op === "propose_decomposition" ? "decomposition"
        : operation.op === "invalidate_evidence" ? `knowledge:evidence.claims:${operation.id}`
          : `knowledge:${operation.section}:${operation.op === "upsert_knowledge" ? operation.value.id : operation.id}`;
    if (!overlap.has(key)) {
      operations.push(operation);
      continue;
    }
    if (operation.op !== "upsert_knowledge") throw new Error(`Framing revision conflict on ${key}; preserve and reconfront the contradiction.`);
    const suffix = createHash("sha256").update(`${delta.planId}:${delta.baseRevision}:${key}:${operation.value.statement}`).digest("hex").slice(0, 12);
    const alternativeId = `${operation.value.id.slice(0, 230)}-alternative-${suffix}`;
    operations.push({ ...operation, value: { ...operation.value, id: alternativeId } });
    operations.push({
      op: "upsert_knowledge",
      section: "decisions",
      value: {
        id: `contradiction-${suffix}`,
        statement: `Two concurrent contributions contradict ${operation.value.id}; confront the alternatives before continuing.`,
        provenance: { kind: "open", reference: `concurrent-revision:${delta.baseRevision}` },
        blocksProgress: true,
        dependsOn: [operation.value.id, alternativeId],
      },
    });
  }
  return { ...delta, baseRevision: revision, operations, reason: `${delta.reason} Concurrent contradictions were preserved for explicit resolution.` };
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}
