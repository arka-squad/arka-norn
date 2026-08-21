import assert from "node:assert/strict";
import { posix } from "node:path";
import { test } from "node:test";

import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";
import type { FeatureIndexEntry, FeatureIndexStore } from "../../src/ports/outbound/feature-index-store.ts";
import type { FeatureStore } from "../../src/ports/outbound/feature-store.ts";
import type { Filesystem } from "../../src/ports/outbound/filesystem.ts";
import type { Logger } from "../../src/ports/outbound/logger.ts";
import type { PathPolicy } from "../../src/ports/outbound/path-policy.ts";
import type { ProjectIndexEntry, ProjectIndexStore } from "../../src/ports/outbound/project-index-store.ts";
import type { ProjectStore } from "../../src/ports/outbound/project-store.ts";
import { createFeatureUseCaseFactory } from "../../src/use-cases/features/create-feature.ts";
import { forgetFeatureUseCaseFactory } from "../../src/use-cases/features/forget-feature.ts";
import { importFeatureUseCaseFactory } from "../../src/use-cases/features/import-feature.ts";
import { listFeaturesUseCaseFactory } from "../../src/use-cases/features/list-features.ts";
import { scanFeaturesUseCaseFactory } from "../../src/use-cases/features/scan-features.ts";
import { showFeatureUseCaseFactory } from "../../src/use-cases/features/show-feature.ts";
import { switchToFeatureUseCaseFactory } from "../../src/use-cases/features/switch-to-feature.ts";
import { createProjectUseCaseFactory } from "../../src/use-cases/projects/create-project.ts";
import { forgetProjectUseCaseFactory } from "../../src/use-cases/projects/forget-project.ts";
import { importProjectUseCaseFactory } from "../../src/use-cases/projects/import-project.ts";
import { listProjectsUseCaseFactory } from "../../src/use-cases/projects/list-projects.ts";
import { scanProjectsUseCaseFactory } from "../../src/use-cases/projects/scan-projects.ts";
import { showProjectUseCaseFactory } from "../../src/use-cases/projects/show-project.ts";
import { switchToProjectUseCaseFactory } from "../../src/use-cases/projects/switch-to-project.ts";
import { setProjectOrchestrationModeUseCaseFactory } from "../../src/use-cases/projects/set-project-orchestration-mode.ts";

const first = new Date("2026-08-19T10:00:00.000Z");
const second = new Date("2026-08-19T11:00:00.000Z");

test("tous les cas d'usage Project fonctionnent derrière des ports fake", async () => {
  const harness = createHarness();
  const deps = harness.projectDeps;
  const id = ProjectId.of("project-alpha");

  const created = await createProjectUseCaseFactory(deps)({ id, name: "Project Alpha", root: "/work/project" });
  assert.equal(created.root, "/work/project");
  assert.equal(created.orchestrationMode, "manual");
  assert.deepEqual(await listProjectsUseCaseFactory(deps)(), [created]);
  assert.equal((await showProjectUseCaseFactory(deps)(id)).name, "Project Alpha");

  const selected = await switchToProjectUseCaseFactory(deps)(id);
  assert.equal(selected.updatedAt.toISOString(), second.toISOString());
  const automatic = await setProjectOrchestrationModeUseCaseFactory(deps)({ id, orchestrationMode: "automatic" });
  assert.equal(automatic.orchestrationMode, "automatic");
  assert.equal((await deps.indexStore.find(id))?.updatedAt.toISOString(), second.toISOString());
  await forgetProjectUseCaseFactory(deps)(id);
  assert.equal((await deps.indexStore.load()).length, 0);
  assert.equal(harness.projects.has(created.root), true, "forget ne supprime pas le marker");

  await importProjectUseCaseFactory(deps)({ root: created.root });
  await deps.indexStore.remove(id);
  const discovered = await scanProjectsUseCaseFactory(deps)({ target: "/work" });
  assert.equal(discovered[0]?.project?.id.value, id.value);
  assert.equal((await deps.indexStore.find(id))?.root, created.root);
  await deps.indexStore.remove(id);
  const direct = await scanProjectsUseCaseFactory(deps)({ target: created.root });
  assert.equal(direct.length, 1);
  assert.equal(direct[0]?.root, created.root);
  assert.equal(direct[0]?.project?.id.value, id.value);

  const movedRoot = "/work/project-moved";
  const moved = Project.create({ ...projectProps(created), root: movedRoot });
  harness.projects.set(movedRoot, moved);
  await assert.rejects(importProjectUseCaseFactory(deps)({ root: movedRoot }), (error: unknown) => error instanceof Error && "code" in error && error.code === "PROJECT_ALREADY_EXISTS");
  harness.projects.delete(created.root);
  const relocated = await scanProjectsUseCaseFactory(deps)({ target: movedRoot });
  assert.equal(relocated[0]?.project?.root, movedRoot);
  assert.equal((await deps.indexStore.find(id))?.root, movedRoot);
});

