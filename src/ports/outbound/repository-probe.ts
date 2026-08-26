/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { RepositoryProbe } from "../../domain/framing/framing-plan.js";

export interface RepositoryProbePort {
  inspect(input: {
    readonly projectId: string;
    readonly projectRoot: string;
    readonly scopePaths?: readonly string[];
  }): Promise<RepositoryProbe>;
}
