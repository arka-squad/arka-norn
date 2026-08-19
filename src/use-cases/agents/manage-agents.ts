import { AgentRegistration } from "../../domain/agent/agent.js";
import { createReadableAgentId } from "../../domain/agent/agent-id.js";
import { AgentAlreadyExistsError, AgentInactiveError, AgentNotFoundError } from "../../domain/errors.js";
import type { ForAgents, RegisterAgentInput, ReplaceAgentInput } from "../../ports/inbound/for-agents.js";
import type { AgentRegistryStore } from "../../ports/outbound/agent-registry-store.js";
import type { AgentSessionStore } from "../../ports/outbound/agent-session-store.js";
import type { Clock } from "../../ports/outbound/clock.js";

export function manageAgentsUseCaseFactory(deps: {
  readonly registry: AgentRegistryStore;
  readonly session: AgentSessionStore;
  readonly clock: Clock;
}): ForAgents {
  return {
    list: (project) => deps.registry.load(project),
    async show(project, id) {
      return find(await deps.registry.load(project), id.value);
    },
    async register(input) {
      const at = deps.clock.now();
      let created: AgentRegistration | undefined;
      await deps.registry.update(input.project, (agents) => {
        const id = input.id ?? createReadableAgentId(input.provider, input.role, at, new Set(agents.map((agent) => agent.id.value)));
        if (agents.some((agent) => agent.id.equals(id))) throw new AgentAlreadyExistsError(id.value);
        created = AgentRegistration.create({
          id,
          provider: input.provider.trim(),
          role: input.role.trim(),
          active: true,
          scope: scopeFrom(input),
          registeredAt: at,
          updatedAt: at,
        });
        return [...agents, created];
      });
      if (created === undefined) throw new Error("Agent registration transaction produced no agent");
      await deps.session.select(input.project.id, created.id);
      return created;
    },
    async deactivate(project, id) {
      const at = deps.clock.now();
      let updated: AgentRegistration | undefined;
      await deps.registry.update(project, (agents) => {
        const current = find(agents, id.value);
        updated = current.deactivate(at);
        return agents.map((agent) => agent.id.equals(id) ? updated! : agent);
      });
      if (updated === undefined) throw new Error("Agent deactivation transaction produced no agent");
      if ((await deps.session.current(project.id))?.equals(id) === true) await deps.session.select(project.id, undefined);
      return updated;
    },
    async replace(input) {
      const at = deps.clock.now();
      let replacement: AgentRegistration | undefined;
      await deps.registry.update(input.project, (agents) => {
        const replaced = find(agents, input.replacedAgentId.value);
        if (!replaced.active) throw new AgentInactiveError(replaced.id.value);
        const id = input.id ?? createReadableAgentId(input.provider, input.role, at, new Set(agents.map((agent) => agent.id.value)));
        if (agents.some((agent) => agent.id.equals(id))) throw new AgentAlreadyExistsError(id.value);
        replacement = AgentRegistration.create({
          id,
          provider: input.provider.trim(),
          role: input.role.trim(),
          active: true,
          scope: hasExplicitScope(input) ? scopeFrom(input) : replaced.scope,
          registeredAt: at,
          updatedAt: at,
          replacesAgentId: replaced.id,
        });
        return [...agents.map((agent) => agent.id.equals(replaced.id) ? agent.deactivate(at, id) : agent), replacement];
      });
      if (replacement === undefined) throw new Error("Agent replacement transaction produced no agent");
      const current = await deps.session.current(input.project.id);
      if (current?.equals(input.replacedAgentId) === true) await deps.session.select(input.project.id, replacement.id);
      return replacement;
    },
    async select(project, id) {
      const agent = find(await deps.registry.load(project), id.value);
      if (!agent.active) throw new AgentInactiveError(id.value);
      await deps.session.select(project.id, id);
      return agent;
    },
    async current(project) {
      const id = await deps.session.current(project.id);
      if (id === undefined) return undefined;
      const agent = (await deps.registry.load(project)).find((candidate) => candidate.id.equals(id));
      if (agent === undefined || !agent.active) {
        await deps.session.select(project.id, undefined);
        return undefined;
      }
      return agent;
    },
  };

  function scopeFrom(input: RegisterAgentInput | ReplaceAgentInput) {
    return {
      projectId: input.project.id,
      featureIds: [...(input.featureIds ?? [])],
      paths: [...(input.paths ?? [])],
      responsibilities: [...(input.responsibilities ?? [])],
    };
  }
}

function hasExplicitScope(input: ReplaceAgentInput): boolean {
  return input.featureIds !== undefined || input.paths !== undefined || input.responsibilities !== undefined;
}

function find(agents: readonly AgentRegistration[], id: string): AgentRegistration {
  const agent = agents.find((candidate) => candidate.id.value === id);
  if (agent === undefined) throw new AgentNotFoundError(id);
  return agent;
}
