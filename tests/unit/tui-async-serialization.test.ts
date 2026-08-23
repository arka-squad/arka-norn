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

import assert from "node:assert/strict";
import { test } from "node:test";

import type { Scene, TuiApp } from "../../src/adapters/inbound/tui/runtime/tui-app.ts";
import { createProjectDetailView } from "../../src/adapters/inbound/tui/views/project-detail-view.ts";
import { createAgentSceneController } from "../../src/composition/tui/agent-scene-controller.ts";
import { AgentRegistration } from "../../src/domain/agent/agent.ts";
import { AgentId } from "../../src/domain/agent/agent-id.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";
import type { ForAgents } from "../../src/ports/inbound/for-agents.ts";
import type { ForFeatures } from "../../src/ports/inbound/for-features.ts";

test("ProjectDetail sérialise deux validations Entrée sur une action lente", async () => {
  const at = new Date("2026-08-19T10:00:00.000Z");
  const projectId = ProjectId.of("project");
  const featureId = FeatureId.of("feature");
  const project = Project.create({ id: projectId, name: "Project", root: "/workspace/project", schemaVersion: 3, createdAt: at, updatedAt: at });
  const feature = Feature.create({ id: featureId, projectId, name: "Feature", root: "/workspace/project/feature", pipelineId: "arka-norn-default", schemaVersion: 3, createdAt: at, updatedAt: at });
  let releaseSwitch: (() => void) | undefined;
  const waitForRelease = new Promise<void>((resolve) => { releaseSwitch = resolve; });
  let switchCalls = 0;
  let openCalls = 0;
  const features: ForFeatures = {
    list: async () => [feature],
    create: async () => feature,
    importFrom: async () => feature,
    show: async () => feature,
    forget: async () => {},
    setWorkflow: async () => feature,
    async switchTo() {
      switchCalls += 1;
      await waitForRelease;
      return feature;
    },
  };
  const view = createProjectDetailView({
    project,
    initialFeatures: [feature],
    initialMetrics: new Map([[feature.id.value, { status: "incomplete", debtDocuments: 0, qaFailures: 0, handoffSignals: 0, invalidDocuments: 0, pipelineId: feature.pipelineId, phase: "Concept", progress: "0/10", iteration: 1 }]]),
    features,
    scan: { scan: async () => [] },
    redraw() {},
    onBack() {},
    async onOpenFeature() { openCalls += 1; },
  });

  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "enter" });
  view.onKey({ kind: "enter" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(switchCalls, 1);
  assert.equal(openCalls, 0);

  releaseSwitch?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(openCalls, 1);
});

test("AgentScene ignore une seconde mutation pendant la première", async () => {
  const at = new Date("2026-08-20T10:00:00.000Z");
  const projectId = ProjectId.of("project");
  const project = Project.create({ id: projectId, name: "Project", root: "/workspace/project", schemaVersion: 3, createdAt: at, updatedAt: at });
  const agent = AgentRegistration.create({
    id: AgentId.of("Codex_dev_20260820"),
    provider: "Codex",
    role: "dev",
    active: true,
    scope: { projectId, featureIds: [], paths: [], responsibilities: [] },
    registeredAt: at,
    updatedAt: at,
  });
  const stack: Scene[] = [];
  const app: TuiApp = {
    push(scene) { stack.push(scene); },
    pop() { stack.pop(); },
    topScene: () => stack.at(-1),
    redraw() {},
    run: async () => {},
  };
  let releaseSelection: (() => void) | undefined;
  const selection = new Promise<void>((resolvePromise) => { releaseSelection = resolvePromise; });
  let selectCalls = 0;
  const agents: ForAgents = {
    sessionId: AgentSessionId.MAIN,
    list: async () => [agent],
    sessions: async () => [],
    show: async () => agent,
    register: async () => agent,
    deactivate: async () => agent,
    replace: async () => agent,
    async select() {
      selectCalls += 1;
      await selection;
      return agent;
    },
    current: async () => undefined,
  };
  const controller = createAgentSceneController(app, agents);
  await controller.open(project, () => {});
  const registry = app.topScene();
  assert.ok(registry);
  registry.onKey({ kind: "down" });
  registry.onKey({ kind: "enter" });
  const detail = app.topScene();
  assert.ok(detail);

  detail.onKey({ kind: "enter" });
  detail.onKey({ kind: "enter" });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(selectCalls, 1);

  releaseSelection?.();
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
});
