import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const NPM = process.platform === "win32" ? "npm.cmd" : "npm";

test("le package extrait dans un dossier propre expose la CLI", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-package-"));
  const consumer = resolve(sandbox, "consumer");
  const extracted = resolve(sandbox, "extracted");
  const staging = resolve(sandbox, "staging");
  mkdirSync(consumer);
  mkdirSync(extracted);
  mkdirSync(staging);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  for (const entry of [
    "bin", "docs", "examples", "schemas", "scripts", "skills-src", "src",
    "README.md", "manifest.json", "package-lock.json", "package.json", "pipeline.json",
    "tsconfig.json", "tsconfig.tests.json",
  ]) {
    cpSync(resolve(ROOT, entry), resolve(staging, entry), { recursive: true });
  }
  symlinkSync(resolve(ROOT, "node_modules"), resolve(staging, "node_modules"), process.platform === "win32" ? "junction" : "dir");

  const isolatedEnvironment = {
    ...process.env,
    npm_config_cache: resolve(sandbox, "npm-cache"),
    npm_config_ignore_scripts: "true",
  };
  const packed = spawnSync(NPM, ["pack", "--ignore-scripts", "--json", "--pack-destination", sandbox], {
    cwd: staging,
    encoding: "utf8",
    env: isolatedEnvironment,
  });
  assert.equal(packed.status, 0, `${packed.stdout}\n${packed.stderr}`);
  const metadata = JSON.parse(packed.stdout) as readonly { readonly filename: string; readonly files: readonly { readonly path: string }[] }[];
  const artifact = resolve(sandbox, metadata[0]!.filename);
  const packagedPaths = metadata[0]!.files.map((file) => file.path);
  assert.ok(packagedPaths.includes("dist/composition/pipeline-runtime.js"));
  assert.ok(packagedPaths.includes("skills-src/catalog/skills.json"));
  assert.equal(packagedPaths.some((file) => file.startsWith("tests/") || file.startsWith(".input/") || file.startsWith("src/")), false);

  const unpacked = spawnSync("tar", ["-xzf", artifact, "-C", extracted], { encoding: "utf8" });
  assert.equal(unpacked.status, 0, `${unpacked.stdout}\n${unpacked.stderr}`);
  const packageRoot = resolve(extracted, "package");
  assert.equal(existsSync(resolve(packageRoot, "dist", "composition", "pipeline-runtime.js")), true);
  assert.equal(existsSync(resolve(packageRoot, "src")), false);
  assert.doesNotMatch(readFileSync(resolve(packageRoot, "skills-src", "arka-framework-dev.json"), "utf8"), /\/Users\//);

  symlinkSync(resolve(ROOT, "node_modules"), resolve(packageRoot, "node_modules"), process.platform === "win32" ? "junction" : "dir");
  const help = spawnSync(process.execPath, [resolve(packageRoot, "bin", "arka-norn.mjs"), "help"], {
    cwd: consumer,
    encoding: "utf8",
  });
  assert.equal(help.status, 0, `${help.stdout}\n${help.stderr}`);
  assert.match(help.stdout, /project <list\|add\|import/);
});
