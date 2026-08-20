import type { AgentId } from "../../domain/agent/agent-id.js";
import type { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import type { ProjectId } from "../../domain/project/project-id.js";

export interface AgentSessionBinding {
  readonly sessionId: AgentSessionId;
  readonly projectId: ProjectId;
  readonly agentId: AgentId;
}

export interface AgentSessionStore {
  current(sessionId: AgentSessionId, projectId: ProjectId): Promise<AgentId | undefined>;
  select(sessionId: AgentSessionId, projectId: ProjectId, agentId: AgentId | undefined): Promise<void>;
  list(projectId: ProjectId): Promise<readonly AgentSessionBinding[]>;
  clearAgent(projectId: ProjectId, agentId: AgentId): Promise<void>;
  replaceAgent(projectId: ProjectId, replacedAgentId: AgentId, replacementAgentId: AgentId): Promise<void>;
}
