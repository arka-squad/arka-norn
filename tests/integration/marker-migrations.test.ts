import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { migrateMarkerFile } from "../../src/adapters/outbound/filesystem/marker-migrator.ts";
import { FsFeatureStore } from "../../src/adapters/outbound/filesystem/fs-feature-store.ts";
import { FsProjectStore } from "../../src/adapters/outbound/filesystem/fs-project-store.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

const FIXTURES = resolve(import.meta.dirname, "..", "fixtures", "formats");

test("dry-run ne modifie pas le marker et apply crée un backup avant migration", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-marker-migration-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const markerPath = resolve(sandbox, "project.json");
  copyFileSync(resolve(FIXTURES, "project-marker-v1.json"), markerPath);
  const original = readFileSync(markerPath, "utf8");

  const preview = await migrateMarkerFile({ kind: "project", sourcePath: markerPath });
  assert.equal(preview.plan.changed, true);
  assert.equal(readFileSync(markerPath, "utf8"), original);

  const applied = await migrateMarkerFile({ kind: "project", sourcePath: markerPath, apply: true });
  assert.equal(applied.plan.changed, true);
  assert.equal(readFileSync(`${markerPath}.v1.bak`, "utf8"), original);
  const migrated = JSON.parse(readFileSync(markerPath, "utf8")) as { readonly schemaVersion: number };
  assert.equal(migrated.schemaVersion, 3);
  assert.equal("root" in migrated, false);

  const repeated = await migrateMarkerFile({ kind: "project", sourcePath: markerPath, apply: true });
  assert.equal(repeated.plan.changed, false);
  assert.equal(readFileSync(`${markerPath}.v1.bak`, "utf8"), original);
});

test("la migration Feature applique le projectId explicite et sauvegarde v1", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-feature-migration-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const markerPath = resolve(sandbox, "feature.json");
  copyFileSync(resolve(FIXTURES, "feature-marker-v1.json"), markerPath);

  const applied = await migrateMarkerFile({ kind: "feature", sourcePath: markerPath, projectId: "arka-norn", apply: true });
  assert.equal(applied.plan.changed, true);
  const migrated = JSON.parse(readFileSync(markerPath, "utf8")) as { readonly schemaVersion: number; readonly projectId: string };
  assert.deepEqual(migrated, { ...migrated, schemaVersion: 3, projectId: "arka-norn" });
  assert.equal("root" in migrated, false);
  assert.equal(JSON.parse(readFileSync(`${markerPath}.v1.bak`, "utf8")).version, 1);
});

test("les stores écrivent uniquement les markers Project et Feature v3 portables", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-v3-stores-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(projectRoot, "features", "cockpit");
  mkdirSync(featureRoot, { recursive: true });
  const timestamp = new Date("2026-08-19T10:00:00.000Z");
  const projectId = ProjectId.of("arka-norn");
  const project = Project.create({ id: projectId, name: "Arka Norn", root: projectRoot, schemaVersion: 3, createdAt: timestamp, updatedAt: timestamp });
  const feature = Feature.create({
    id: FeatureId.of("cockpit"), projectId, name: "Cockpit", root: featureRoot,
    pipelineId: "arka-norn-default", schemaVersion: 3, createdAt: timestamp, updatedAt: timestamp,
  });

  await new FsProjectStore().init(project);
  await new FsFeatureStore().init(feature);
  const projectMarker = JSON.parse(readFileSync(resolve(projectRoot, ".arka-norn", "project.json"), "utf8")) as { readonly schemaVersion: number };
  const featureMarker = JSON.parse(readFileSync(resolve(featureRoot, ".arka-norn", "feature.json"), "utf8")) as { readonly schemaVersion: number; readonly projectId: string };
  assert.equal(projectMarker.schemaVersion, 3);
  assert.equal(featureMarker.schemaVersion, 3);
  assert.equal("root" in projectMarker, false);
  assert.equal("root" in featureMarker, false);
  assert.equal(featureMarker.projectId, "arka-norn");
  assert.equal(existsSync(resolve(projectRoot, ".arka-norn", "depot.json")), false);
});

test("un marker Project v1 reste lisible puis save matérialise project.json v3", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-legacy-project-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const markerDir = resolve(sandbox, ".arka-norn");
  mkdirSync(markerDir, { recursive: true });
  const legacy = JSON.parse(readFileSync(resolve(FIXTURES, "project-marker-v1.json"), "utf8")) as Record<string, unknown>;
  const rootedLegacy = { ...legacy, root: sandbox };
  const legacyPath = resolve(markerDir, "depot.json");
  await import("node:fs/promises").then((fs) => fs.writeFile(legacyPath, `${JSON.stringify(rootedLegacy)}\n`, "utf8"));

  const store = new FsProjectStore();
  const project = await store.load(sandbox);
  assert.equal(project.id.value, "arka-norn");
  assert.equal(existsSync(resolve(markerDir, "project.json")), false);
  await store.save(project);
  assert.equal(existsSync(resolve(markerDir, "project.json")), true);
  assert.equal(JSON.parse(readFileSync(resolve(markerDir, "project.json"), "utf8")).schemaVersion, 3);
});

test("un marker Project v3 déplacé dérive sa nouvelle racine de son emplacement", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-portable-project-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const source = resolve(sandbox, "source");
  const destination = resolve(sandbox, "destination");
  mkdirSync(source, { recursive: true });
  const timestamp = new Date("2026-08-19T10:00:00.000Z");
  const store = new FsProjectStore();
  await store.init(Project.create({
    id: ProjectId.of("portable"), name: "Portable", root: source,
    schemaVersion: 3, createdAt: timestamp, updatedAt: timestamp,
  }));

  renameSync(source, destination);
  const moved = await store.load(destination);

  assert.equal(moved.root, await realpath(destination));
  assert.equal(moved.id.value, "portable");
});
