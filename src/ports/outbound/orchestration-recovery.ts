/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { OrchestrationConfiguration } from "../../domain/orchestration/orchestration-configuration.js";
import type { Project } from "../../domain/project/project.js";

export interface RecoveryManifestEntry {
  readonly source: "project" | "home";
  readonly logicalPath: string;
  readonly kind: "file" | "directory" | "symlink";
  readonly size: number;
  readonly sha256?: string;
}

export interface OrchestrationRecoveryManifest {
  readonly schemaVersion: 1;
  readonly projectId: string;
  readonly entries: readonly RecoveryManifestEntry[];
  readonly exactDuplicateAgentGroups: readonly (readonly string[])[];
  readonly fingerprint: string;
  readonly inspectedAt: Date;
}

export interface OrchestrationQuarantineReceipt {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly projectId: string;
  readonly manifestFingerprint: string;
  readonly path: string;
  readonly quarantinedAt: Date;
}

export interface OrchestrationRecovery {
  inspect(project: Project): Promise<OrchestrationRecoveryManifest>;
  quarantine(project: Project, expectedFingerprint: string): Promise<OrchestrationQuarantineReceipt>;
  restore(project: Project, quarantineId: string, expectedFingerprint: string): Promise<OrchestrationQuarantineReceipt>;
  importLegacy(project: Project, quarantineId: string, expectedFingerprint: string, at: Date): Promise<OrchestrationConfiguration>;
}
