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
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const LOCAL_NPM_REGISTRY = resolve(import.meta.dirname, "..", "helpers", "local-npm-registry.mjs");

interface LocalNpmPackage {
  readonly artifact: string;
  readonly integrity: string;
  readonly manifest: Record<string, unknown>;
}

interface LocalNpmRegistry {
  readonly url: string;
  stop(): Promise<void>;
}

test("un consumer vierge installe le tarball sans node_modules du worktree", async (context) => {
  const sandbox = mkdtempSync(resolve(tmpdir(), "arka-norn-package-"));
  const consumer = resolve(sandbox, "consumer");
  const staging = resolve(sandbox, "staging");
  mkdirSync(consumer);
  mkdirSync(staging);
  const cleanup: { registry?: LocalNpmRegistry } = {};
  context.after(async () => {
    await cleanup.registry?.stop();
    rmSync(sandbox, { recursive: true, force: true });
  });
  const isolatedEnvironment: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_cache: resolve(sandbox, "npm-cache"),
    npm_config_ignore_scripts: "true",
  };
  delete isolatedEnvironment["npm_execpath"];
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
  assert.ok(packagedPaths.includes("skills-src/arka-essentiel.json"));
  assert.ok(packagedPaths.includes("pipelines/arka-norn-fastdev.json"));
  assert.ok(packagedPaths.includes("pipelines/arka-norn-essentiel.json"));
  assert.ok(packagedPaths.includes("schemas/cadrage-essentiel.schema.json"));
  assert.ok(packagedPaths.includes("docs/essentiel.md"));
  assert.ok(packagedPaths.includes("docs/guide-developpeur.md"));
  assert.ok(packagedPaths.includes("docs/manuel-utilisateur.md"));
  assert.equal(packagedPaths.some((file) => file.startsWith("tests/") || file.startsWith(".input/") || file.startsWith("src/")), false);

  const productionTree = runNpm(["ls", "--omit=dev", "--all", "--parseable"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(productionTree.status, 0, productionTree.stderr);
  const dependencyArtifacts = productionTree.stdout.trim().split(/\r?\n/).slice(1).map((packageDirectory, index) => {
    const packageForPacking = stageDependencyWithoutLifecycleScripts(packageDirectory, resolve(sandbox, "dependencies", String(index)));
    const dependencyPack = runNpm(["pack", packageForPacking, "--ignore-scripts", "--json", "--pack-destination", sandbox], {
      cwd: ROOT,
      encoding: "utf8",
      env: isolatedEnvironment,
    });
    assert.equal(dependencyPack.status, 0, `${dependencyPack.stdout}\n${dependencyPack.stderr}`);
    const dependencyMetadata = JSON.parse(dependencyPack.stdout) as readonly {
      readonly filename: string;
      readonly integrity: string;
      readonly name: string;
      readonly version: string;
    }[];
    const metadata = dependencyMetadata[0]!;
    return {
      artifact: resolve(sandbox, metadata.filename),
      integrity: metadata.integrity,
      manifest: JSON.parse(readFileSync(resolve(packageForPacking, "package.json"), "utf8")) as Record<string, unknown>,
    };
  });

  const initialized = runNpm(["init", "--yes"], { cwd: consumer, encoding: "utf8", env: isolatedEnvironment });
  assert.equal(initialized.status, 0, initialized.stderr);
  const registry = await startLocalNpmRegistry(sandbox, dependencyArtifacts);
  cleanup.registry = registry;
  const consumerManifestPath = resolve(consumer, "package.json");
  const consumerManifest = JSON.parse(readFileSync(consumerManifestPath, "utf8")) as Record<string, unknown>;
  consumerManifest["dependencies"] = { "arka-norn": `file:${artifact}` };
  writeFileSync(consumerManifestPath, `${JSON.stringify(consumerManifest, null, 2)}\n`);
  const installed = runNpm(["install", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: consumer,
    encoding: "utf8",
    env: { ...isolatedEnvironment, npm_config_registry: registry.url },
  });
  assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);

  const packageRoot = resolve(consumer, "node_modules", "arka-norn");
  assert.equal(existsSync(resolve(packageRoot, "dist", "composition", "pipeline-runtime.js")), true);
  assert.equal(existsSync(resolve(packageRoot, "docs", "guide-developpeur.md")), true);
  assert.equal(existsSync(resolve(packageRoot, "docs", "manuel-utilisateur.md")), true);
  assert.equal(existsSync(resolve(packageRoot, "src")), false);
  assert.doesNotMatch(readFileSync(resolve(packageRoot, "skills-src", "arka-framework-dev.json"), "utf8"), /\/Users\//);

  const command = resolve(packageRoot, "bin", "arka-norn.mjs");
  const help = spawnSync(process.execPath, [command, "help"], { cwd: consumer, encoding: "utf8" });
  assert.equal(help.status, 0, `${help.stdout}\n${help.stderr}`);
  assert.match(help.stdout, /project <list\|add\|import/);
  const skills = spawnSync(process.execPath, [command, "skills", "list", "--json"], { cwd: consumer, encoding: "utf8" });
  assert.equal(skills.status, 0, `${skills.stdout}\n${skills.stderr}`);
  const packagedSkillCount = readdirSync(resolve(packageRoot, "skills-src")).filter((file) => file.endsWith(".json")).length;
  assert.equal((JSON.parse(skills.stdout) as { readonly data: readonly unknown[] }).data.length, packagedSkillCount);
  const selftest = spawnSync(process.execPath, [command, "selftest"], { cwd: consumer, encoding: "utf8" });
  assert.equal(selftest.status, 0, `${selftest.stdout}\n${selftest.stderr}`);
  assert.match(selftest.stdout, /Toutes les vérifications réelles passent/);
});

async function startLocalNpmRegistry(sandbox: string, dependencies: readonly LocalNpmPackage[]): Promise<LocalNpmRegistry> {
  const artifacts: Record<string, string> = {};
  const packages: Record<string, {
    latest: string;
    versions: Record<string, { artifactId: string; integrity: string; manifest: Record<string, unknown> }>;
  }> = {};
  for (const [index, dependency] of dependencies.entries()) {
    const name = dependency.manifest["name"];
    const version = dependency.manifest["version"];
    if (typeof name !== "string" || typeof version !== "string") throw new Error("Dépendance packagée sans identité npm exploitable.");
    const artifactId = String(index);
    artifacts[artifactId] = dependency.artifact;
    const current = packages[name] ?? { latest: version, versions: {} };
    current.latest = version.localeCompare(current.latest, undefined, { numeric: true }) > 0 ? version : current.latest;
    current.versions[version] = { artifactId, integrity: dependency.integrity, manifest: dependency.manifest };
    packages[name] = current;
  }
  const configurationPath = resolve(sandbox, "local-npm-registry.json");
  writeFileSync(configurationPath, `${JSON.stringify({ artifacts, packages })}\n`);
  const child = spawn(process.execPath, [LOCAL_NPM_REGISTRY, configurationPath], { stdio: "pipe" });
  const url = await waitForRegistryStart(child);
  return { url, stop: () => stopRegistry(child) };
}

function waitForRegistryStart(child: ChildProcessWithoutNullStreams): Promise<string> {
  return new Promise((resolveUrl, reject) => {
    let output = "";
    let errorOutput = "";
    let settled = false;
    const timeout = setTimeout(() => finish(new Error(`Démarrage du registre npm local expiré : ${errorOutput}`)), 10_000);
    const finish = (error: Error | undefined, url?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (error !== undefined) {
        child.kill("SIGTERM");
        reject(error);
        return;
      }
      resolveUrl(url!);
    };
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      const newline = output.indexOf("\n");
      if (newline < 0) return;
      try {
        const payload = JSON.parse(output.slice(0, newline)) as { readonly url?: unknown };
        if (typeof payload.url !== "string") throw new Error("URL absente dans la réponse du registre npm local.");
        finish(undefined, payload.url);
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      errorOutput += chunk.toString("utf8");
    });
    child.once("error", (error) => finish(error));
    child.once("exit", (code) => {
      if (!settled) finish(new Error(`Le registre npm local s'est arrêté prématurément (${code ?? "signal"}) : ${errorOutput}`));
    });
  });
}

