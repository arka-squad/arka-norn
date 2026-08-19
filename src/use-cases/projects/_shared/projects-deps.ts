import type { Clock } from "../../../ports/outbound/clock.js";
import type { Filesystem } from "../../../ports/outbound/filesystem.js";
import type { Logger } from "../../../ports/outbound/logger.js";
import type { ProjectIndexStore } from "../../../ports/outbound/project-index-store.js";
import type { ProjectStore } from "../../../ports/outbound/project-store.js";
import type { PathPolicy } from "../../../ports/outbound/path-policy.js";

export interface ProjectsDeps {
  readonly projectStore: ProjectStore;
  readonly indexStore: ProjectIndexStore;
  readonly filesystem: Filesystem;
  readonly clock: Clock;
  readonly logger: Logger;
  readonly pathPolicy: PathPolicy;
}
