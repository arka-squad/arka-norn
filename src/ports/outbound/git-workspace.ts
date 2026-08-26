/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { BaseSnapshot, TaskPlan } from "../../domain/orchestration/orchestration-plan.js";
import type { RiskChange } from "../../domain/orchestration/orchestration-risk.js";
import type { Project } from "../../domain/project/project.js";

export interface GitTaskWorkspace {
  readonly campaignId: string;
  readonly taskId: string;
  readonly branch: string;
  readonly path: string;
  readonly baseCommit: string;
}

export interface GitTaskCommit {
  readonly taskId: string;
  readonly branch: string;
  readonly commit: string;
  readonly changedPaths: readonly string[];
  readonly evidenceFingerprint: string;
}

export interface GitIntegrationResult {
  readonly campaignId: string;
  readonly branch: string;
  readonly path: string;
  readonly status: "integrated" | "conflicted";
  readonly commit?: string;
  readonly conflictPaths: readonly string[];
  readonly pendingCommits?: readonly string[];
  readonly requiresHumanApproval?: boolean;
  readonly discardedHunks?: readonly { readonly commit: string; readonly path: string; readonly hunk: string; readonly fingerprint: string }[];
}

export interface GitWorkspacePort {
  createSnapshot(project: Project, input: {
    readonly campaignId: string;
    readonly includeScopes: readonly string[];
    readonly declaredUntracked: readonly string[];
  }): Promise<BaseSnapshot>;
  createTaskWorkspace(project: Project, snapshot: BaseSnapshot, campaignId: string, task: TaskPlan): Promise<GitTaskWorkspace>;
  commitTask(project: Project, workspace: GitTaskWorkspace, task: TaskPlan, input: {
    readonly campaignId: string;
    readonly agentId: string;
    readonly profileId: string;
    readonly executionId: string;
    readonly proofReferences: readonly string[];
  }): Promise<GitTaskCommit>;
  integrate(project: Project, snapshot: BaseSnapshot, campaignId: string, commits: readonly GitTaskCommit[]): Promise<GitIntegrationResult>;
  resolveIntegrationConflict(project: Project, integration: GitIntegrationResult, input: { readonly agentId: string; readonly profileId: string; readonly executionId: string; readonly proofReferences: readonly string[] }): Promise<GitIntegrationResult>;
  buildPriorityFallback(project: Project, integration: GitIntegrationResult): Promise<GitIntegrationResult>;
  inspectRiskChanges(project: Project, snapshot: BaseSnapshot, integration: GitIntegrationResult, commits: readonly GitTaskCommit[]): Promise<readonly RiskChange[]>;
  applyFastForward(project: Project, snapshot: BaseSnapshot, integration: GitIntegrationResult): Promise<string>;
}
