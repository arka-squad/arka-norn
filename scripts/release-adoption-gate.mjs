#!/usr/bin/env node
/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 *
 * F3 release adoption and parity gate. Packs the exact tarball, installs it
 * into a clean prefix, and verifies README, skills, Web, TUI/CLI and
 * migration artifacts from that installed package on a fresh HOME. It never
 * publishes; publication remains a separate, human-gated step.
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const expectedVersion = manifest.version;

const failures = [];
const passes = [];
function check(label, condition, detail = "") {
  if (condition) { passes.push(label); }
  else { failures.push(detail ? `${label} - ${detail}` : label); }
}

const workspace = mkdtempSync(join(tmpdir(), "arka-norn-release-gate-"));
try {
  const tarball = pack();
  const packageDir = extract(tarball);
  linkDependencies(packageDir);
  const installed = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));

  check("package version matches manifest", installed.version === expectedVersion, `${installed.version} != ${expectedVersion}`);
  const bundledManifest = JSON.parse(readFileSync(join(packageDir, "manifest.json"), "utf8"));
  check("bundled manifest version parity", bundledManifest.version === expectedVersion, `${bundledManifest.version} != ${expectedVersion}`);

  const bin = join(packageDir, "bin", "arka-norn.mjs");
  check("packaged bin exists", existsSync(bin));
  if (existsSync(bin)) {
    const cliVersion = run(bin, ["--version"]).trim();
    check("packaged CLI reports the release version", cliVersion.includes(expectedVersion), cliVersion);
    const help = run(bin, ["--help"]);
    for (const surface of ["framing", "orchestration", "web", "doctor", "migrate"]) {
      check(`CLI help advertises ${surface}`, help.includes(surface));
    }
    const home = join(workspace, "home");
    const skills = run(bin, ["skills", "list"], { ARKA_NORN_HOME: home });
    check("packaged skills list resolves on a clean HOME", skills.includes("arka-norn") && skills.includes("core.bootstrap"));
  }

  check("README ships", existsSync(join(packageDir, "README.md")));
  const readme = existsSync(join(packageDir, "README.md")) ? readFileSync(join(packageDir, "README.md"), "utf8") : "";
  check("README keeps the quickstart", readme.includes("npm install -g arka-norn") && readme.includes("arka-norn setup"));
  check("README links the migration guide", readme.includes("docs/migration-2.3.2.md"));
  check("README links the stability contract", readme.includes("docs/stability-2.3.md"));

  check("Web bundle ships", existsSync(join(packageDir, "dist", "web", "index.html")));
  check("Web assets ship", existsSync(join(packageDir, "dist", "web", "assets")) && readdirSync(join(packageDir, "dist", "web", "assets")).length > 0);
  check("migration guide ships", existsSync(join(packageDir, "docs", "migration-2.3.2.md")));
  check("stability contract ships", existsSync(join(packageDir, "docs", "stability-2.3.md")));
  check("skill sources ship", existsSync(join(packageDir, "skills-src")) && readdirSync(join(packageDir, "skills-src")).some((file) => file.startsWith("arka-norn")));

  const links = spawn("node", [join(root, "scripts", "check-package-links.mjs")]);
  check("packaged Markdown links resolve", links.status === 0, links.stderr.trim());
} finally {
  rmSync(workspace, { recursive: true, force: true });
  for (const artifact of readdirSync(root).filter((name) => /^arka-norn-.*\.tgz$/u.test(name))) rmSync(join(root, artifact), { force: true });
}

for (const label of passes) console.error(`  OK   ${label}`);
for (const label of failures) console.error(`  FAIL ${label}`);
console.error(`\nRelease adoption and parity gate: ${passes.length} passed, ${failures.length} failed.`);
process.exitCode = failures.length === 0 ? 0 : 1;

function pack() {
  const output = execFileSync("npm", ["pack", "--ignore-scripts", "--pack-destination", workspace], { cwd: root, encoding: "utf8" });
  const name = output.trim().split(/\r?\n/u).at(-1);
  const tarball = join(workspace, name);
  if (!existsSync(tarball)) throw new Error(`npm pack did not produce ${tarball}`);
  return tarball;
}

function extract(tarball) {
  execFileSync("tar", ["-xzf", tarball, "-C", workspace], { encoding: "utf8" });
  const packageDir = join(workspace, "package");
  if (!existsSync(packageDir)) throw new Error("Tarball did not extract a package directory.");
  return packageDir;
}

function linkDependencies(packageDir) {
  const source = join(root, "node_modules");
  if (!existsSync(source)) throw new Error("Repository node_modules is required to exercise the packaged bin offline.");
  const target = join(packageDir, "node_modules");
  if (!existsSync(target)) symlinkSync(source, target, "dir");
}

function run(bin, args, extraEnv = {}) {
  return execFileSync("node", [bin, ...args], { cwd: workspace, encoding: "utf8", env: { ...process.env, ...extraEnv } });
}

function spawn(command, args) {
  const result = spawnResult(command, args);
  return result;
}

function spawnResult(command, args) {
  try {
    const stdout = execFileSync(command, args, { cwd: root, encoding: "utf8" });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status ?? 1, stdout: error.stdout?.toString() ?? "", stderr: (error.stderr?.toString() ?? "") + (error.message ?? "") };
  }
}
