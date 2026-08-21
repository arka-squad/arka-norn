import type { ExecutionPolicy } from "../../domain/orchestration/execution-policy.js";
import type { Project } from "../../domain/project/project.js";

/** Stores Project-owned routing and permission policy, separately from its marker. */
export interface OrchestrationPolicyStore {
  load(project: Project): Promise<ExecutionPolicy | undefined>;
  save(project: Project, policy: ExecutionPolicy): Promise<void>;
}
