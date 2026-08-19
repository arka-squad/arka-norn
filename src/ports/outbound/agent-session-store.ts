import type { AgentId } from "../../domain/agent/agent-id.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface AgentSessionStore {
  current(projectId: ProjectId): Promise<AgentId | undefined>;
  select(projectId: ProjectId, agentId: AgentId | undefined): Promise<void>;
}
