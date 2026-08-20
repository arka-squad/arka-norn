import assert from "node:assert/strict";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const npmCli = process.env["npm_execpath"];
if (npmCli === undefined) throw new Error("npm_execpath absent : exécuter la suite via npm test");
const NPM_CLI: string = npmCli;

test("un consumer vierge installe le tarball sans node_modules du worktree", (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "arka-norn-package-"));
  const consumer = resolve(sandbox, "consumer");
  const staging = resolve(sandbox, "staging");
  mkdirSync(consumer);
  mkdirSync(staging);
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const isolatedEnvironment = {
    ...process.env,
    npm_config_cache: resolve(sandbox, "npm-cache"),
    npm_config_ignore_scripts: "true",
  };
  for (const entry of [
    "bin", "dist", "docs", "examples", "schemas", "skills-src", "scripts", "pipelines",
    "README.md", "CHANGELOG.md", "LICENSE", "SECURITY.md", "manifest.json", "pipeline.json",
  ]) {
    cpSync(resolve(ROOT, entry), resolve(staging, entry), { recursive: true });
  }
  const stagingManifest = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  } & Record<string, unknown>;
  delete stagingManifest.scripts["prepare"];
  delete stagingManifest.scripts["prepack"];
  writeFileSync(resolve(staging, "package.json"), `${JSON.stringify(stagingManifest, null, 2)}\n`);

  const packed = runNpm(["pack", "--ignore-scripts", "--json", "--pack-destination", sandbox], {
    cwd: staging,
    encoding: "utf8",
    env: isolatedEnvironment,
  });
  assert.equal(packed.status, 0, `${packed.stdout}\n${packed.stderr}`);
  const metadata = JSON.parse(packed.stdout) as readonly { readonly filename: string; readonly files: readonly { readonly path: string }[] }[];
  const artifact = resolve(sandbox, metadata[0]!.filename);
  const packagedPaths = metadata[0]!.files.map((file) => file.path);
  assert.ok(packagedPaths.includes("dist/composition/pipeline-runtime.js"));
  assert.ok(packagedPaths.includes("dist/adapters/inbound/cli/main-cli.js"));
  assert.ok(packagedPaths.includes("skills-src/catalog/skills.json"));
  assert.ok(packagedPaths.includes("skills-src/arka-norn.json"));
  assert.ok(packagedPaths.includes("skills-src/arka-fastdev.json"));
  assert.ok(packagedPaths.includes("pipelines/arka-norn-fastdev.json"));
  assert.equal(packagedPaths.some((file) => file.startsWith("tests/") || file.startsWith(".input/") || file.startsWith("src/")), false);

  const productionTree = runNpm(["ls", "--omit=dev", "--all", "--parseable"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(productionTree.status, 0, productionTree.stderr);
  const dependencyArtifacts = productionTree.stdout.trim().split(/\r?\n/).slice(1).map((packageDirectory) => {
    const dependencyPack = runNpm(["pack", packageDirectory, "--ignore-scripts", "--json", "--pack-destination", sandbox], {
      cwd: ROOT,
      encoding: "utf8",
      env: isolatedEnvironment,
    });
    assert.equal(dependencyPack.status, 0, `${dependencyPack.stdout}\n${dependencyPack.stderr}`);
    const dependencyMetadata = JSON.parse(dependencyPack.stdout) as readonly { readonly filename: string }[];
    return resolve(sandbox, dependencyMetadata[0]!.filename);
  });

  const initialized = runNpm(["init", "--yes"], { cwd: consumer, encoding: "utf8", env: isolatedEnvironment });
  assert.equal(initialized.status, 0, initialized.stderr);
  const installed = runNpm(["install", "--ignore-scripts", "--offline", "--no-audit", "--no-fund", ...dependencyArtifacts, artifact], {
    cwd: consumer,
    encoding: "utf8",
    env: isolatedEnvironment,
  });
  assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);

  const packageRoot = resolve(consumer, "node_modules", "arka-norn");
  assert.equal(existsSync(resolve(packageRoot, "dist", "composition", "pipeline-runtime.js")), true);
  assert.equal(existsSync(resolve(packageRoot, "src")), false);
  assert.doesNotMatch(readFileSync(resolve(packageRoot, "skills-src", "arka-framework-dev.json"), "utf8"), /\/Users\//);

  const command = resolve(packageRoot, "bin", "arka-norn.mjs");
  const help = spawnSync(process.execPath, [command, "help"], { cwd: consumer, encoding: "utf8" });
  assert.equal(help.status, 0, `${help.stdout}\n${help.stderr}`);
  assert.match(help.stdout, /project <list\|add\|import/);
  const skills = spawnSync(process.execPath, [command, "skills", "list", "--json"], { cwd: consumer, encoding: "utf8" });
  assert.equal(skills.status, 0, `${skills.stdout}\n${skills.stderr}`);
  assert.equal((JSON.parse(skills.stdout) as { readonly data: readonly unknown[] }).data.length, 17);
  const selftest = spawnSync(process.execPath, [command, "selftest"], { cwd: consumer, encoding: "utf8" });
  assert.equal(selftest.status, 0, `${selftest.stdout}\n${selftest.stderr}`);
  assert.match(selftest.stdout, /Toutes les vérifications réelles passent/);
});

function runNpm(args: readonly string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [NPM_CLI, ...args], options);
}
