/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { OrchestrationConfiguration } from "../../domain/orchestration/orchestration-configuration.js";
import type { Project } from "../../domain/project/project.js";

export interface OrchestrationConfigurationStore {
  load(project: Project): Promise<OrchestrationConfiguration | undefined>;
  save(project: Project, configuration: OrchestrationConfiguration): Promise<void>;
}
