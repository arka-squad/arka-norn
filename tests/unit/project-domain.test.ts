import assert from "node:assert/strict";
import { test } from "node:test";

import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

const createdAt = new Date("2026-08-19T10:00:00.000Z");

test("Project expose l'identité et les timestamps du format v2", () => {
  const project = Project.create({
    id: ProjectId.of("arka-norn"),
    name: "Arka Norn",
    root: "/workspace/arka-norn",
    schemaVersion: 2,
    createdAt,
    updatedAt: createdAt,
  });
  assert.equal(project.schemaVersion, 2);
  assert.equal(project.id.value, "arka-norn");
  assert.equal(project.createdAt.toISOString(), "2026-08-19T10:00:00.000Z");
});

test("Feature appartient explicitement à son Project", () => {
  const projectId = ProjectId.of("arka-norn");
  const feature = Feature.create({
    id: FeatureId.of("project-cockpit"),
    projectId,
    name: "Project cockpit",
    root: "/workspace/arka-norn/features/project-cockpit",
    pipelineId: "arka-norn-default",
    schemaVersion: 2,
    createdAt,
    updatedAt: createdAt,
  });
  assert.equal(feature.projectId.value, "arka-norn");
  assert.equal(feature.belongsTo(projectId), true);
  assert.equal(feature.belongsTo(ProjectId.of("autre-project")), false);
});

test("les invariants temporels refusent updatedAt avant createdAt", () => {
  assert.throws(() => Project.create({
    id: ProjectId.of("arka-norn"),
    name: "Arka Norn",
    root: "/workspace/arka-norn",
    schemaVersion: 2,
    createdAt,
    updatedAt: new Date("2026-08-19T09:59:59.000Z"),
  }));
});
