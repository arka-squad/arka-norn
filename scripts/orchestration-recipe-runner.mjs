#!/usr/bin/env node

/* Copyright 2026 Arka Labs - Licensed under Apache-2.0 */

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, chmod, copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";

const NODE_IMAGE = "node@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a";
const MAX_OUTPUT_BYTES = 256 * 1024;
const MAX_RECIPE_FILES = 100_000;
const MAX_RECIPE_BYTES = 2 * 1024 * 1024 * 1024;
const RECIPE_SCRIPTS = Object.freeze({ test: "test", build: "build", typecheck: "typecheck", lint: "lint" });
const EXCLUDED_DIRECTORIES = new Set([".git", ".arka-norn", "node_modules", "dist", "build", "coverage", ".cache", ".next", ".turbo", "target", "test-results"]);
const SECRET_FILE = /^(?:\.env(?:\..+)?|.*\.(?:pem|key|p12|pfx)|credentials(?:\.json)?|secrets?(?:\.json|\.ya?ml)?)$/iu;

export async function runRecipe(input) {
  const recipe = await resolveNodeRecipe(input.workspace, input.kind);
  if (recipe.status !== "ready") return recipe;
  const runtime = await containerRuntime();
  if (runtime === undefined) return { status: "blocked", code: "SANDBOX_UNAVAILABLE", reason: "Docker or Podman is required; repository code was not executed on the host." };
  const installed = await execute(runtime, ["image", "inspect", NODE_IMAGE], 15_000);
  if (installed.exitCode !== 0) return { status: "blocked", code: "IMAGE_NOT_CONFIRMED", reason: "The pinned Node runtime image is absent. A new capability preview must explicitly authorize its download.", image: NODE_IMAGE };
  const recipeWorkspace = await prepareRecipeWorkspace(input.workspace);
  try {
    const user = typeof process.getuid === "function" && typeof process.getgid === "function" ? [`${process.getuid()}:${process.getgid()}`] : [];
    const args = [
      "run", "--rm", "--network", "none", "--read-only", "--pids-limit", "128", "--memory", "2g", "--cpus", "2",
      "--security-opt", "no-new-privileges", "--cap-drop", "ALL", "--env", "HOME=/tmp", "--env", "CI=1",
      ...(user.length === 0 ? [] : ["--user", user[0]]),
      "--mount", `type=bind,src=${recipeWorkspace},dst=/workspace`,
      "--tmpfs", "/tmp:rw,nosuid,nodev,size=536870912", "--workdir", "/workspace",
      NODE_IMAGE, "npm", "run", recipe.script,
    ];
    const result = await execute(runtime, args, boundedTimeout(input.timeoutMs));
    return {
      status: result.exitCode === 0 ? "pass" : "fail",
      recipe: input.kind,
      script: recipe.script,
      image: NODE_IMAGE,
      runtime: runtime.endsWith("podman") ? "podman" : "docker",
      exitCode: result.exitCode,
      stdout: redact(result.stdout),
      stderr: redact(result.stderr),
      truncated: result.truncated,
    };
  } finally {
    await rm(dirname(recipeWorkspace), { recursive: true, force: true });
  }
}

export async function prepareRecipeWorkspace(workspace) {
  const source = await realpath(workspace);
  const temporaryRoot = await mkdtemp(join(tmpdir(), "arka-norn-recipe-"));
  const target = join(temporaryRoot, "workspace");
  await mkdir(target, { mode: 0o700 });
  const totals = { files: 0, bytes: 0 };
  try {
    await copySafeTree(source, target, "", totals);
    return target;
  } catch (error) {
    await rm(temporaryRoot, { recursive: true, force: true });
    throw error;
  }
}

