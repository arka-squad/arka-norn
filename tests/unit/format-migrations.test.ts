import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";

import {
  isFeatureMarkerV3,
  isProjectMarkerV3,
  isProjectMarkerV4,
  planFeatureMarkerMigration,
  planProjectMarkerMigration,
} from "../../src/domain/shared/marker-formats.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const FIXTURES = resolve(ROOT, "tests", "fixtures", "formats");

test("les markers v1 migrent vers Project v4 et Feature v3 portables", () => {
  const projectPlan = planProjectMarkerMigration(fixture("project-marker-v1.json"));
  const featurePlan = planFeatureMarkerMigration(fixture("feature-marker-v1.json"), { projectId: "arka-norn" });

  assert.equal(projectPlan.changed, true);
  assert.equal(projectPlan.output.schemaVersion, 4);
  assert.equal(projectPlan.output.orchestrationMode, "manual");
  assert.equal("root" in projectPlan.output, false);
  assert.equal(projectPlan.output.createdAt, "2026-08-19T08:00:00.000Z");
  assert.equal(featurePlan.changed, true);
  assert.equal(featurePlan.output.projectId, "arka-norn");
  assert.equal(featurePlan.output.pipelineId, "arka-norn-default");
  assert.equal("root" in featurePlan.output, false);
});

test("les markers v2 migrent en supprimant la racine machine", () => {
  const projectPlan = planProjectMarkerMigration(fixture("project-marker-v2.json"));
  const featurePlan = planFeatureMarkerMigration(fixture("feature-marker-v2.json"));

  assert.equal(projectPlan.changed, true);
  assert.equal(projectPlan.fromVersion, 2);
  assert.equal(projectPlan.toVersion, 4);
  assert.equal(projectPlan.output.orchestrationMode, "manual");
  assert.equal("root" in projectPlan.output, false);
  assert.equal(featurePlan.changed, true);
  assert.equal("root" in featurePlan.output, false);
});

test("un Project v3 migre vers le mode manuel tandis qu'une Feature v3 reste idempotente", () => {
  const project = fixture("project-marker-v3.json");
  const feature = fixture("feature-marker-v3.json");

  const projectPlan = planProjectMarkerMigration(project);
  const featurePlan = planFeatureMarkerMigration(feature);
  assert.equal(projectPlan.changed, true);
  assert.equal(projectPlan.fromVersion, 3);
  assert.equal(projectPlan.toVersion, 4);
  assert.equal(projectPlan.output.orchestrationMode, "manual");
  assert.equal(featurePlan.changed, false);
  assert.deepEqual(featurePlan.output, feature);
  assert.equal(isProjectMarkerV3(project), true);
  assert.equal(isFeatureMarkerV3(feature), true);
});

test("un Project v4 est idempotent", () => {
  const project = fixture("project-marker-v4.json");

  const plan = planProjectMarkerMigration(project);

  assert.equal(plan.changed, false);
  assert.deepEqual(plan.output, project);
  assert.equal(isProjectMarkerV4(project), true);
});

test("une Feature v1 sans projectId échoue explicitement", () => {
  assert.throws(
    () => planFeatureMarkerMigration(fixture("feature-marker-v1.json")),
    (error: unknown) => error instanceof Error && error.message.includes("requires an explicit projectId"),
  );
});

test("une version future est refusée explicitement", () => {
  assert.throws(
    () => planProjectMarkerMigration(fixture("project-marker-v5-unsupported.json")),
    (error: unknown) => error instanceof Error && error.message.includes("newer than supported version 4"),
  );
});

test("le schéma Project v4 et le schéma Feature v3 valident les fixtures portables", () => {
  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
  const projectSchema = json(resolve(ROOT, "schemas", "project-marker.schema.json")) as AnySchema;
  const featureSchema = json(resolve(ROOT, "schemas", "feature-marker.schema.json")) as AnySchema;
  const validateProject = ajv.compile(projectSchema);
  const validateFeature = ajv.compile(featureSchema);
  assert.equal(validateProject(fixture("project-marker-v4.json")), true, JSON.stringify(validateProject.errors));
  assert.equal(validateFeature(fixture("feature-marker-v3.json")), true, JSON.stringify(validateFeature.errors));
  assert.equal(validateProject(fixture("project-marker-v3.json")), false);
  assert.equal(validateProject(fixture("project-marker-v2.json")), false);
  assert.equal(validateFeature(fixture("feature-marker-v2.json")), false);
  assert.equal(validateProject(fixture("project-marker-v1.json")), false);
  assert.equal(validateFeature(fixture("feature-marker-v1.json")), false);
});

function fixture(name: string): unknown {
  return json(resolve(FIXTURES, name));
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
