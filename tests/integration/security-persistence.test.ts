import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { FsProjectIndexStore } from "../../src/adapters/outbound/filesystem/fs-project-index-store.ts";
import { FsProjectStore } from "../../src/adapters/outbound/filesystem/fs-project-store.ts";
import type { Logger } from "../../src/ports/outbound/logger.ts";

const logger: Logger = {
  debug() {}, info() {}, warn() {}, error() {},
  child() { return logger; },
};

test("un marker Project forgé avec une autre racine est refusé", async (context) => {
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

  await assert.rejects(new FsProjectStore().load(actual), (error: unknown) => error instanceof Error && "code" in error && error.code === "PATH_SECURITY");
});

test("les ajouts concurrents d'index ne perdent aucune entrée et gardent 0600", async (context) => {
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
  assert.equal(mode, 0o600);
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
  const backup = JSON.parse(readFileSync(resolve(home, ".arka-norn", "backups", "last-project-index-corruption.json"), "utf8")) as { readonly raw: string };
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
