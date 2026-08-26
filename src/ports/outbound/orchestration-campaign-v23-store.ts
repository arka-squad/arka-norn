/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { CampaignPlan, RunAuthorization, TaskAttempt } from "../../domain/orchestration/orchestration-plan.js";
import type { GitIntegrationResult, GitTaskCommit } from "./git-workspace.js";
import type { RiskAssessment } from "../../domain/orchestration/orchestration-risk.js";

export type ApplicationGateCode = "human_policy" | "dirty_snapshot" | "risk_gate" | "priority_fallback" | "baseline_diverged";

export interface ApplicationGate {
  readonly code: ApplicationGateCode;
  readonly message: string;
}

export interface CampaignResultArtifact {
  readonly schemaVersion: 1;
  readonly fingerprint: string;
  readonly integration: GitIntegrationResult;
  readonly commits: readonly GitTaskCommit[];
  readonly risk: RiskAssessment;
  readonly appliedCommit?: string;
  readonly applicationGate?: ApplicationGate;
  readonly recordedAt: Date;
}

export interface CampaignApplicationArtifact {
  readonly schemaVersion: 1;
  readonly candidateFingerprint: string;
  readonly appliedCommit: string;
  readonly recordedAt: Date;
  readonly fingerprint: string;
}

export interface OrchestrationCampaignV23Store {
  listCampaignIds(projectId: string): Promise<readonly string[]>;
  savePlan(plan: CampaignPlan): Promise<void>;
  loadPlan(projectId: string, campaignId: string): Promise<CampaignPlan | undefined>;
  findPlanByFingerprint(projectId: string, fingerprint: string): Promise<CampaignPlan | undefined>;
  saveAuthorization(projectId: string, campaignId: string, authorization: RunAuthorization): Promise<void>;
  loadAuthorization(projectId: string, campaignId: string, plan: CampaignPlan): Promise<RunAuthorization | undefined>;
  appendAttempt(projectId: string, campaignId: string, attempt: TaskAttempt): Promise<void>;
  loadAttempts(projectId: string, campaignId: string): Promise<readonly TaskAttempt[]>;
  saveResult(projectId: string, campaignId: string, result: CampaignResultArtifact): Promise<void>;
  loadResult(projectId: string, campaignId: string): Promise<CampaignResultArtifact | undefined>;
  saveApplication(projectId: string, campaignId: string, application: CampaignApplicationArtifact): Promise<void>;
  loadApplication(projectId: string, campaignId: string): Promise<CampaignApplicationArtifact | undefined>;
}
