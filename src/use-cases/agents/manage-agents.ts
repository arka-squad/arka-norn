/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { AgentRegistration } from "../../domain/agent/agent.js";
import { translate } from "../../application/localization/locale.js";
import { createReadableAgentId } from "../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import { AgentAlreadyExistsError, AgentInactiveError, AgentNotFoundError, AgentRegistryChangedError, InvalidAgentOptionError } from "../../domain/errors.js";
import type { ForAgents, RegisterAgentInput, ReplaceAgentInput } from "../../ports/inbound/for-agents.js";
import type { AgentRegistryStore } from "../../ports/outbound/agent-registry-store.js";
import type { AgentSessionStore } from "../../ports/outbound/agent-session-store.js";
import type { Clock } from "../../ports/outbound/clock.js";

export function manageAgentsUseCaseFactory(deps: {
  readonly registry: AgentRegistryStore;
  readonly session: AgentSessionStore;
  readonly sessionId?: AgentSessionId;
  readonly clock: Clock;
}): ForAgents {
  const sessionId = deps.sessionId ?? AgentSessionId.MAIN;
  return {
    sessionId,
    list: (project) => deps.registry.load(project),
    async sessions(project) {
      const agents = await deps.registry.load(project);
      return (await deps.session.list(project.id)).flatMap((binding) => {
        const agent = agents.find((candidate) => candidate.id.equals(binding.agentId));
        return agent === undefined ? [] : [{ sessionId: binding.sessionId, agent }];
      });
    },
    async show(project, id) {
      return find(await deps.registry.load(project), id.value);
    },
    async register(input) {
      if (sessionId.equals(AgentSessionId.MAIN) && !isProductRole(input.role)) {
        throw new InvalidAgentOptionError("role", translate("cli.agent.mainReserved"));
      }
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
      }, input.expectedRegistryRevision);
      if (created === undefined) throw new Error("Agent registration transaction produced no agent");
      await deps.session.select(sessionId, input.project.id, created.id);
      return created;
    },
    async deactivate(project, id, expectedRegistryRevision) {
      const at = deps.clock.now();
      let updated: AgentRegistration | undefined;
      await deps.registry.update(project, (agents) => {
        const current = find(agents, id.value);
        updated = current.deactivate(at);
        return agents.map((agent) => agent.id.equals(id) ? updated! : agent);
      }, expectedRegistryRevision);
      if (updated === undefined) throw new Error("Agent deactivation transaction produced no agent");
      await deps.session.clearAgent(project.id, id);
      return updated;
    },
    async replace(input) {
      const mainAgentId = await deps.session.current(AgentSessionId.MAIN, input.project.id);
      if (mainAgentId?.equals(input.replacedAgentId) === true && !isProductRole(input.role)) {
        throw new InvalidAgentOptionError("role", translate("cli.agent.productReplacement"));
      }
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
      }, input.expectedRegistryRevision);
      if (replacement === undefined) throw new Error("Agent replacement transaction produced no agent");
      await deps.session.replaceAgent(input.project.id, input.replacedAgentId, replacement.id);
      return replacement;
    },
    async select(project, id, expectedRegistryRevision) {
      const snapshot = await deps.registry.loadSnapshot(project);
      if (expectedRegistryRevision !== undefined && snapshot.revision !== expectedRegistryRevision) throw new AgentRegistryChangedError(expectedRegistryRevision, snapshot.revision);
      const agent = find(snapshot.agents, id.value);
      if (!agent.active) throw new AgentInactiveError(id.value);
      if (sessionId.equals(AgentSessionId.MAIN) && !isProductRole(agent.role)) {
        throw new InvalidAgentOptionError("session", translate("cli.agent.mainSelection", { agent: agent.id.value, role: agent.role }));
      }
      await deps.session.select(sessionId, project.id, id);
      return agent;
    },
    async current(project) {
      const id = await deps.session.current(sessionId, project.id);
      if (id === undefined) return undefined;
      const agent = (await deps.registry.load(project)).find((candidate) => candidate.id.equals(id));
      if (agent === undefined || !agent.active) return undefined;
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

function isProductRole(role: string): boolean {
  return ["product", "product-owner", "po"].includes(role.trim().toLowerCase());
}

function hasExplicitScope(input: ReplaceAgentInput): boolean {
  return input.featureIds !== undefined || input.paths !== undefined || input.responsibilities !== undefined;
}

function find(agents: readonly AgentRegistration[], id: string): AgentRegistration {
  const agent = agents.find((candidate) => candidate.id.value === id);
  if (agent === undefined) throw new AgentNotFoundError(id);
  return agent;
}