function stopRegistry(child: ChildProcessWithoutNullStreams): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolveStop) => {
    const timeout = setTimeout(() => child.kill("SIGKILL"), 3_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolveStop();
    });
    child.kill("SIGTERM");
  });
}

function stageDependencyWithoutLifecycleScripts(packageDirectory: string, destination: string): string {
  cpSync(packageDirectory, destination, { recursive: true });
  const manifestPath = resolve(destination, "package.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<string, unknown>;
  const scripts = manifest["scripts"];
  if (scripts !== null && typeof scripts === "object" && !Array.isArray(scripts)) {
    const safeScripts = { ...(scripts as Record<string, unknown>) };
    for (const lifecycle of ["prepare", "prepack", "postpack", "prepublish", "prepublishOnly"]) delete safeScripts[lifecycle];
    manifest["scripts"] = safeScripts;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return destination;
}

function runNpm(args: readonly string[], options: SpawnSyncOptionsWithStringEncoding): SpawnSyncReturns<string> {
  const npmCli = options.env === undefined ? process.env["npm_execpath"] : options.env["npm_execpath"];
  if (npmCli !== undefined && npmCli.length > 0) return spawnSync(process.execPath, [npmCli, ...args], options);
  return spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    ...options,
    ...(process.platform === "win32" ? { shell: true } : {}),
  });
}
