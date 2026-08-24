/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { FeatureId } from "../feature/feature-id.js";
import { ProjectId } from "../project/project-id.js";
import type { OrchestrationWorkspaceMode } from "./execution-policy.js";
import { isExecutionTarget, type ExecutionTarget } from "./types.js";

export const CAMPAIGN_STATUSES = [
  "planned", "running", "paused", "awaiting_decision", "awaiting_application",
  "blocked", "completed", "cancelled", "abandoned",
] as const;
export type CampaignStatus = typeof CAMPAIGN_STATUSES[number];

export const ORCHESTRATION_ACTION_KINDS = [
  "business_decision", "scope_expansion", "capability_expansion", "apply_changes", "retry", "inspect",
] as const;
export type OrchestrationActionKind = typeof ORCHESTRATION_ACTION_KINDS[number];

export interface CampaignActionRequired {
  readonly kind: OrchestrationActionKind;
  readonly reason: string;
  readonly fingerprint: string;
}

export interface CampaignDecision {
  readonly kind: "business_decision";
  readonly actor: string;
  readonly choice: string;
  readonly reason?: string;
  readonly fingerprint: string;
  readonly recordedAt: Date;
}

export interface OrchestrationCampaignProps {
  readonly id: string;
  readonly projectId: ProjectId;
  readonly featureId: FeatureId;
  readonly status: CampaignStatus;
  readonly revision: number;
  readonly target: ExecutionTarget;
  readonly workspaceMode: Exclude<OrchestrationWorkspaceMode, "unconfigured">;
  readonly scopePaths: readonly string[];
  readonly previewFingerprint: string;
  readonly frameworkVersion: string;
  readonly runtimeVersion?: string;
  readonly runtimeFingerprint?: string;
  readonly maxMissions: number;
  /** One retry for the whole campaign, never one retry per phase. */
  readonly retryCount: number;
  readonly missionIds: readonly string[];
  readonly decisions: readonly CampaignDecision[];
  readonly currentStepId: string;
  readonly actionRequired?: CampaignActionRequired;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class OrchestrationCampaign {
  private constructor(private readonly value: OrchestrationCampaignProps) {}

  public static create(value: OrchestrationCampaignProps): OrchestrationCampaign {
    validate(value);
    return new OrchestrationCampaign(freeze(value));
  }

  public static planned(input: Omit<OrchestrationCampaignProps, "status" | "revision" | "missionIds" | "decisions" | "createdAt" | "updatedAt">, at: Date): OrchestrationCampaign {
    return OrchestrationCampaign.create({ ...input, status: "planned", revision: 1, missionIds: [], decisions: [], createdAt: at, updatedAt: at });
  }

  public get props(): OrchestrationCampaignProps { return clone(this.value); }
  public get id(): string { return this.value.id; }
  public get projectId(): ProjectId { return this.value.projectId; }
  public get featureId(): FeatureId { return this.value.featureId; }
  public get status(): CampaignStatus { return this.value.status; }
  public get revision(): number { return this.value.revision; }
  public get target(): ExecutionTarget { return { ...this.value.target }; }
  public get workspaceMode(): Exclude<OrchestrationWorkspaceMode, "unconfigured"> { return this.value.workspaceMode; }
  public get scopePaths(): readonly string[] { return [...this.value.scopePaths]; }
  public get missionIds(): readonly string[] { return [...this.value.missionIds]; }
  public get decisions(): readonly CampaignDecision[] { return this.value.decisions.map(copyDecision); }
  public get currentStepId(): string { return this.value.currentStepId; }
  public get maxMissions(): number { return this.value.maxMissions; }
  public get retryCount(): number { return this.value.retryCount; }
  public get previewFingerprint(): string { return this.value.previewFingerprint; }
  public get frameworkVersion(): string { return this.value.frameworkVersion; }
  public get runtimeVersion(): string | undefined { return this.value.runtimeVersion; }
  public get runtimeFingerprint(): string | undefined { return this.value.runtimeFingerprint; }
  public get actionRequired(): CampaignActionRequired | undefined { return this.value.actionRequired === undefined ? undefined : { ...this.value.actionRequired }; }
  public get updatedAt(): Date { return new Date(this.value.updatedAt); }

  public start(executionId: string, at: Date): OrchestrationCampaign {
    if (this.value.status !== "planned") throw new Error(`Campaign ${this.id} cannot start from ${this.value.status}.`);
    return this.transition("running", at, { missionIds: [executionId] });
  }

  public appendMission(executionId: string, stepId: string, at: Date): OrchestrationCampaign {
    if (this.value.status !== "running") throw new Error(`Campaign ${this.id} is not running.`);
    if (this.value.missionIds.length >= this.value.maxMissions) return this.requireAction("inspect", "The campaign mission budget is exhausted.", this.value.previewFingerprint, at, "blocked");
    return this.transition("running", at, { missionIds: [...this.value.missionIds, executionId], currentStepId: stepId });
  }

  public requireAction(kind: OrchestrationActionKind, reason: string, fingerprint: string, at: Date, status: CampaignStatus = kind === "apply_changes" ? "awaiting_application" : "awaiting_decision", currentStepId?: string): OrchestrationCampaign {
    return this.transition(status, at, { actionRequired: { kind, reason, fingerprint }, ...(currentStepId === undefined ? {} : { currentStepId }) });
  }

  public resume(expectedRevision: number, at: Date): OrchestrationCampaign {
    this.assertRevision(expectedRevision);
    if (this.value.status !== "paused") throw new Error(`Campaign ${this.id} cannot resume from ${this.value.status}.`);
    return this.transition("running", at, { clearAction: true });
  }

  public decide(input: { readonly expectedRevision: number; readonly fingerprint: string; readonly actor: string; readonly choice: string; readonly reason?: string }, at: Date): OrchestrationCampaign {
    this.assertRevision(input.expectedRevision);
    if (this.value.status !== "awaiting_decision" || this.value.actionRequired?.kind !== "business_decision") throw new Error(`Campaign ${this.id} is not waiting for a business decision.`);
    if (input.fingerprint !== this.value.actionRequired.fingerprint) throw new Error("The decision request changed before confirmation.");
    const decision: CampaignDecision = { kind: "business_decision", actor: input.actor, choice: input.choice, ...(input.reason === undefined ? {} : { reason: input.reason }), fingerprint: input.fingerprint, recordedAt: at };
    return this.transition("running", at, { clearAction: true, decisions: [...this.value.decisions, decision] });
  }

  public retry(input: { readonly expectedRevision: number; readonly fingerprint: string }, at: Date): OrchestrationCampaign {
    this.assertRevision(input.expectedRevision);
    if (this.value.status !== "blocked" || this.value.actionRequired?.kind !== "retry") throw new Error(`Campaign ${this.id} is not waiting for a retry.`);
    if (input.fingerprint !== this.value.actionRequired.fingerprint) throw new Error("The retry request changed before confirmation.");
    if (this.value.retryCount >= 1) throw new Error(`Campaign ${this.id} already consumed its single retry.`);
    return this.transition("running", at, { clearAction: true, retryCount: this.value.retryCount + 1 });
  }

  public pause(at: Date): OrchestrationCampaign {
    if (this.value.status !== "running") throw new Error(`Campaign ${this.id} cannot pause from ${this.value.status}.`);
    return this.transition("paused", at);
  }

  public cancel(at: Date): OrchestrationCampaign {
    this.assertMutable("cancel");
    return this.transition("cancelled", at, { clearAction: true });
  }

  public abandon(at: Date): OrchestrationCampaign {
    this.assertMutable("abandon");
    return this.transition("abandoned", at, { clearAction: true });
  }

  public complete(at: Date): OrchestrationCampaign {
    if (this.value.status !== "running" && this.value.status !== "awaiting_application") throw new Error(`Campaign ${this.id} cannot complete from ${this.value.status}.`);
    return this.transition("completed", at, { clearAction: true });
  }

  public assertRevision(expected: number): void {
    if (expected !== this.value.revision) throw new Error(`Campaign ${this.id} changed; expected revision ${expected}, current revision ${this.value.revision}.`);
  }

  private assertMutable(action: string): void {
    if (["completed", "cancelled", "abandoned"].includes(this.value.status)) throw new Error(`Campaign ${this.id} cannot ${action} from ${this.value.status}.`);
  }

  private transition(status: CampaignStatus, at: Date, changes: { readonly missionIds?: readonly string[]; readonly decisions?: readonly CampaignDecision[]; readonly currentStepId?: string; readonly actionRequired?: CampaignActionRequired; readonly clearAction?: boolean; readonly retryCount?: number } = {}): OrchestrationCampaign {
    const { actionRequired: currentAction, ...base } = this.value;
    const nextAction = changes.actionRequired ?? currentAction;
    const action = changes.clearAction === true || nextAction === undefined ? {} : { actionRequired: nextAction };
    return OrchestrationCampaign.create({ ...base, ...action, ...(changes.missionIds === undefined ? {} : { missionIds: changes.missionIds }), ...(changes.decisions === undefined ? {} : { decisions: changes.decisions }), ...(changes.currentStepId === undefined ? {} : { currentStepId: changes.currentStepId }), ...(changes.retryCount === undefined ? {} : { retryCount: changes.retryCount }), status, revision: this.value.revision + 1, updatedAt: at });
  }
}

function validate(value: OrchestrationCampaignProps): void {
  if (!/^campaign-[a-z0-9-]{8,80}$/.test(value.id)) throw new Error("Invalid orchestration campaign id.");
  if (!(value.projectId instanceof ProjectId) || !(value.featureId instanceof FeatureId)) throw new Error("Campaign scope is invalid.");
  if (!(CAMPAIGN_STATUSES as readonly string[]).includes(value.status)) throw new Error("Campaign status is invalid.");
  if (!Number.isInteger(value.revision) || value.revision < 1) throw new Error("Campaign revision is invalid.");
  if (!isExecutionTarget(value.target) || value.target.source !== "user") throw new Error("Campaign target must be user-confirmed.");
  if (value.workspaceMode !== "isolated" && value.workspaceMode !== "direct") throw new Error("Campaign workspace mode must be configured.");
  if (value.scopePaths.length === 0 || value.scopePaths.some((path) => path === "" || path.startsWith("/") || path.includes(".."))) throw new Error("Campaign scope paths are invalid.");
  if (!validMissionBudget(value.maxMissions)) throw new Error("Campaign mission budget is invalid.");
  if (!validRetryCount(value.retryCount)) throw new Error("Campaign retry budget is invalid.");
  if (value.runtimeVersion !== undefined && !safeHumanText(value.runtimeVersion, 240)) throw new Error("Campaign runtime version is invalid.");
  if (value.runtimeFingerprint !== undefined && !/^[a-f0-9]{64}$/u.test(value.runtimeFingerprint)) throw new Error("Campaign runtime fingerprint is invalid.");
  if (new Set(value.missionIds).size !== value.missionIds.length || value.missionIds.length > value.maxMissions) throw new Error("Campaign mission history is invalid.");
  if (!Array.isArray(value.decisions) || value.decisions.length > 100 || (value.decisions as readonly unknown[]).some((decision) => !validDecision(decision))) throw new Error("Campaign decisions are invalid.");
  if (value.actionRequired !== undefined && (!(ORCHESTRATION_ACTION_KINDS as readonly string[]).includes(value.actionRequired.kind) || value.actionRequired.reason.length === 0 || value.actionRequired.fingerprint.length < 16)) throw new Error("Campaign required action is invalid.");
  if (Number.isNaN(value.createdAt.getTime()) || Number.isNaN(value.updatedAt.getTime()) || value.updatedAt < value.createdAt) throw new Error("Campaign timestamps are invalid.");
}

function clone(value: OrchestrationCampaignProps): OrchestrationCampaignProps {
  return { ...value, projectId: ProjectId.of(value.projectId.value), featureId: FeatureId.of(value.featureId.value), target: { ...value.target }, scopePaths: [...value.scopePaths], missionIds: [...value.missionIds], decisions: value.decisions.map(copyDecision), ...(value.actionRequired === undefined ? {} : { actionRequired: { ...value.actionRequired } }), createdAt: new Date(value.createdAt), updatedAt: new Date(value.updatedAt) };
}

function freeze(value: OrchestrationCampaignProps): OrchestrationCampaignProps {
  const cloned = clone(value);
  return Object.freeze({ ...cloned, target: Object.freeze(cloned.target), scopePaths: Object.freeze(cloned.scopePaths), missionIds: Object.freeze(cloned.missionIds), decisions: Object.freeze(cloned.decisions.map((decision) => Object.freeze(decision))), ...(cloned.actionRequired === undefined ? {} : { actionRequired: Object.freeze(cloned.actionRequired) }) });
}

function copyDecision(value: CampaignDecision): CampaignDecision { return { ...value, recordedAt: new Date(value.recordedAt) }; }
function validDecision(value: unknown): value is CampaignDecision {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const decision = value as Partial<CampaignDecision>;
  return decision.kind === "business_decision" && typeof decision.actor === "string" && safeHumanText(decision.actor, 160)
    && typeof decision.choice === "string" && safeHumanText(decision.choice, 500)
    && (decision.reason === undefined || (typeof decision.reason === "string" && safeHumanText(decision.reason, 500)))
    && typeof decision.fingerprint === "string" && /^[a-f0-9]{64}$/u.test(decision.fingerprint)
    && decision.recordedAt instanceof Date && !Number.isNaN(decision.recordedAt.getTime());
}
function safeHumanText(value: string, maximum: number): boolean { return value.trim().length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/u.test(value); }
function validMissionBudget(value: number): boolean { return Number.isInteger(value) && value >= 1 && value <= 50; }
function validRetryCount(value: number): boolean { return Number.isInteger(value) && value >= 0 && value <= 1; }
