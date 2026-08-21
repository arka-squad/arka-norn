import type { ExecutionRegistry } from "../../domain/orchestration/execution-registry.js";
import type { Project } from "../../domain/project/project.js";

/** Stores execution history; update is serialized by the filesystem adapter. */
export interface ExecutionRegistryStore {
  load(project: Project): Promise<ExecutionRegistry>;
  update(project: Project, transform: (registry: ExecutionRegistry) => ExecutionRegistry): Promise<ExecutionRegistry>;
}