async function copySafeTree(sourceRoot, targetRoot, relativePath, totals) {
  const sourceDirectory = join(sourceRoot, relativePath);
  for (const entry of await readdir(sourceDirectory, { withFileTypes: true })) {
    const child = relativePath === "" ? entry.name : `${relativePath}/${entry.name}`;
    if ((entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) || (!entry.isDirectory() && SECRET_FILE.test(entry.name) && entry.name !== ".env.example")) continue;
    const source = join(sourceRoot, child);
    const target = join(targetRoot, child);
    const info = await lstat(source);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) continue;
    if (info.isDirectory()) {
      await mkdir(target, { recursive: true, mode: info.mode & 0o777 });
      await copySafeTree(sourceRoot, targetRoot, child, totals);
      continue;
    }
    totals.files += 1;
    totals.bytes += info.size;
    if (totals.files > MAX_RECIPE_FILES || totals.bytes > MAX_RECIPE_BYTES) throw new Error("The recipe workspace exceeds its safe copy limits.");
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target, constants.COPYFILE_EXCL);
    await chmod(target, info.mode & 0o777);
  }
}

export async function resolveNodeRecipe(workspace, kind) {
  if (!(kind in RECIPE_SCRIPTS)) return { status: "blocked", code: "RECIPE_UNKNOWN", reason: "The requested recipe is not in the arka.norn catalog." };
  const manifestPath = join(await realpath(workspace), "package.json");
  let info;
  try { info = await lstat(manifestPath); } catch { return { status: "blocked", code: "MANIFEST_MISSING", reason: "No Node package manifest is available for this recipe." }; }
  if (!info.isFile() || info.isSymbolicLink() || info.size > 1024 * 1024) return { status: "blocked", code: "MANIFEST_UNSAFE", reason: "The Node package manifest is not a bounded regular file." };
  let manifest;
  try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); } catch { return { status: "blocked", code: "MANIFEST_INVALID", reason: "The Node package manifest is invalid." }; }
  const script = RECIPE_SCRIPTS[kind];
  if (typeof manifest?.scripts?.[script] !== "string" || manifest.scripts[script].trim() === "") return { status: "blocked", code: "RECIPE_UNAVAILABLE", reason: `The package does not declare the ${script} script.` };
  return { status: "ready", script };
}

async function containerRuntime() {
  const names = process.platform === "win32" ? ["docker.exe", "podman.exe"] : ["docker", "podman"];
  for (const directory of (process.env.PATH ?? "").split(delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidate = resolve(directory, name);
      try { await access(candidate, constants.X_OK); return await realpath(candidate); } catch { /* try the next controlled candidate */ }
    }
  }
  return undefined;
}

function boundedTimeout(value) { return Number.isSafeInteger(value) && value >= 1_000 && value <= 600_000 ? value : 300_000; }

async function execute(command, args, timeoutMs) {
  return await new Promise((finish) => {
    const child = spawn(command, args, { shell: false, stdio: ["ignore", "pipe", "pipe"], env: safeEnvironment(), windowsHide: true });
    let stdout = Buffer.alloc(0); let stderr = Buffer.alloc(0); let truncated = false; let settled = false;
    const append = (current, chunk) => {
      if (current.length >= MAX_OUTPUT_BYTES) { truncated = true; return current; }
      const remaining = MAX_OUTPUT_BYTES - current.length;
      if (chunk.length > remaining) truncated = true;
      return Buffer.concat([current, chunk.subarray(0, remaining)]);
    };
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    const done = (exitCode) => { if (settled) return; settled = true; clearTimeout(timer); finish({ exitCode, stdout: stdout.toString("utf8"), stderr: stderr.toString("utf8"), truncated }); };
    child.once("error", () => done(null));
    child.once("close", (code) => done(code));
    const timer = setTimeout(() => { child.kill("SIGKILL"); done(null); }, timeoutMs);
  });
}

function safeEnvironment() {
  return Object.fromEntries(["PATH", "LANG", "LC_ALL", "LC_CTYPE", "TERM", "NO_COLOR", "TZ", "SystemRoot", "SYSTEMROOT"]
    .map((name) => [name, process.env[name]]).filter((entry) => entry[1] !== undefined));
}

function redact(value) {
  return value.replace(/\b(?:sk|ghp|github_pat|xox[baprs]|npm)_[A-Za-z0-9_-]{8,}\b/gu, "[REDACTED]")
    .replace(/(password|token|secret|api[_-]?key)\s*[:=]\s*\S+/giu, "$1=[REDACTED]");
}
