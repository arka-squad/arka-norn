import type { AgentRegistration } from "../../domain/agent/agent.js";
import type { Project } from "../../domain/project/project.js";

export interface AgentRegistryStore {
  load(project: Project): Promise<readonly AgentRegistration[]>;
  update(project: Project, transform: (agents: readonly AgentRegistration[]) => readonly AgentRegistration[]): Promise<readonly AgentRegistration[]>;
}
