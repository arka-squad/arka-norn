/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import type { OrchestrationCampaign } from "../../domain/orchestration/orchestration-campaign.js";
import type { Project } from "../../domain/project/project.js";

export interface WorkspaceFileRecord { readonly path: string; readonly size: number; readonly mode: number; readonly hash: string }
export interface WorkspaceManifest { readonly schemaVersion: 1; readonly projectId: string; readonly campaignId: string; readonly files: readonly WorkspaceFileRecord[]; readonly fingerprint: string }
export interface PreparedOrchestrationWorkspace { readonly logicalRoot: string; readonly physicalRoot: string; readonly baseline: WorkspaceManifest; readonly excludedPaths: readonly string[] }
export interface WorkspaceChange { readonly path: string; readonly kind: "created" | "modified" | "deleted" | "renamed"; readonly previousPath?: string; readonly size: number; readonly binary: boolean }
export interface WorkspaceChanges { readonly campaignId: string; readonly changes: readonly WorkspaceChange[]; readonly fingerprint: string }

export interface OrchestrationWorkspaceManager {
  prepare(project: Project, campaign: OrchestrationCampaign): Promise<PreparedOrchestrationWorkspace>;
  open(project: Project, campaign: OrchestrationCampaign): Promise<PreparedOrchestrationWorkspace>;
  verifyResume(project: Project, campaign: OrchestrationCampaign): Promise<void>;
  snapshotDirectBaseline(project: Project, campaign: OrchestrationCampaign): Promise<void>;
  changes(project: Project, campaign: OrchestrationCampaign): Promise<WorkspaceChanges>;
  apply(project: Project, campaign: OrchestrationCampaign, expectedFingerprint: string, validate?: () => Promise<void>): Promise<WorkspaceChanges>;
  discard(project: Project, campaign: OrchestrationCampaign): Promise<void>;
  cleanupExpired(campaigns: readonly OrchestrationCampaign[], now: Date): Promise<void>;
}
