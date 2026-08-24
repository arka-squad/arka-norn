/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { GovernanceEvent } from "../../domain/governance/governance-event.js";
import type { GovernanceLedger } from "../../domain/governance/governance-ledger.js";
import type { Project } from "../../domain/project/project.js";

export interface GovernanceStore {
  load(project: Project): Promise<GovernanceLedger>;
  append(project: Project, event: GovernanceEvent): Promise<GovernanceLedger>;
}
