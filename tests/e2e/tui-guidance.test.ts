import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { createFeatureDetailView } from "../../src/adapters/inbound/tui/views/feature-detail-view.ts";
import { createHomeView } from "../../src/adapters/inbound/tui/views/home-view.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";

const theme = createTheme({ NO_COLOR: "1" }, false);

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
  assert.match(output, /Action recommandée.*Créer ou importer un Project/s);
  assert.match(output, /Project → Agent actif → Feature/);
  output = "";
  view.onKey({ kind: "help" });
  view.render(renderer, theme);
  assert.match(output, /Aide — démarrer avec arka-norn/);
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
    skillHealth: "0/18 sains · 18 absents · 0 divergents",
    systemHealth: "9 PASS · 0 WARN · 1 FAIL",
    redraw() {},
  });

  view.setHealth({
    skillHealth: "18/18 sains · 0 absents · 0 divergents",
    systemHealth: "10 PASS · 0 WARN · 0 FAIL",
  });
  view.render(renderer, theme);

  assert.match(output, /Santé\s+: 10 PASS · 0 WARN · 0 FAIL/);
  assert.match(output, /18\/18 sains · 0 absents · 0 divergents/);
});

test("le cockpit Feature expose l’auteur, la raison et l’aide opératoire", async () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const featureRoot = resolve(root, "examples", "feature-notion-linear");
  const report = await createPipelineRuntime(root).inspect({
    featureRoot, featureId: "connecteurs-notion-linear", authorRegistry: [{ id: "Codex_dev_20260819", active: true, authorized: true }],
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
  assert.match(output, /Pourquoi : recette_qa a échoué sur le dernier cr_dev/);
  output = "";
  view.onKey({ kind: "help" });
  view.render(renderer, theme);
  assert.match(output, /Aide — cockpit Feature/);
  assert.match(output, /ne sautez pas à une étape ultérieure/);
});
