import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { createDoctorRuntime } from "../../src/composition/doctor-runtime.ts";

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
