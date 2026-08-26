/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { ManagementRuntime } from "../../composition/management-runtime.js";
import { AgentId } from "../../domain/agent/agent-id.js";
import { AgentSessionId } from "../../domain/agent/agent-session-id.js";
import { AgentRegistryChangedError } from "../../domain/errors.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
import { ProjectId } from "../../domain/project/project-id.js";
import type { Project } from "../../domain/project/project.js";
import type { ForAgents } from "../../ports/inbound/for-agents.js";
import type { AgentRegistryStore } from "../../ports/outbound/agent-registry-store.js";
import type { AgentMutationInput, AgentRegistryView } from "./contracts.js";
import { WebMutationError } from "./web-mutation-concurrency.js";

export interface AgentManagementDeps {
  readonly management: ManagementRuntime;
  readonly registry: AgentRegistryStore;
  readonly agentsForSession: (sessionId: AgentSessionId) => ForAgents;
}

export async function agentRegistryView(deps: Pick<AgentManagementDeps, "management" | "registry">, project: Project, productionIds: ReadonlyMap<string, readonly string[]>): Promise<AgentRegistryView> {
  const [snapshot, sessions] = await Promise.all([deps.registry.loadSnapshot(project), deps.management.agents.sessions(project)]);
  return {
    registryRevision: snapshot.revision,
    agents: snapshot.agents.map((agent) => ({
      id: agent.id.value, provider: agent.provider, role: agent.role, active: agent.active,
      featureIds: agent.scope.featureIds.map((id) => id.value), paths: agent.scope.paths, responsibilities: agent.scope.responsibilities,
      productionIds: productionIds.get(agent.id.value) ?? [],
      currentSessionIds: sessions.filter((binding) => binding.agent.id.equals(agent.id)).map((binding) => binding.sessionId.value),
      ...(agent.replacesAgentId === undefined ? {} : { replacesAgentId: agent.replacesAgentId.value }),
      ...(agent.replacedByAgentId === undefined ? {} : { replacedByAgentId: agent.replacedByAgentId.value }),
      registeredAt: agent.registeredAt.toISOString(), updatedAt: agent.updatedAt.toISOString(), registryRevision: snapshot.revision,
    })),
  };
}

export async function registerAgent(deps: AgentManagementDeps, projectId: string, input: AgentMutationInput): Promise<void> {
  const context = await contextFor(deps, projectId, input.sessionId, input.expectedRegistryRevision, input.scope?.featureIds ?? []);
  await mapRegistryConflict(() => context.agents.register({
    project: context.project, provider: text(input.provider, "provider", 80), role: text(input.role, "role", 80),
    ...scopeInput(input.scope), expectedRegistryRevision: input.expectedRegistryRevision,
  }));
}

export async function selectAgent(deps: AgentManagementDeps, projectId: string, agentId: string, input: { readonly sessionId: string; readonly expectedRegistryRevision: number }): Promise<void> {
  const context = await contextFor(deps, projectId, input.sessionId, input.expectedRegistryRevision, []);
  await mapRegistryConflict(() => context.agents.select(context.project, AgentId.of(agentId), input.expectedRegistryRevision));
}

export async function replaceAgent(deps: AgentManagementDeps, projectId: string, agentId: string, input: AgentMutationInput): Promise<void> {
  const context = await contextFor(deps, projectId, input.sessionId, input.expectedRegistryRevision, input.scope?.featureIds ?? []);
  await mapRegistryConflict(() => context.agents.replace({
    project: context.project, replacedAgentId: AgentId.of(agentId), provider: text(input.provider, "provider", 80), role: text(input.role, "role", 80),
    ...scopeInput(input.scope), expectedRegistryRevision: input.expectedRegistryRevision,
  }));
}

export async function deactivateAgent(deps: AgentManagementDeps, projectId: string, agentId: string, input: { readonly expectedRegistryRevision: number; readonly confirmation: string }): Promise<void> {
  const project = await deps.management.projects.show(ProjectId.of(projectId));
  const snapshot = await deps.registry.loadSnapshot(project);
  assertRevision(input.expectedRegistryRevision, snapshot.revision);
  const agent = snapshot.agents.find((candidate) => candidate.id.value === agentId);
  if (agent === undefined) throw new WebMutationError(400, "agent_not_found");
  const linked = (await deps.management.agents.sessions(project)).some((binding) => binding.agent.id.value === agentId);
  if (linked && input.confirmation !== agentId) throw new WebMutationError(422, "agent_confirmation_required", { agentId });
  await mapRegistryConflict(() => deps.management.agents.deactivate(project, agent.id, input.expectedRegistryRevision));
}

async function contextFor(deps: AgentManagementDeps, projectId: string, sessionId: string, expectedRevision: number, featureIds: readonly string[]) {
  const project = await deps.management.projects.show(ProjectId.of(projectId));
  const snapshot = await deps.registry.loadSnapshot(project);
  assertRevision(expectedRevision, snapshot.revision);
  const session = AgentSessionId.of(sessionId);
  const known = new Set((await deps.management.features.list(project.id)).map((feature) => feature.id.value));
  for (const featureId of featureIds) if (!known.has(featureId)) throw new WebMutationError(400, "agent_scope_feature_unknown");
  return { project, agents: deps.agentsForSession(session) };
}

function scopeInput(scope: AgentMutationInput["scope"]): { readonly featureIds?: readonly FeatureId[]; readonly paths?: readonly string[]; readonly responsibilities?: readonly string[] } {
  if (scope === undefined) return {};
  const paths = scope.paths === undefined ? undefined : array(scope.paths, "paths", 128).map((path) => {
    if (path === ".git" || path.startsWith(".git/") || path === ".arka-norn" || path.startsWith(".arka-norn/")) throw new WebMutationError(400, "agent_scope_path_forbidden");
    return path;
  });
  return {
    ...(scope.featureIds === undefined ? {} : { featureIds: array(scope.featureIds, "featureIds", 128).map((value) => FeatureId.of(value)) }),
    ...(paths === undefined ? {} : { paths }),
    ...(scope.responsibilities === undefined ? {} : { responsibilities: array(scope.responsibilities, "responsibilities", 128) }),
  };
}

function array(value: unknown, field: string, maximum: number): readonly string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new WebMutationError(400, `invalid_agent_${field}`);
  const output: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string" || entry.length === 0 || entry.length > 512) throw new WebMutationError(400, `invalid_agent_${field}`);
    output.push(entry);
  }
  return output;
}

function text(value: unknown, field: string, maximum: number): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maximum) throw new WebMutationError(400, `invalid_agent_${field}`);
  return value.trim();
}

function assertRevision(expected: number, actual: number): void {
  if (!Number.isInteger(expected) || expected < 0) throw new WebMutationError(400, "invalid_expected_revision");
  if (expected !== actual) throw new WebMutationError(409, "agent_registry_changed");
}

async function mapRegistryConflict<T>(operation: () => Promise<T>): Promise<T> {
  try { return await operation(); } catch (error) {
    if (error instanceof AgentRegistryChangedError) throw new WebMutationError(409, "agent_registry_changed");
    throw error;
  }
}
