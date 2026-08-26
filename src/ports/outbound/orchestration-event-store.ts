/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { CampaignEvent } from "../../domain/orchestration/orchestration-event.js";

export interface OrchestrationEventStore {
  load(projectId: string, campaignId: string): Promise<readonly CampaignEvent[]>;
  append(projectId: string, event: CampaignEvent): Promise<void>;
}
