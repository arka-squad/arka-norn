#!/usr/bin/env node
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import { FsFeatureIndexStore } from "../dist/adapters/outbound/filesystem/fs-feature-index-store.js";
import { FsProjectIndexStore } from "../dist/adapters/outbound/filesystem/fs-project-index-store.js";
import { createManagementRuntime } from "../dist/composition/management-runtime.js";
import { createPipelineRuntime } from "../dist/composition/pipeline-runtime.js";
import { loadProjectMetrics } from "../dist/composition/tui/project-dashboard.js";

const FRAMEWORK_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECT_COUNT = 50;
const FEATURE_COUNT = 200;
const DASHBOARD_COUNT = 50;
const budgets = { projectsMs: 1500, featuresMs: 2500, dashboardMs: 3000, totalMs: 5000 };
const sandbox = await mkdtemp(path.join(tmpdir(), "arka-norn-benchmark-"));

try {
  const timestamp = "2026-08-19T00:00:00.000Z";
  const projectEntries = [];
  const featureEntries = [];
  for (let index = 0; index < PROJECT_COUNT; index++) {
    const id = `project-${String(index).padStart(3, "0")}`;
    const root = path.join(sandbox, "projects", id);
    projectEntries.push({ id, root, name: `Project ${index}`, updatedAt: new Date(timestamp) });
    await writeMarker(root, "project.json", { schemaVersion: 2, id, name: `Project ${index}`, root, createdAt: timestamp, updatedAt: timestamp });
  }
  const projectId = projectEntries[0].id;
  for (let index = 0; index < FEATURE_COUNT; index++) {
    const id = `feature-${String(index).padStart(3, "0")}`;
    const root = path.join(projectEntries[0].root, "features", id);
    featureEntries.push({ id, projectId, root, name: `Feature ${index}`, updatedAt: new Date(timestamp) });
    await writeMarker(root, "feature.json", { schemaVersion: 2, id, projectId, name: `Feature ${index}`, root, pipelineId: "arka-norn-default", createdAt: timestamp, updatedAt: timestamp });
  }
  await Promise.all([
    new FsProjectIndexStore({ homeDir: sandbox }).save(projectEntries),
    new FsFeatureIndexStore({ homeDir: sandbox }).save(featureEntries),
  ]);

  const management = createManagementRuntime({ homeDir: sandbox });
  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT);
  const start = performance.now();
  const projects = await management.projects.list();
  const afterProjects = performance.now();
  const features = await management.features.list();
  const afterFeatures = performance.now();
  // Le dataset synthétique ne contient aucun document signé ; il fournit donc
  // explicitement le registre d'auteurs vide requis par l'inspection stricte.
  const metrics = await loadProjectMetrics(features.slice(0, DASHBOARD_COUNT), pipeline, () => []);
  const end = performance.now();
  const durations = {
    projectsMs: round(afterProjects - start),
    featuresMs: round(afterFeatures - afterProjects),
    dashboardMs: round(end - afterFeatures),
    totalMs: round(end - start),
  };
  const counts = { projects: projects.length, features: features.length, dashboardFeatures: metrics.size };
  const exceeded = Object.entries(budgets).filter(([key, budget]) => durations[key] > budget);
  process.stdout.write(`${JSON.stringify({ schemaVersion: 1, dataset: { projects: PROJECT_COUNT, features: FEATURE_COUNT, dashboardFeatures: DASHBOARD_COUNT }, counts, durations, budgets, ok: exceeded.length === 0 }, null, 2)}\n`);
  if (counts.projects !== PROJECT_COUNT || counts.features !== FEATURE_COUNT || counts.dashboardFeatures !== DASHBOARD_COUNT) {
    throw new Error(`Benchmark incomplet : ${JSON.stringify(counts)}`);
  }
  if (exceeded.length > 0) {
    throw new Error(`Budget de performance dépassé : ${exceeded.map(([key, budget]) => `${key}=${durations[key]}ms>${budget}ms`).join(", ")}`);
  }
} finally {
  await rm(sandbox, { recursive: true, force: true });
}

async function writeMarker(root, filename, content) {
  const markerDirectory = path.join(root, ".arka-norn");
  await mkdir(markerDirectory, { recursive: true });
  await writeFile(path.join(markerDirectory, filename), `${JSON.stringify(content)}\n`, { mode: 0o600 });
}

function round(value) {
  return Math.round(value * 100) / 100;
}
