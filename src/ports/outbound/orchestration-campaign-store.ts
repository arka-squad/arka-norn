/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */
import type { Project } from "../../domain/project/project.js";
import type { OrchestrationCampaign } from "../../domain/orchestration/orchestration-campaign.js";

export interface OrchestrationCampaignStore {
  load(project: Project): Promise<readonly OrchestrationCampaign[]>;
  update(project: Project, transform: (campaigns: readonly OrchestrationCampaign[]) => readonly OrchestrationCampaign[]): Promise<readonly OrchestrationCampaign[]>;
}
