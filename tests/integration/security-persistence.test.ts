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
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { realpath } from "node:fs/promises";
import { platform, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsProjectIndexStore } from "../../src/adapters/outbound/filesystem/fs-project-index-store.ts";
import { FsProjectStore } from "../../src/adapters/outbound/filesystem/fs-project-store.ts";
import type { Logger } from "../../src/ports/outbound/logger.ts";

const logger: Logger = {
  debug() {}, info() {}, warn() {}, error() {},
  child() { return logger; },
};

test("une racine v2 forgée n'est jamais utilisée comme racine runtime", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-forged-marker-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const actual = resolve(sandbox, "actual");
  const forged = resolve(sandbox, "forged");
  mkdirSync(resolve(actual, ".arka-norn"), { recursive: true });
  mkdirSync(forged);
  writeFileSync(resolve(actual, ".arka-norn", "project.json"), `${JSON.stringify({
    schemaVersion: 2, id: "forged", name: "Forged", root: forged,
    createdAt: "2026-08-19T10:00:00.000Z", updatedAt: "2026-08-19T10:00:00.000Z",
  })}\n`);

  const store = new FsProjectStore();
  const project = await store.load(actual);
  assert.equal(project.root, await realpath(actual));
  assert.notEqual(project.root, await realpath(forged));
  await store.save(project);
  const portable = JSON.parse(readFileSync(resolve(actual, ".arka-norn", "project.json"), "utf8")) as Record<string, unknown>;
  assert.equal(portable.schemaVersion, 4);
  assert.equal("root" in portable, false);
});

test("les ajouts concurrents d'index ne perdent aucune entrée et gardent 0600 sur POSIX", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-index-race-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const stores = Array.from({ length: 20 }, () => new FsProjectIndexStore({ homeDir: home, logger }));

  await Promise.all(stores.map((store, index) => store.add({
    id: `project-${index}`,
    root: resolve(home, `project-${index}`),
    name: `Project ${index}`,
    updatedAt: new Date(1_700_000_000_000 + index),
  })));

  const entries = await stores[0]!.load();
  assert.equal(entries.length, 20);
  assert.equal(new Set(entries.map((entry) => entry.id)).size, 20);
  const mode = statSync(resolve(home, ".arka-norn", "index", "projects.json")).mode & 0o777;
  if (platform() !== "win32") assert.equal(mode, 0o600);
});

test("un index corrompu est isolé avant retour à un cache vide", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-index-corrupt-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const indexDir = resolve(home, ".arka-norn", "index");
  mkdirSync(indexDir, { recursive: true });
  const indexPath = resolve(indexDir, "projects.json");
  writeFileSync(indexPath, "{broken", { mode: 0o666 });
  chmodSync(indexPath, 0o600);

  const entries = await new FsProjectIndexStore({ homeDir: home, logger }).load();
  assert.deepEqual(entries, []);
  const backupNames = readdirSync(resolve(home, ".arka-norn", "backups"));
  assert.equal(backupNames.length, 1);
  assert.match(backupNames[0] ?? "", /^project-index-\d+-[0-9a-f-]+-corruption\.json$/);
  const backup = JSON.parse(readFileSync(resolve(home, ".arka-norn", "backups", backupNames[0]!), "utf8")) as { readonly raw: string };
  assert.equal(backup.raw, "{broken");
});

test("la contention explicite retourne LOCK_CONFLICT", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-lock-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const indexDir = resolve(home, ".arka-norn", "index");
  mkdirSync(indexDir, { recursive: true });
  const indexPath = resolve(indexDir, "projects.json");
  writeFileSync(`${indexPath}.lock`, "held", { mode: 0o600 });
  const { withFileLock } = await import("../../src/adapters/outbound/filesystem/_shared/file-lock.ts");

  await assert.rejects(
    withFileLock(indexPath, async () => undefined, { timeoutMs: 30, pollMs: 5, staleMs: 60_000 }),
    (error: unknown) => error instanceof Error && "code" in error && error.code === "LOCK_CONFLICT",
  );
});

test("un lock vivant devenu ancien conserve l'exclusion mutuelle", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-lock-owner-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const target = resolve(home, "shared.json");
  const { withFileLock } = await import("../../src/adapters/outbound/filesystem/_shared/file-lock.ts");
  let active = 0;
  let maximumActive = 0;
  const operation = async (duration: number): Promise<void> => {
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, duration));
    active -= 1;
  };

  const lockOptions = { staleMs: 5, timeoutMs: 5_000, pollMs: 2 } as const;
  const first = withFileLock(target, () => operation(60), lockOptions);
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 15));
  const second = withFileLock(target, () => operation(30), lockOptions);
  const third = withFileLock(target, () => operation(10), lockOptions);
  await Promise.all([first, second, third]);

  assert.equal(maximumActive, 1);
});

test("un lock stale dont le processus est mort est récupéré", async (context) => {
  const home = mkdtempSync(join(tmpdir(), "arka-norn-lock-dead-"));
  context.after(() => rmSync(home, { recursive: true, force: true }));
  const target = resolve(home, "shared.json");
  const lockPath = `${target}.lock`;
  writeFileSync(lockPath, `${JSON.stringify({ token: "dead-owner", pid: 2_147_483_647, createdAt: "2020-01-01T00:00:00.000Z" })}\n`, { mode: 0o600 });
  utimesSync(lockPath, new Date(0), new Date(0));
  const { withFileLock } = await import("../../src/adapters/outbound/filesystem/_shared/file-lock.ts");
  let entered = false;

  await withFileLock(target, async () => { entered = true; }, { staleMs: 1, timeoutMs: 500, pollMs: 2 });

  assert.equal(entered, true);
});
