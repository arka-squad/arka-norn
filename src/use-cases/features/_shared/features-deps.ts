/**
 * Features use-cases — dépendances partagées. Port fidèle de ProjectsDeps
 * (arka-cc-management, core/use-cases/projects/_shared/projects-deps.ts) :
 * chaque factory de use-case accepte cette même struct, la composition
 * root les câble uniformément.
 */
import type { Clock } from "../../../ports/outbound/clock.js";
import type { Filesystem } from "../../../ports/outbound/filesystem.js";
import type { Logger } from "../../../ports/outbound/logger.js";
import type { FeatureIndexStore } from "../../../ports/outbound/feature-index-store.js";
import type { FeatureStore } from "../../../ports/outbound/feature-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";
import type { ProjectIndexStore } from "../../../ports/outbound/project-index-store.js";
import type { ProjectStore } from "../../../ports/outbound/project-store.js";

export interface FeaturesDeps {
  readonly featureStore: FeatureStore;
  readonly indexStore: FeatureIndexStore;
  readonly filesystem: Filesystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly pathPolicy: PathPolicy;
  readonly projectIndexStore: ProjectIndexStore;
  readonly projectStore: ProjectStore;
}
