import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsOrchestrationWorkerStateStore, workerStatePath } from "../../src/adapters/outbound/filesystem/fs-orchestration-worker-state-store.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";

test("l'état worker reste privé sous ARKA_NORN_HOME et ne sert pas à signaler un PID", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-worker-state-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const projectId = ProjectId.of("project");
  const store = new FsOrchestrationWorkerStateStore(home);
  const path = workerStatePath(home, projectId, "execution-one");

  assert.equal(await store.load(projectId, "execution-one"), undefined);
  const started = await store.start({ projectId, executionId: "execution-one", pid: 1234, at: new Date("2026-08-20T10:00:00.000Z") });
  assert.equal(started.pid, 1234);
  assert.equal(path, resolve(home, ".arka-norn", "workers", "project", "execution-one.json"));
  assert.equal(existsSync(path), true);

  const touched = await store.touch({ projectId, executionId: "execution-one", pid: 1234, at: new Date("2026-08-20T10:01:00.000Z") });
  assert.equal(touched.updatedAt.toISOString(), "2026-08-20T10:01:00.000Z");
  await assert.rejects(store.touch({ projectId, executionId: "execution-one", pid: 4321, at: new Date("2026-08-20T10:02:00.000Z") }), /PID mismatch/);

  await store.clear(projectId, "execution-one");
  assert.equal(await store.load(projectId, "execution-one"), undefined);
});

test("l'état worker refuse des identifiants qui pourraient sortir de son répertoire privé", () => {
  assert.throws(() => workerStatePath("/tmp/home", ProjectId.of("project"), "../outside"), /execution id/);
});
