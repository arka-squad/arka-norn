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
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createProjectDetailView } from "../../src/adapters/inbound/tui/views/project-detail-view.ts";
import { createFeatureDetailView } from "../../src/adapters/inbound/tui/views/feature-detail-view.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { setActiveLocale } from "../../src/application/localization/locale.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Project } from "../../src/domain/project/project.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import type { ForFeatures } from "../../src/ports/inbound/for-features.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

setActiveLocale("fr");
const theme = createTheme({ NO_COLOR: "1" }, false);

test("l'espace Project sépare Essentiel, standard, FastDev et import puis confirme FastDev au clavier", () => {
  const project = projectAt("/workspace/project");
  const features = emptyFeatures();
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 140 });
  const view = createProjectDetailView({ project, initialFeatures: [], features, scan: { scan: async () => [] }, redraw() {}, onBack() {} });
  view.render(renderer, theme);
  assert.match(output, /Créer une Feature - Essential pipeline \(défaut\)/);
  assert.match(output, /Créer une Feature - Complete pipeline/);
  assert.match(output, /Créer une Feature - FastDev rework/);
  assert.match(output, /Importer une Feature existante/);

  output = "";
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "enter" });
  view.render(renderer, theme);
  assert.match(output, /Quatre documents structurés/);
  assert.match(output, /seconde passe de développement.*corrections sont requises/);

  output = "";
  view.onKey({ kind: "enter" });
  view.render(renderer, theme);
  assert.match(output, /Créer une Feature - FastDev rework/);
  assert.match(output, /Workflow : FastDev rework/);
});

test("le cockpit FastDev affiche le badge et ouvre l'action guidée principale", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-fastdev-"));
  mkdirSync(sandbox, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const projectId = ProjectId.of("project");
  const feature = Feature.create({
    id: FeatureId.of("rework"), projectId, name: "Rework navigation", root: sandbox,
    pipelineId: "arka-norn-fastdev", schemaVersion: 3,
    createdAt: new Date("2026-08-20T10:00:00.000Z"), updatedAt: new Date("2026-08-20T10:00:00.000Z"),
  });
  const report = await createPipelineRuntime(ROOT).inspect({
    featureRoot: sandbox, featureId: feature.id.value, pipelineId: feature.pipelineId, authorRegistry: [],
  });
  let continued = 0;
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 140 });
  const view = createFeatureDetailView({ feature, report, currentAgentId: "Codex_dev_20260820", redraw() {}, onBack() {}, onContinue: async () => { continued += 1; } });
  view.render(renderer, theme);
  assert.match(output, /\[FASTDEV\]/);
  assert.match(output, /Brief - 0\/4/);
  assert.match(output, /Continuer le rework/);
  assert.match(output, /constats ouverts/);
  view.onKey({ kind: "enter" });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));
  assert.equal(continued, 1);
});

function projectAt(root: string): Project {
  const at = new Date("2026-08-20T10:00:00.000Z");
  return Project.create({ id: ProjectId.of("project"), name: "Project", root, schemaVersion: 3, createdAt: at, updatedAt: at });
}

function emptyFeatures(): ForFeatures {
  const unused = async (): Promise<never> => { throw new Error("unused"); };
  return {
    list: async () => [],
    create: unused,
    importFrom: unused,
    show: unused,
    forget: async () => {},
    switchTo: unused,
    setWorkflow: unused,
  };
}
