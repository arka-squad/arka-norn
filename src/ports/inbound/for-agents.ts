import type { AgentRegistration } from "../../domain/agent/agent.js";
import type { AgentId } from "../../domain/agent/agent-id.js";
import type { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import type { FeatureId } from "../../domain/feature/feature-id.js";
import type { Project } from "../../domain/project/project.js";

export interface AgentScopeInput {
  readonly featureIds?: readonly FeatureId[];
  readonly paths?: readonly string[];
  readonly responsibilities?: readonly string[];
}

export interface RegisterAgentInput extends AgentScopeInput {
  readonly project: Project;
  readonly provider: string;
  readonly role: string;
  readonly id?: AgentId;
}

export interface ReplaceAgentInput extends AgentScopeInput {
  readonly project: Project;
  readonly replacedAgentId: AgentId;
  readonly provider: string;
  readonly role: string;
  readonly id?: AgentId;
}

export interface ForAgents {
  readonly sessionId: AgentSessionId;
  list(project: Project): Promise<readonly AgentRegistration[]>;
  sessions(project: Project): Promise<readonly { readonly sessionId: AgentSessionId; readonly agent: AgentRegistration }[]>;
  show(project: Project, id: AgentId): Promise<AgentRegistration>;
  register(input: RegisterAgentInput): Promise<AgentRegistration>;
  deactivate(project: Project, id: AgentId): Promise<AgentRegistration>;
  replace(input: ReplaceAgentInput): Promise<AgentRegistration>;
  select(project: Project, id: AgentId): Promise<AgentRegistration>;
  current(project: Project): Promise<AgentRegistration | undefined>;
}
