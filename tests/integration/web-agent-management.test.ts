/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";

import { FsAgentRegistryStore } from "../../src/adapters/outbound/filesystem/fs-agent-registry-store.ts";
import { agentRegistryView, deactivateAgent, registerAgent, replaceAgent, selectAgent } from "../../src/application/web/agent-management-service.ts";
import { WebMutationError } from "../../src/application/web/web-mutation-concurrency.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { InvalidAgentOptionError } from "../../src/domain/errors.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

test("les mutations Agent Web conservent révision, sessions, filiation et règles Product", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "norn-web-agents-"));
  const home = resolve(sandbox, "home");
  const root = resolve(sandbox, "project");
  mkdirSync(root, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  let tick = Date.parse("2026-08-27T09:00:00.000Z");
  const clock = { now: () => new Date(tick += 1_000) };
  const management = createManagementRuntime({ homeDir: home, clock, sessionId: AgentSessionId.MAIN });
  const registry = new FsAgentRegistryStore();
  const agentsForSession = (sessionId: AgentSessionId) => createManagementRuntime({ homeDir: home, clock, sessionId }).agents;
  const deps = { management, registry, agentsForSession };
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root });

  await registerAgent(deps, "project", { provider: "Claude", role: "product", sessionId: "main", expectedRegistryRevision: 0 });
  let view = await agentRegistryView(deps, project, new Map());
  assert.equal(view.registryRevision, 1);
  const product = view.agents[0]!;
  assert.deepEqual(product.currentSessionIds, ["main"]);

  await assert.rejects(
    registerAgent(deps, "project", { provider: "Codex", role: "dev", sessionId: "main", expectedRegistryRevision: 1 }),
    InvalidAgentOptionError,
  );
  await assert.rejects(
    registerAgent(deps, "project", { provider: "Codex", role: "dev", sessionId: "dev-work", expectedRegistryRevision: 1, scope: { paths: [".git"] } }),
    (error: unknown) => error instanceof WebMutationError && error.code === "agent_scope_path_forbidden",
  );
  await registerAgent(deps, "project", { provider: "Codex", role: "dev", sessionId: "dev-work", expectedRegistryRevision: 1, scope: { paths: ["src"], responsibilities: ["implementation"] } });
  view = await agentRegistryView(deps, project, new Map());
  const developer = view.agents.find((agent) => agent.role === "dev")!;
  assert.equal(view.registryRevision, 2);
  assert.deepEqual(developer.currentSessionIds, ["dev-work"]);

  await assert.rejects(
    selectAgent(deps, "project", developer.id, { sessionId: "dev-work", expectedRegistryRevision: 1 }),
    (error: unknown) => error instanceof WebMutationError && error.code === "agent_registry_changed",
  );
  await assert.rejects(
    selectAgent(deps, "project", developer.id, { sessionId: "main", expectedRegistryRevision: 2 }),
    InvalidAgentOptionError,
  );
  await assert.rejects(
    replaceAgent(deps, "project", product.id, { provider: "Codex", role: "dev", sessionId: "dev-work", expectedRegistryRevision: 2 }),
    InvalidAgentOptionError,
  );

  await replaceAgent(deps, "project", product.id, { provider: "ChatGPT", role: "product", sessionId: "main", expectedRegistryRevision: 2 });
  view = await agentRegistryView(deps, project, new Map());
  const previous = view.agents.find((agent) => agent.id === product.id)!;
  const replacement = view.agents.find((agent) => agent.replacesAgentId === product.id)!;
  assert.equal(view.registryRevision, 3);
  assert.equal(previous.active, false);
  assert.equal(previous.replacedByAgentId, replacement.id);
  assert.deepEqual(replacement.currentSessionIds, ["main"]);

  await assert.rejects(
    deactivateAgent(deps, "project", developer.id, { expectedRegistryRevision: 3, confirmation: "wrong" }),
    (error: unknown) => error instanceof WebMutationError && error.code === "agent_confirmation_required",
  );
  await deactivateAgent(deps, "project", developer.id, { expectedRegistryRevision: 3, confirmation: developer.id });
  view = await agentRegistryView(deps, project, new Map());
  assert.equal(view.registryRevision, 4);
  assert.equal(view.agents.find((agent) => agent.id === developer.id)?.active, false);
  assert.deepEqual(view.agents.find((agent) => agent.id === developer.id)?.currentSessionIds, []);
});
