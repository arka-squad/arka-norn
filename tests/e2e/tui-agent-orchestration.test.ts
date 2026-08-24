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

import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { setActiveLocale } from "../../src/application/localization/locale.ts";
import type { Scene, TuiApp } from "../../src/adapters/inbound/tui/runtime/tui-app.ts";
import { createAgentOrchestrationSceneController } from "../../src/composition/tui/agent-orchestration-scene-controller.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { ForAgentOrchestration } from "../../src/ports/inbound/for-agent-orchestration.ts";

setActiveLocale("fr");

test("le menu TUI Product ouvre le prompt du rôle calculé avec session et permissions explicites", async () => {
  const stack: Scene[] = [];
  const app: TuiApp = {
    push(scene) { stack.push(scene); },
    pop() { stack.pop(); },
    topScene: () => stack.at(-1),
    redraw() {},
    run: async () => {},
  };
  const orchestration: ForAgentOrchestration = {
    advise: async () => ({
      schemaVersion: 1,
      projectId: "project",
      featureId: "feature",
      pipelineId: "arka-norn-fastdev",
      orchestrationMode: "manual",
      phase: "Audit · 3/4",
      nextStepId: "audit_rework",
      productPrincipal: { sessionId: "main", status: "ready", agentId: "Codex_product_20260820", reason: "prêt" },
      productNextAction: "Lancer le profil audit.",
      recommendations: [{ role: "audit", mode: "execute", canWrite: true, sessionId: "audit-feature", skill: "arka-fastdev", skillProfile: "audit", reason: "audit requis", command: "arka-norn agent prompt audit", delivery: "manual_prompt" }],
      handoffPromptCommand: "arka-norn agent handoff-prompt --project project --feature feature",
      warnings: [],
    }),
    initializationPrompt: async () => ({
      schemaVersion: 1,
      projectId: "project",
      featureId: "feature",
      role: "audit",
      mode: "execute",
      sessionId: "audit-feature",
      skill: "arka-fastdev",
      skillProfile: "audit",
      preflightCommand: "arka-norn skills install --profile audit",
      canWrite: true,
      expectedStepId: "audit_rework",
      prompt: "SESSION ISOLÉE audit-feature\nÉCRITURE BORNÉE audit_rework",
    }),
    productHandoffPrompt: async () => ({ schemaVersion: 1, projectId: "project", featureId: "feature", sessionId: "main", agentId: "Codex_product_20260820", prompt: "REPRISE PRODUCT" }),
  };
  const feature = Feature.create({
    id: FeatureId.of("feature"), projectId: ProjectId.of("project"), name: "Feature", root: "/workspace/project/feature",
    pipelineId: "arka-norn-fastdev", schemaVersion: 3,
    createdAt: new Date("2026-08-20T10:00:00.000Z"), updatedAt: new Date("2026-08-20T10:00:00.000Z"),
  });

  await createAgentOrchestrationSceneController(app, orchestration).openFeatureOrchestration(feature);
  const menu = app.topScene();
  assert.ok(menu);
  menu.onKey({ kind: "down" });
  menu.onKey({ kind: "enter" });
  const providerInput = app.topScene();
  assert.ok(providerInput);
  providerInput.onKey({ kind: "char", value: "Claude Code" });
  providerInput.onKey({ kind: "enter" });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  const prompt = app.topScene();
  assert.ok(prompt);
  let output = "";
  prompt.render(createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 }), createTheme({ NO_COLOR: "1" }, false));
  assert.match(output, /Prompt Agent audit/);
  assert.match(output, /PRÉREQUIS PRODUCT AVANT LA NOUVELLE SESSION/);
  assert.match(output, /skills install --profile audit/);
  assert.match(output, /SESSION ISOLÉE audit-feature/);
  assert.match(output, /ÉCRITURE BORNÉE audit_rework/);
});
