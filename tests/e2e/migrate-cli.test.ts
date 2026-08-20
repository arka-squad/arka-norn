import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("migrate est dry-run par défaut puis applique avec backup", (context) => {
  const projectRoot = mkdtempSync(join(tmpdir(), "arka-norn-migrate-cli-"));
  context.after(() => rmSync(projectRoot, { recursive: true, force: true }));
  const markerDir = resolve(projectRoot, ".arka-norn");
  mkdirSync(markerDir);
  const fixture = JSON.parse(readFileSync(resolve(ROOT, "tests", "fixtures", "formats", "project-marker-v1.json"), "utf8")) as Record<string, unknown>;
  const legacy = resolve(markerDir, "depot.json");
  writeFileSync(legacy, `${JSON.stringify({ ...fixture, root: projectRoot })}\n`);

  const preview = run(["migrate", "--target", projectRoot, "--json"], projectRoot);
  assert.equal(preview.status, 0, preview.stderr);
  const previewData = (JSON.parse(preview.stdout) as { readonly data: { readonly mode: string; readonly results: readonly { readonly changed: boolean }[] } }).data;
  assert.equal(previewData.mode, "dry-run");
  assert.equal(previewData.results[0]?.changed, true);
  assert.equal(existsSync(resolve(markerDir, "project.json")), false);

  const applied = run(["migrate", "--target", projectRoot, "--apply", "--json"], projectRoot);
  assert.equal(applied.status, 0, applied.stderr);
  assert.equal(existsSync(resolve(markerDir, "project.json")), true);
  assert.equal(existsSync(`${legacy}.v1.bak`), true);
});

test("migrate refuse un répertoire de marker symbolique sans créer de backup externe", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-migrate-symlink-"));
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const target = resolve(sandbox, "target");
  const externalMarkers = resolve(sandbox, "external-markers");
  mkdirSync(target);
  mkdirSync(externalMarkers);
  const fixture = JSON.parse(readFileSync(resolve(ROOT, "tests", "fixtures", "formats", "project-marker-v1.json"), "utf8")) as Record<string, unknown>;
  const legacy = resolve(externalMarkers, "depot.json");
  writeFileSync(legacy, `${JSON.stringify({ ...fixture, root: target })}\n`);
  symlinkSync(externalMarkers, resolve(target, ".arka-norn"), "dir");

  const result = run(["migrate", "--target", target, "--apply", "--json"], target);
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /symbolic-link marker directories are forbidden/);
  assert.equal(existsSync(`${legacy}.v1.bak`), false);
});

function run(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
}
