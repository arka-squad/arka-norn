import assert from "node:assert/strict";
import { test } from "node:test";

import { createProjectDetailView } from "../../src/adapters/inbound/tui/views/project-detail-view.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";
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
    async switchTo() {
      switchCalls += 1;
      await waitForRelease;
      return feature;
    },
  };
  const view = createProjectDetailView({
    project,
    initialFeatures: [feature],
    initialMetrics: new Map([[feature.id.value, { status: "incomplete", debtDocuments: 0, qaFailures: 0, handoffSignals: 0, invalidDocuments: 0 }]]),
    features,
    scan: { scan: async () => [] },
    redraw() {},
    onBack() {},
    async onOpenFeature() { openCalls += 1; },
  });

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
