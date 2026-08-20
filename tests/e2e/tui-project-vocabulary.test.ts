import assert from "node:assert/strict";
import { test } from "node:test";

import { createHomeView } from "../../src/adapters/inbound/tui/views/home-view.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import type { ProjectId } from "../../src/domain/project/project-id.ts";
import type { CreateProjectInput } from "../../src/ports/inbound/for-projects.ts";
import { createContainer } from "../../src/composition/container.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";
import { readEnv } from "../../src/composition/env.ts";
import { resolve } from "node:path";

test("la vraie vue d'accueil expose uniquement le vocabulaire Project", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 100 });
  const view = createHomeView({
    initialProjects: [],
    projects: {
      list: async () => [],
      create: async (_input: CreateProjectInput) => { throw new Error("not used"); },
      importFrom: async () => { throw new Error("not used"); },
      show: async (_id: ProjectId) => { throw new Error("not used"); },
      forget: async (_id: ProjectId) => { throw new Error("not used"); },
      switchTo: async (_id: ProjectId) => { throw new Error("not used"); },
    },
    scan: { scan: async () => [] },
    cwd: "/workspace",
    contextRoot: "/workspace",
    skillHealth: "18/18 sains · 0 absents · 0 divergents",
    redraw: () => {},
  });

  view.render(renderer, createTheme({ NO_COLOR: "1" }, false));
  assert.match(output, /Projets/);
  assert.match(output, /Créer ou importer un Project/);
  assert.doesNotMatch(output, /Dépôt|dépôt/);
  assert.match(output, /Santé du système/);
  assert.match(output, /Installer \/ réparer les skills/);
  assert.match(output, /18\/18 sains/);
});

test("la composition TUI et le runtime CLI consomment le même PipelineReport", async () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const featureRoot = resolve(root, "examples", "feature-notion-linear");
  const container = createContainer(readEnv({ ARKA_NORN_HOME: resolve(root, ".input", "test-home") }, root));
  const tuiReport = await container.pipeline.inspect({ featureRoot });
  const cliReport = await createPipelineRuntime(root).inspect({ featureRoot });
  assert.deepEqual(tuiReport, cliReport);
  assert.equal(tuiReport.overallStatus, "failed");
});
