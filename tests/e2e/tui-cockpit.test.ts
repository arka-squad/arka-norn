import assert from "node:assert/strict";
import { resolve } from "node:path";
import { test } from "node:test";

import { createFeatureDetailView } from "../../src/adapters/inbound/tui/views/feature-detail-view.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { createPipelineRuntime } from "../../src/composition/pipeline-runtime.ts";

test("le cockpit Feature rend état, prochaine action, timeline, runs, dettes et handoffs", async () => {
  const root = resolve(import.meta.dirname, "..", "..");
  const featureRoot = resolve(root, "examples", "feature-notion-linear");
  const report = await createPipelineRuntime(root).inspect({ featureRoot, featureId: "connecteurs-notion-linear" });
  const at = new Date("2026-08-19T10:00:00.000Z");
  const feature = Feature.create({
    id: FeatureId.of("connecteurs-notion-linear"), projectId: ProjectId.of("cortex"), name: "Notion Linear",
    root: featureRoot, pipelineId: report.pipelineId, schemaVersion: 2, createdAt: at, updatedAt: at,
  });
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  createFeatureDetailView({ feature, report, redraw() {}, onBack() {} }).render(renderer, createTheme({ NO_COLOR: "1" }, false));

  assert.match(output, /État : failed/);
  assert.match(output, /Prochaine action : return_to_development → cr_dev/);
  assert.match(output, /Timeline du pipeline/);
  assert.match(output, /01 ✓ concept/);
  assert.match(output, /Runs : dev=1 QA=1 échecs=1 · dettes=1 · handoffs=/);
  assert.match(output, /Retirer de l'index/);
});
