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

import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project, type ProjectOrchestrationMode } from "../../src/domain/project/project.ts";

const createdAt = new Date("2026-08-19T10:00:00.000Z");

test("Project expose l'identité, le mode et les timestamps du format v4", () => {
  const project = Project.create({
    id: ProjectId.of("arka-norn"),
    name: "Arka Norn",
    root: "/workspace/arka-norn",
    schemaVersion: 4,
    orchestrationMode: "automatic",
    createdAt,
    updatedAt: createdAt,
  });
  assert.equal(project.schemaVersion, 4);
  assert.equal(project.orchestrationMode, "automatic");
  assert.equal(project.id.value, "arka-norn");
  assert.equal(project.createdAt.toISOString(), "2026-08-19T10:00:00.000Z");
});

test("Project normalise un appel legacy v3 au mode manuel", () => {
  const project = Project.create({
    id: ProjectId.of("arka-norn"),
    name: "Arka Norn",
    root: "/workspace/arka-norn",
    schemaVersion: 3,
    createdAt,
    updatedAt: createdAt,
  });

  assert.equal(project.schemaVersion, 4);
  assert.equal(project.orchestrationMode, "manual");
});

test("Project modifie explicitement le mode d'orchestration", () => {
  const project = Project.create({
    id: ProjectId.of("arka-norn"),
    name: "Arka Norn",
    root: "/workspace/arka-norn",
    schemaVersion: 3,
    createdAt,
    updatedAt: createdAt,
  });
  const updatedAt = new Date("2026-08-19T10:01:00.000Z");

  const automatic = project.withOrchestrationMode("automatic", updatedAt);

  assert.equal(automatic.orchestrationMode, "automatic");
  assert.equal(automatic.updatedAt.toISOString(), updatedAt.toISOString());
});

test("Feature appartient explicitement à son Project", () => {
  const projectId = ProjectId.of("arka-norn");
  const feature = Feature.create({
    id: FeatureId.of("project-cockpit"),
    projectId,
    name: "Project cockpit",
    root: "/workspace/arka-norn/features/project-cockpit",
    pipelineId: "arka-norn-default",
    schemaVersion: 3,
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
    schemaVersion: 3,
    createdAt,
    updatedAt: new Date("2026-08-19T09:59:59.000Z"),
  }));
});

test("Project refuse un mode d'orchestration inconnu", () => {
  assert.throws(() => Project.create({
    id: ProjectId.of("arka-norn"),
    name: "Arka Norn",
    root: "/workspace/arka-norn",
    schemaVersion: 4,
    orchestrationMode: "inconnu" as ProjectOrchestrationMode,
    createdAt,
    updatedAt: createdAt,
  }));
});
