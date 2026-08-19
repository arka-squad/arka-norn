import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020, type AnySchema } from "ajv/dist/2020.js";

import {
  isFeatureMarkerV2,
  isProjectMarkerV2,
  planFeatureMarkerMigration,
  planProjectMarkerMigration,
} from "../../src/domain/shared/marker-formats.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");
const FIXTURES = resolve(ROOT, "tests", "fixtures", "formats");

test("les markers v1 migrent vers les formats v2 canoniques", () => {
  const projectPlan = planProjectMarkerMigration(fixture("project-marker-v1.json"));
  const featurePlan = planFeatureMarkerMigration(fixture("feature-marker-v1.json"), { projectId: "arka-norn" });

  assert.equal(projectPlan.changed, true);
  assert.equal(projectPlan.output.schemaVersion, 2);
  assert.equal(projectPlan.output.createdAt, "2026-08-19T08:00:00.000Z");
  assert.equal(featurePlan.changed, true);
  assert.equal(featurePlan.output.projectId, "arka-norn");
  assert.equal(featurePlan.output.pipelineId, "arka-norn-default");
});

test("les migrations v2 sont idempotentes", () => {
  const project = fixture("project-marker-v2.json");
  const feature = fixture("feature-marker-v2.json");

  const projectPlan = planProjectMarkerMigration(project);
  const featurePlan = planFeatureMarkerMigration(feature);
  assert.equal(projectPlan.changed, false);
  assert.equal(featurePlan.changed, false);
  assert.deepEqual(projectPlan.output, project);
  assert.deepEqual(featurePlan.output, feature);
  assert.equal(isProjectMarkerV2(project), true);
  assert.equal(isFeatureMarkerV2(feature), true);
});

test("une Feature v1 sans projectId échoue explicitement", () => {
  assert.throws(
    () => planFeatureMarkerMigration(fixture("feature-marker-v1.json")),
    (error: unknown) => error instanceof Error && error.message.includes("requires an explicit projectId"),
  );
});

test("une version future est refusée explicitement", () => {
  assert.throws(
    () => planProjectMarkerMigration(fixture("project-marker-v3-unsupported.json")),
    (error: unknown) => error instanceof Error && error.message.includes("neither a supported v1 marker nor a valid v2 marker"),
  );
});

test("les schémas marker v2 valident les fixtures canoniques", () => {
  const ajv = new Ajv2020({ strict: true });
  ajv.addFormat("date-time", { type: "string", validate: (value: string) => !Number.isNaN(Date.parse(value)) });
  const projectSchema = json(resolve(ROOT, "schemas", "project-marker.schema.json")) as AnySchema;
  const featureSchema = json(resolve(ROOT, "schemas", "feature-marker.schema.json")) as AnySchema;
  const validateProject = ajv.compile(projectSchema);
  const validateFeature = ajv.compile(featureSchema);
  assert.equal(validateProject(fixture("project-marker-v2.json")), true, JSON.stringify(validateProject.errors));
  assert.equal(validateFeature(fixture("feature-marker-v2.json")), true, JSON.stringify(validateFeature.errors));
  assert.equal(validateProject(fixture("project-marker-v1.json")), false);
  assert.equal(validateFeature(fixture("feature-marker-v1.json")), false);
});

function fixture(name: string): unknown {
  return json(resolve(FIXTURES, name));
}

function json(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8")) as unknown;
}