test("tous les cas d'usage Feature fonctionnent derrière des ports fake", async () => {
  const harness = createHarness();
  const projectId = ProjectId.of("project-alpha");
  await createProjectUseCaseFactory(harness.projectDeps)({ id: projectId, name: "Project Alpha", root: "/work/project" });
  const deps = harness.featureDeps;
  const id = FeatureId.of("feature-alpha");

  const created = await createFeatureUseCaseFactory(deps)({ id, projectId, name: "Feature Alpha", root: "/work/project/feature" });
  assert.equal(created.projectId.value, projectId.value);
  assert.deepEqual(await listFeaturesUseCaseFactory(deps)(), [created]);
  assert.equal((await showFeatureUseCaseFactory(deps)(id)).name, "Feature Alpha");

  const selected = await switchToFeatureUseCaseFactory(deps)(id);
  assert.equal(selected.updatedAt.toISOString(), second.toISOString());
  await forgetFeatureUseCaseFactory(deps)(id);
  assert.equal((await deps.indexStore.load()).length, 0);
  assert.equal(harness.features.has(created.root), true, "forget ne supprime pas le marker");

  await importFeatureUseCaseFactory(deps)({ root: created.root, projectId });
  await deps.indexStore.remove(id);
  const discovered = await scanFeaturesUseCaseFactory(deps)({ target: "/work/project", projectId });
  assert.equal(discovered[0]?.feature?.id.value, id.value);
  assert.equal((await deps.indexStore.find(id))?.root, created.root);
  await deps.indexStore.remove(id);
  const direct = await scanFeaturesUseCaseFactory(deps)({ target: created.root, projectId });
  assert.equal(direct.length, 1);
  assert.equal(direct[0]?.root, created.root);
  assert.equal(direct[0]?.feature?.id.value, id.value);

  const movedRoot = "/work/project/feature-moved";
  const moved = Feature.create({ ...featureProps(created), root: movedRoot });
  harness.features.set(movedRoot, moved);
  await assert.rejects(importFeatureUseCaseFactory(deps)({ root: movedRoot, projectId }), (error: unknown) => error instanceof Error && "code" in error && error.code === "FEATURE_ALREADY_EXISTS");
  harness.features.delete(created.root);
  const relocated = await scanFeaturesUseCaseFactory(deps)({ target: movedRoot, projectId });
  assert.equal(relocated[0]?.feature?.root, movedRoot);
  assert.equal((await deps.indexStore.find(id))?.root, movedRoot);
});

test("un index Project falsifié ne redéfinit jamais la frontière d'une Feature", async () => {
  const harness = createHarness();
  const productId = ProjectId.of("product");
  const foreignId = ProjectId.of("foreign");
  const featureId = FeatureId.of("feature");
  const foreignRoot = "/work/foreign";
  const forgedFeatureRoot = "/work/foreign/feature";
  const foreign = Project.create({
    id: foreignId, name: "Foreign", root: foreignRoot, schemaVersion: 4, orchestrationMode: "manual", createdAt: first, updatedAt: first,
  });
  const forgedFeature = Feature.create({
    id: featureId, projectId: productId, name: "Forged", root: forgedFeatureRoot,
    pipelineId: "arka-norn-default", schemaVersion: 3, createdAt: first, updatedAt: first,
  });
  harness.projects.set(foreignRoot, foreign);
  harness.features.set(forgedFeatureRoot, forgedFeature);
  await harness.projectDeps.indexStore.add({ id: productId.value, root: foreignRoot, name: "Forged index", updatedAt: first });
  await harness.featureDeps.indexStore.add({
    id: featureId.value, projectId: productId.value, root: forgedFeatureRoot, name: "Forged", updatedAt: first,
  });

  await assert.rejects(showProjectUseCaseFactory(harness.projectDeps)(productId), isPathSecurityError);
  await assert.rejects(showFeatureUseCaseFactory(harness.featureDeps)(featureId), isPathSecurityError);
  await assert.rejects(switchToFeatureUseCaseFactory(harness.featureDeps)(featureId), isPathSecurityError);
  assert.deepEqual(await listFeaturesUseCaseFactory(harness.featureDeps)(), []);
});

