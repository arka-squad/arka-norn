import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createDoctorRuntime } from "../../src/composition/doctor-runtime.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

test("doctor planifie puis applique une récupération avec backup", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-doctor-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const indexDir = resolve(home, ".arka-norn", "index");
  mkdirSync(indexDir, { recursive: true });
  const projectIndex = resolve(indexDir, "projects.json");
  writeFileSync(projectIndex, "{corrupt");

  const runtime = createDoctorRuntime(home);
  const inspection = await runtime.run();
  assert.equal(inspection.ok, false);
  assert.equal(inspection.repairs.length, 0);

  const dryRun = await runtime.run({ repair: true });
  assert.equal(dryRun.mode, "repair-dry-run");
  assert.equal(dryRun.repairs[0]?.applied, false);
  assert.equal(readFileSync(projectIndex, "utf8"), "{corrupt");

  const applied = await runtime.run({ repair: true, apply: true });
  assert.equal(applied.ok, true);
  assert.equal(applied.repairs[0]?.applied, true);
  assert.deepEqual(JSON.parse(readFileSync(projectIndex, "utf8")), { schemaVersion: 2, entries: [] });
  const backups = readdirSync(resolve(home, ".arka-norn", "backups"));
  assert.equal(backups.length, 1);
  assert.equal(existsSync(resolve(home, ".arka-norn", "backups", backups[0]!)), true);
});

test("doctor refuse les entrées d'index incomplètes comme les stores", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-doctor-schema-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const indexDir = resolve(home, ".arka-norn", "index");
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(resolve(indexDir, "projects.json"), `${JSON.stringify({ schemaVersion: 2, entries: [{}] })}\n`, { mode: 0o600 });

  const report = await createDoctorRuntime(home).run();
  const projects = report.checks.find((check) => check.id === "index.projects");

  assert.equal(projects?.status, "fail");
  assert.match(projects?.message ?? "", /schema invalid/);
});

test("doctor expose les markers cassés, les locks abandonnés, l'audit et les skills", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-doctor-health-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const indexDir = resolve(home, ".arka-norn", "index");
  mkdirSync(indexDir, { recursive: true });
  writeFileSync(resolve(indexDir, "projects.json"), `${JSON.stringify({
    schemaVersion: 2,
    entries: [{ id: "missing-project", root: resolve(home, "missing-project"), name: "Missing", updatedAt: "2026-08-19T10:00:00.000Z" }],
  })}\n`, { mode: 0o600 });
  const lockPath = resolve(indexDir, "features.json.lock");
  writeFileSync(lockPath, `${JSON.stringify({ token: "dead", pid: 2_147_483_647, createdAt: "2020-01-01T00:00:00.000Z" })}\n`, { mode: 0o600 });
  utimesSync(lockPath, new Date(0), new Date(0));

  const runtime = createDoctorRuntime(home);
  const report = await runtime.run({ repair: true });
  assert.equal(report.checks.find((check) => check.id === "markers.projects")?.status, "fail");
  assert.equal(report.checks.find((check) => check.id === "lock.features.json.lock")?.status, "fail");
  assert.equal(report.checks.find((check) => check.id === "audit.trail")?.status, "pass");
  assert.ok(report.checks.some((check) => check.id === "skills.installation"));
  assert.equal(report.summary.fail, 2);

  const repaired = await runtime.run({ repair: true, apply: true });
  assert.equal(existsSync(lockPath), false);
  assert.ok(repaired.repairs.some((repair) => repair.action === "remove_abandoned_lock" && repair.applied));
  assert.equal(repaired.checks.find((check) => check.id === "markers.projects")?.status, "fail");
});

test("doctor valide les registres Agent puis expose toute corruption", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-doctor-agents-"));
  const projectRoot = resolve(home, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot });
  await management.agents.register({ project, provider: "Codex", role: "audit" });

  const healthy = await createDoctorRuntime(home, projectRoot).run();
  assert.equal(healthy.checks.find((check) => check.id === "agents.registries")?.status, "pass");
  assert.equal(healthy.checks.find((check) => check.id === "agents.session")?.status, "pass");
  assert.equal(healthy.checks.find((check) => check.id === "project.context")?.status, "pass");

  writeFileSync(resolve(projectRoot, ".arka-norn", "agents.json"), "{corrupt");
  writeFileSync(resolve(home, ".arka-norn", "context", "agents.json"), "{}", { mode: 0o600 });
  const corrupted = await createDoctorRuntime(home, home).run();
  assert.equal(corrupted.checks.find((check) => check.id === "agents.registries")?.status, "fail");
  assert.equal(corrupted.checks.find((check) => check.id === "agents.session")?.status, "fail");
});

test("doctor refuse un registre orphelin dans le contexte Project ciblé", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-doctor-orphan-context-"));
  const target = resolve(home, "project");
  mkdirSync(resolve(target, ".arka-norn"), { recursive: true });
  context.after(() => rmSync(home, { recursive: true, force: true }));
  writeFileSync(resolve(target, ".arka-norn", "agents.json"), "{}\n");

  const report = await createDoctorRuntime(home, target).run();
  const projectContext = report.checks.find((check) => check.id === "project.context");

  assert.equal(projectContext?.status, "fail");
  assert.match(projectContext?.message ?? "", /without a Project marker/);
});

test("doctor détecte une sélection Agent inactive sans modifier la session", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-doctor-stale-session-"));
  const projectRoot = resolve(home, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const management = createManagementRuntime({ homeDir: home });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot });
  const agent = await management.agents.register({ project, provider: "Codex", role: "audit" });
  await management.agents.deactivate(project, agent.id);
  const sessionPath = resolve(home, ".arka-norn", "context", "agents.json");
  writeFileSync(sessionPath, `${JSON.stringify({ schemaVersion: 1, selectedByProject: { project: agent.id.value } })}\n`, { mode: 0o600 });
  const before = readFileSync(sessionPath, "utf8");

  const report = await createDoctorRuntime(home, projectRoot).run();

  assert.equal(report.checks.find((check) => check.id === "agents.session")?.status, "fail");
  assert.match(report.checks.find((check) => check.id === "agents.session")?.message ?? "", /inactive/);
  assert.equal(readFileSync(sessionPath, "utf8"), before);
});
