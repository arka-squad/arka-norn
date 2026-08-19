import { FsAuditTrail } from "../adapters/outbound/filesystem/fs-audit-trail.js";
import { FsFeatureIndexStore } from "../adapters/outbound/filesystem/fs-feature-index-store.js";
import { FsFeatureStore } from "../adapters/outbound/filesystem/fs-feature-store.js";
import { FsFilesystem } from "../adapters/outbound/filesystem/fs-filesystem.js";
import { FsPathPolicy } from "../adapters/outbound/filesystem/fs-path-policy.js";
import { FsProjectIndexStore } from "../adapters/outbound/filesystem/fs-project-index-store.js";
import { FsProjectStore } from "../adapters/outbound/filesystem/fs-project-store.js";
import { ConsoleLogger } from "../adapters/outbound/system/console-logger.js";
import { SystemClock } from "../adapters/outbound/system/system-clock.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import type { ForScan } from "../ports/inbound/for-scan.js";
import type { ForScanProjects } from "../ports/inbound/for-scan-projects.js";
import type { AuditEvent, AuditTrail } from "../ports/outbound/audit-trail.js";
import type { Logger, LogLevel } from "../ports/outbound/logger.js";
import { createFeatureUseCaseFactory } from "../use-cases/features/create-feature.js";
import { forgetFeatureUseCaseFactory } from "../use-cases/features/forget-feature.js";
import { importFeatureUseCaseFactory } from "../use-cases/features/import-feature.js";
import { listFeaturesUseCaseFactory } from "../use-cases/features/list-features.js";
import { scanFeaturesUseCaseFactory } from "../use-cases/features/scan-features.js";
import { showFeatureUseCaseFactory } from "../use-cases/features/show-feature.js";
import { switchToFeatureUseCaseFactory } from "../use-cases/features/switch-to-feature.js";
import { createProjectUseCaseFactory } from "../use-cases/projects/create-project.js";
import { forgetProjectUseCaseFactory } from "../use-cases/projects/forget-project.js";
import { importProjectUseCaseFactory } from "../use-cases/projects/import-project.js";
import { listProjectsUseCaseFactory } from "../use-cases/projects/list-projects.js";
import { scanProjectsUseCaseFactory } from "../use-cases/projects/scan-projects.js";
import { showProjectUseCaseFactory } from "../use-cases/projects/show-project.js";
import { switchToProjectUseCaseFactory } from "../use-cases/projects/switch-to-project.js";

export interface ManagementRuntime {
  readonly projects: ForProjects;
  readonly scanProjects: ForScanProjects;
  readonly features: ForFeatures;
  readonly scanFeatures: ForScan;
}

export function createManagementRuntime(options: { readonly homeDir: string; readonly logLevel?: LogLevel }): ManagementRuntime {
  const logger = new ConsoleLogger({ threshold: options.logLevel ?? "error" });
  const filesystem = new FsFilesystem();
  const clock = new SystemClock();
  const pathPolicy = new FsPathPolicy();
  const audit = new FsAuditTrail(options.homeDir);
  const projectIndexStore = new FsProjectIndexStore({ homeDir: options.homeDir, logger });
  const projectStore = new FsProjectStore(pathPolicy);
  const featureIndexStore = new FsFeatureIndexStore({ homeDir: options.homeDir, logger });
  const featureStore = new FsFeatureStore(pathPolicy);
  const projectsDeps = { projectStore, indexStore: projectIndexStore, filesystem, clock, logger, pathPolicy };
  const featuresDeps = { featureStore, indexStore: featureIndexStore, projectIndexStore, filesystem, clock, logger, pathPolicy };

  const rawProjects: ForProjects = {
    list: listProjectsUseCaseFactory(projectsDeps),
    create: createProjectUseCaseFactory(projectsDeps),
    importFrom: importProjectUseCaseFactory(projectsDeps),
    show: showProjectUseCaseFactory(projectsDeps),
    forget: forgetProjectUseCaseFactory(projectsDeps),
    switchTo: switchToProjectUseCaseFactory(projectsDeps),
  };
  const rawFeatures: ForFeatures = {
    list: listFeaturesUseCaseFactory(featuresDeps),
    create: createFeatureUseCaseFactory(featuresDeps),
    importFrom: importFeatureUseCaseFactory(featuresDeps),
    show: showFeatureUseCaseFactory(featuresDeps),
    forget: forgetFeatureUseCaseFactory(featuresDeps),
    switchTo: switchToFeatureUseCaseFactory(featuresDeps),
  };
  const rawScanProjects = scanProjectsUseCaseFactory(projectsDeps);
  const rawScanFeatures = scanFeaturesUseCaseFactory(featuresDeps);

  return {
    projects: auditProjects(rawProjects, audit, logger, clock),
    features: auditFeatures(rawFeatures, audit, logger, clock),
    scanProjects: {
      async scan(options) {
        const results = await rawScanProjects(options);
        await appendSafely(audit, logger, { occurredAt: clock.now(), action: "project.scan", entityType: "system", details: { discovered: results.filter((item) => item.project !== undefined).length } });
        return results;
      },
    },
    scanFeatures: {
      async scan(options) {
        const results = await rawScanFeatures(options);
        await appendSafely(audit, logger, { occurredAt: clock.now(), action: "feature.scan", entityType: "system", details: { discovered: results.filter((item) => item.feature !== undefined).length } });
        return results;
      },
    },
  };
}

function auditProjects(base: ForProjects, audit: AuditTrail, logger: Logger, clock: SystemClock): ForProjects {
  return {
    list: () => base.list(),
    show: (id) => base.show(id),
    async create(input) { const value = await base.create(input); await entityAudit(audit, logger, clock, "project.create", "project", value.id.value, value.root); return value; },
    async importFrom(input) { const value = await base.importFrom(input); await entityAudit(audit, logger, clock, "project.import", "project", value.id.value, value.root); return value; },
    async switchTo(id) { const value = await base.switchTo(id); await entityAudit(audit, logger, clock, "project.use", "project", value.id.value, value.root); return value; },
    async forget(id) { const value = await base.show(id); await base.forget(id); await entityAudit(audit, logger, clock, "project.forget", "project", id.value, value.root); },
  };
}

function auditFeatures(base: ForFeatures, audit: AuditTrail, logger: Logger, clock: SystemClock): ForFeatures {
  return {
    list: () => base.list(),
    show: (id) => base.show(id),
    async create(input) { const value = await base.create(input); await entityAudit(audit, logger, clock, "feature.create", "feature", value.id.value, value.root); return value; },
    async importFrom(input) { const value = await base.importFrom(input); await entityAudit(audit, logger, clock, "feature.import", "feature", value.id.value, value.root); return value; },
    async switchTo(id) { const value = await base.switchTo(id); await entityAudit(audit, logger, clock, "feature.use", "feature", value.id.value, value.root); return value; },
    async forget(id) { const value = await base.show(id); await base.forget(id); await entityAudit(audit, logger, clock, "feature.forget", "feature", id.value, value.root); },
  };
}

async function entityAudit(audit: AuditTrail, logger: Logger, clock: SystemClock, action: string, entityType: "project" | "feature", entityId: string, root: string): Promise<void> {
  await appendSafely(audit, logger, { occurredAt: clock.now(), action, entityType, entityId, root });
}

async function appendSafely(audit: AuditTrail, logger: Logger, event: AuditEvent): Promise<void> {
  try { await audit.append(event); } catch (error) { logger.warn("audit trail unavailable", { action: event.action, error: error instanceof Error ? error.message : String(error) }); }
}
