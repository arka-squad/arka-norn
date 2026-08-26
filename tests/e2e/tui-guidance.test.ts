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
import { resolve } from "node:path";
import { test } from "node:test";

import { createFeatureDetailView } from "../../src/adapters/inbound/tui/views/feature-detail-view.ts";
import { createHomeView } from "../../src/adapters/inbound/tui/views/home-view.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { setActiveLocale } from "../../src/application/localization/locale.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";

const theme = createTheme({ NO_COLOR: "1" }, false);

setActiveLocale("fr");

test("l’accueil explique le parcours vide et la touche d’aide", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  const view = createHomeView({
    initialProjects: [],
    projects: {
      list: async () => [], create: async () => { throw new Error("unused"); }, importFrom: async () => { throw new Error("unused"); },
      show: async () => { throw new Error("unused"); }, forget: async () => {}, switchTo: async () => { throw new Error("unused"); },
      setOrchestrationMode: async () => { throw new Error("unused"); },
    },
    scan: { scan: async () => [] }, cwd: "/workspace", contextRoot: "/workspace", redraw() {},
  });
  view.render(renderer, theme);
  assert.match(output, /Action recommandée.*Cadrer ou importer un Project/s);
  assert.match(output, /cadrage Project -> publication -> cadrage Feature/);
  output = "";
  view.onKey({ kind: "help" });
  view.render(renderer, theme);
  assert.match(output, /Aide - démarrer avec arka-norn/);
  assert.match(output, /enregistrez votre identité Agent/);
});

test("l’accueil reflète un nouveau résumé de santé sans recréation", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  const view = createHomeView({
    initialProjects: [],
    projects: {
      list: async () => [], create: async () => { throw new Error("unused"); }, importFrom: async () => { throw new Error("unused"); },
      show: async () => { throw new Error("unused"); }, forget: async () => {}, switchTo: async () => { throw new Error("unused"); },
      setOrchestrationMode: async () => { throw new Error("unused"); },
    },
    scan: { scan: async () => [] },
    cwd: "/workspace",
    contextRoot: "/workspace",
    skillHealth: "0/21 sains · 21 absents · 0 divergents",
    systemHealth: "9 PASS · 0 WARN · 1 FAIL",
    redraw() {},
  });

  view.setHealth({
    skillHealth: "21/21 sains · 0 absents · 0 divergents",
    systemHealth: "10 PASS · 0 WARN · 0 FAIL",
  });
  view.render(renderer, theme);

  assert.match(output, /Santé du système: 10 PASS · 0 WARN · 0 FAIL/);
  assert.match(output, /21\/21 sains · 0 absents · 0 divergents/);
});

test("le cockpit Feature expose l’auteur, la raison et l’aide opératoire", async () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const featureRoot = resolve(root, "tests", "fixtures", "legacy", "fr", "examples", "feature-complete");
  const report = await createPipelineRuntime(root).inspect({
    featureRoot, featureId: "connecteurs-notion-linear", authorRegistry: [{ id: "Codex_dev_20260819", active: true, authorized: true }],
    pipelineId: "standard",
  });
  const at = new Date("2026-08-19T10:00:00.000Z");
  const feature = Feature.create({
    id: FeatureId.of("connecteurs-notion-linear"), projectId: ProjectId.of("cortex"), name: "Notion Linear",
    root: featureRoot, pipelineId: report.pipelineId, schemaVersion: 3, createdAt: at, updatedAt: at,
  });
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 140 });
  const view = createFeatureDetailView({ feature, report, currentAgentId: "Codex_dev_20260819", redraw() {}, onBack() {} });
  view.render(renderer, theme);
  assert.match(output, /Agent auteur : Codex_dev_20260819/);
  assert.match(output, /Pourquoi : recette_qa failed against the latest cr_dev/);
  output = "";
  view.onKey({ kind: "help" });
  view.render(renderer, theme);
  assert.match(output, /Aide - cockpit Feature/);
  assert.match(output, /ne sautez pas à une étape ultérieure/);
});