function createHarness() {
  const projects = new Map<string, Project>();
  const features = new Map<string, Feature>();
  let projectEntries: ProjectIndexEntry[] = [];
  let featureEntries: FeatureIndexEntry[] = [];
  const directories = new Set(["/work", "/work/project"]);
  const clockValues = [first, second, second, second];

  const projectStore: ProjectStore = {
    exists: async (root) => projects.has(root),
    hasLegacyMarker: async () => false,
    init: async (project) => { projects.set(project.root, project); directories.add(project.root); },
    load: async (root) => required(projects.get(root), root),
    save: async (project) => { projects.set(project.root, project); },
  };
  const featureStore: FeatureStore = {
    exists: async (root) => features.has(root),
    hasLegacyMarker: async () => false,
    init: async (feature) => { features.set(feature.root, feature); directories.add(feature.root); },
    load: async (root) => required(features.get(root), root),
    save: async (feature) => { features.set(feature.root, feature); },
  };
  const projectIndexStore: ProjectIndexStore = {
    load: async () => [...projectEntries],
    save: async (entries) => { projectEntries = [...entries]; },
    add: async (entry) => { projectEntries = [...projectEntries.filter((item) => item.id !== entry.id), entry]; },
    upsert: async (entry) => { projectEntries = [...projectEntries.filter((item) => item.id !== entry.id), entry]; },
    remove: async (id) => { projectEntries = projectEntries.filter((entry) => entry.id !== id.value); },
    touch: async (id, at) => { projectEntries = projectEntries.map((entry) => entry.id === id.value ? { ...entry, updatedAt: at } : entry); },
    find: async (id) => projectEntries.find((entry) => entry.id === id.value),
  };
  const featureIndexStore: FeatureIndexStore = {
    load: async () => [...featureEntries],
    save: async (entries) => { featureEntries = [...entries]; },
    add: async (entry) => { featureEntries = [...featureEntries.filter((item) => item.id !== entry.id), entry]; },
    upsert: async (entry) => { featureEntries = [...featureEntries.filter((item) => item.id !== entry.id), entry]; },
    remove: async (id) => { featureEntries = featureEntries.filter((entry) => entry.id !== id.value); },
    touch: async (id, at) => { featureEntries = featureEntries.map((entry) => entry.id === id.value ? { ...entry, updatedAt: at } : entry); },
    find: async (id) => featureEntries.find((entry) => entry.id === id.value),
  };
  const filesystem: Filesystem = {
    exists: async (path) => directories.has(path) || projects.has(markerRoot(path, "project.json")) || features.has(markerRoot(path, "feature.json")),
    mkdir: async (path) => { directories.add(path); },
    readFile: async () => "",
    writeFile: async () => {},
    readDir: async (path) => [...directories]
      .filter((entry) => posix.dirname(entry) === path)
      .map((entry) => posix.basename(entry)),
    remove: async () => {},
    stat: async (path) => ({ isFile: false, isDirectory: directories.has(path), size: 0, mtime: first }),
    resolve: (...segments) => posix.resolve(...segments),
    homeDir: () => "/home/test",
  };
  const pathPolicy: PathPolicy = {
    canonicalDirectory: async (candidate) => posix.resolve(candidate),
    assertContained: async (parent, child) => {
      const canonicalParent = posix.resolve(parent);
      const canonicalChild = posix.resolve(child);
      const relation = posix.relative(canonicalParent, canonicalChild);
      if (relation === "" || relation.startsWith("..")) throw new Error("outside parent");
      return { parent: canonicalParent, child: canonicalChild };
    },
    assertMarkerRoot: async (declaredRoot) => declaredRoot,
    assertWritableFile: async (filePath) => filePath,
  };
  const logger: Logger = {
    debug() {}, info() {}, warn() {}, error() {}, child() { return this; },
  };
  const clock = { now: () => clockValues.shift() ?? second };

  return {
    projects,
    features,
    projectDeps: { projectStore, indexStore: projectIndexStore, filesystem, clock, logger, pathPolicy },
    featureDeps: { featureStore, indexStore: featureIndexStore, projectIndexStore, projectStore, filesystem, clock, logger, pathPolicy },
  };
}

function markerRoot(path: string, marker: string): string {
  return path.endsWith(`/.arka-norn/${marker}`) ? posix.dirname(posix.dirname(path)) : "";
}

function required<T>(value: T | undefined, key: string): T {
  if (value === undefined) throw new Error(`missing fake value: ${key}`);
  return value;
}

function isPathSecurityError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "PATH_SECURITY";
}

function projectProps(project: Project) {
  return {
    id: project.id, name: project.name, schemaVersion: project.schemaVersion,
    orchestrationMode: project.orchestrationMode,
    createdAt: project.createdAt, updatedAt: project.updatedAt,
  };
}

function featureProps(feature: Feature) {
  return {
    id: feature.id, projectId: feature.projectId, name: feature.name,
    pipelineId: feature.pipelineId, schemaVersion: feature.schemaVersion,
    createdAt: feature.createdAt, updatedAt: feature.updatedAt,
  };
}
