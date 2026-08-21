import assert from "node:assert/strict";
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsExecutionRegistryStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-execution-registry-store.ts";
import { FsOrchestrationPolicyStore } from "../../src/adapters/outbound/filesystem/fs-orchestration-policy-store.ts";
import { ExecutionPolicy } from "../../src/domain/orchestration/execution-policy.ts";
import { ExecutionRecord } from "../../src/domain/orchestration/execution-record.ts";
import { MissionOrder } from "../../src/domain/orchestration/mission-order.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

const at = new Date("2026-08-20T10:00:00.000Z");

test("la politique séparée est atomique, sans secrets, et une lecture absente ne crée aucun fichier", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-orchestration-policy-"));
  const project = createProject(sandbox);
  const policyPath = resolve(project.root, ".arka-norn", "orchestration.json");
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const store = new FsOrchestrationPolicyStore();

  assert.equal(await store.load(project), undefined);
  assert.equal(fileExists(policyPath), false);

  const policy = ExecutionPolicy.defaultFor(project.id, at);
  await store.save(project, policy);
  const raw = JSON.parse(readFileSync(policyPath, "utf8")) as Record<string, unknown>;
  assert.equal(raw["schemaVersion"], 1);
  assert.equal(raw["projectId"], "project");
  assert.equal("secret" in raw, false);
  if (process.platform !== "win32") assert.equal(lstatSync(policyPath).mode & 0o777, 0o600);

  const before = readFileSync(policyPath, "utf8");
  writeFileSync(policyPath, `${JSON.stringify({ ...raw, token: "not-allowed" })}\n`, { mode: 0o600 });
  const corrupted = readFileSync(policyPath, "utf8");
  await assert.rejects(store.load(project), (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_EXECUTION_POLICY");
  assert.equal(readFileSync(policyPath, "utf8"), corrupted);
  assert.notEqual(before, readFileSync(policyPath, "utf8"));
});

test("le registre exécution sérialise les mises à jour concurrentes et rejette une fuite de secret", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-orchestration-registry-"));
  const project = createProject(sandbox);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const store = new FsExecutionRegistryStore();
  const path = resolve(project.root, ".arka-norn", "executions.json");

  assert.equal((await store.load(project)).executions.length, 0);
  assert.equal(fileExists(path), false);
  await Promise.all(Array.from({ length: 12 }, (_, index) => store.update(project, (registry) =>
    registry.add(ExecutionRecord.planned(`execution-${index}`, createOrder(index), index % 2 === 0 ? "codex" : "claude", at), at),
  )));

  const registry = await store.load(project);
  assert.equal(registry.executions.length, 12);
  assert.equal(new Set(registry.executions.map((record) => record.id)).size, 12);
  if (process.platform !== "win32") assert.equal(lstatSync(path).mode & 0o777, 0o600);

  const raw = JSON.parse(readFileSync(path, "utf8")) as { readonly executions: Array<{ readonly order: { summary: string } }> };
  raw.executions[0]!.order.summary = "api_key=forbidden";
  writeFileSync(path, `${JSON.stringify(raw)}\n`, { mode: 0o600 });
  await assert.rejects(store.load(project), (error: unknown) => error instanceof Error && "code" in error && error.code === "INVALID_EXECUTION_REGISTRY");
  assert.match(readFileSync(path, "utf8"), /api_key=forbidden/);
});

function createProject(sandbox: string): Project {
  const root = resolve(sandbox, "project");
  mkdirSync(root, { recursive: true });
  return Project.create({
    id: ProjectId.of("project"),
    name: "Project",
    root,
    schemaVersion: 4,
    orchestrationMode: "automatic",
    createdAt: at,
    updatedAt: at,
  });
}

function createOrder(index: number): MissionOrder {
  return MissionOrder.create({
    id: `mission-${index}`,
    scope: { projectId: ProjectId.of("project"), featureId: FeatureId.of("feature"), paths: ["src"] },
    preconditions: { pipelineId: "standard", nextStepId: "concept" },
    requiredCapabilities: ["inspect_workspace"],
    requiredPermissions: ["read_workspace"],
    summary: `Prepare Concept ${index}.`,
    issuedAt: at,
  });
}

function fileExists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
    throw error;
  }
}
