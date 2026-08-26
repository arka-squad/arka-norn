/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import { createHash } from "node:crypto";
import { createReadStream, type Dirent } from "node:fs";
import * as fs from "node:fs/promises";
import { execFile } from "node:child_process";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";

import type {
  RepositoryInventory, RepositoryProbe, RepositoryProbeReason,
} from "../../../domain/framing/framing-plan.js";
import type { RepositoryProbePort } from "../../../ports/outbound/repository-probe.js";

const execFileAsync = promisify(execFile);
const IGNORED_DIRECTORIES = new Set([
  ".git", ".arka-norn", ".gitnexus", ".cache", ".next", ".turbo", ".codex", ".claude",
  "node_modules", "dist", "build", "coverage", "target", "test-results", "vendor",
]);
const MANIFEST_FILES = new Set([
  "package.json", "Cargo.toml", "go.mod", "pyproject.toml", "requirements.txt", "pom.xml",
  "build.gradle", "build.gradle.kts", "composer.json", "Gemfile", "mix.exs", "deno.json",
]);
const CONSTRAINT_FILES = new Set([
  "tsconfig.json", "eslint.config.js", "eslint.config.mjs", ".eslintrc", ".prettierrc",
  "Dockerfile", "docker-compose.yml", "compose.yml", "Makefile", ".editorconfig",
]);
const SOURCE_EXTENSIONS = new Set([
  ".c", ".cc", ".cpp", ".cs", ".css", ".dart", ".ex", ".exs", ".go", ".html",
  ".java", ".js", ".jsx", ".kt", ".kts", ".lua", ".php", ".py", ".rb", ".rs",
  ".scala", ".scss", ".sh", ".svelte", ".swift", ".ts", ".tsx", ".vue",
]);
const TEST_PATTERN = /(?:^|\/)(?:tests?|__tests__|spec)(?:\/|$)|(?:\.test|\.spec)\.[^.]+$/u;
const MAX_FILES = 250_000;

interface MutableInventory {
  files: number;
  sourceFiles: number;
  testFiles: number;
  manifestFiles: number;
  constraintFiles: number;
  symlinks: number;
  submodules: number;
  truncated: boolean;
}

export class FsRepositoryProbe implements RepositoryProbePort {
  public async inspect(input: {
    readonly projectId: string;
    readonly projectRoot: string;
    readonly scopePaths?: readonly string[];
  }): Promise<RepositoryProbe> {
    const projectRoot = await canonicalDirectory(input.projectRoot);
    const scopes = await resolveScopes(projectRoot, input.scopePaths);
    const inventory: MutableInventory = {
      files: 0, sourceFiles: 0, testFiles: 0, manifestFiles: 0, constraintFiles: 0,
      symlinks: 0, submodules: 0, truncated: false,
    };
    const reasons: RepositoryProbeReason[] = [];
    const ignoredRoots = new Set<string>();
    const fingerprint = createHash("sha256");

    for (const scope of scopes) {
      await this.walk({
        projectRoot, directory: scope, inventory, reasons, ignoredRoots, fingerprint,
      });
      if (inventory.truncated) break;
    }

    const submodules = await countSubmodules(projectRoot, reasons);
    inventory.submodules = submodules;
    const gitCommit = await readGitCommit(projectRoot, reasons);
    const nature = classify(inventory, reasons);
    reasons.push({ code: `repository_${nature}`, evidenceRef: inventoryReference(inventory) });

    const frozenInventory = freezeInventory(inventory, [...ignoredRoots].sort());
    return {
      schemaVersion: 1,
      projectId: input.projectId,
      projectRoot,
      scopePaths: scopes.map((scope) => relative(projectRoot, scope) || "."),
      nature,
      snapshot: {
        gitCommit,
        workspaceFingerprint: fingerprint.update(JSON.stringify(inventory)).digest("hex"),
      },
      inventory: frozenInventory,
      inventoryFingerprint: createHash("sha256").update(JSON.stringify(frozenInventory)).digest("hex"),
      reasons,
      observedAt: new Date().toISOString(),
    };
  }

  private async walk(input: {
    readonly projectRoot: string;
    readonly directory: string;
    readonly inventory: MutableInventory;
    readonly reasons: RepositoryProbeReason[];
    readonly ignoredRoots: Set<string>;
    readonly fingerprint: ReturnType<typeof createHash>;
  }): Promise<void> {
    let entries: Dirent[];
    try {
      entries = await fs.readdir(input.directory, { withFileTypes: true });
    } catch (error) {
      input.reasons.push({ code: "repository_access_error", evidenceRef: safeError(error, input.directory) });
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (input.inventory.files >= MAX_FILES) {
        input.inventory.truncated = true;
        input.reasons.push({ code: "inventory_truncated", evidenceRef: `file_limit:${MAX_FILES}` });
        return;
      }
      const absolutePath = join(input.directory, entry.name);
      const repositoryPath = normalizePath(relative(input.projectRoot, absolutePath));
      if (entry.isSymbolicLink()) {
        input.inventory.symlinks += 1;
        input.reasons.push({ code: "symbolic_link_detected", evidenceRef: repositoryPath });
        continue;
      }
      if (entry.isDirectory()) {
        if (IGNORED_DIRECTORIES.has(entry.name)) {
          input.ignoredRoots.add(repositoryPath);
          continue;
        }
        await this.walk({ ...input, directory: absolutePath });
        if (input.inventory.truncated) return;
        continue;
      }
      if (!entry.isFile()) continue;
      await recordFile(absolutePath, repositoryPath, input.inventory, input.fingerprint, input.reasons);
    }
  }
}

async function recordFile(
  absolutePath: string,
  repositoryPath: string,
  inventory: MutableInventory,
  fingerprint: ReturnType<typeof createHash>,
  reasons: RepositoryProbeReason[],
): Promise<void> {
  try {
    const stat = await fs.stat(absolutePath);
    inventory.files += 1;
    const name = basename(repositoryPath);
    const extension = extname(name);
    const testFile = TEST_PATTERN.test(repositoryPath);
    const sourceFile = SOURCE_EXTENSIONS.has(extension) && !testFile;
    if (sourceFile) inventory.sourceFiles += 1;
    if (testFile) inventory.testFiles += 1;
    if (MANIFEST_FILES.has(name)) inventory.manifestFiles += 1;
    if (CONSTRAINT_FILES.has(name) || repositoryPath.startsWith(".github/workflows/")) {
      inventory.constraintFiles += 1;
    }
    fingerprint.update(`${repositoryPath}\0${stat.size}\0`);
    await hashFile(absolutePath, fingerprint);
    fingerprint.update("\n");
  } catch (error) {
    reasons.push({ code: "repository_access_error", evidenceRef: safeError(error, repositoryPath) });
  }
}

async function hashFile(path: string, fingerprint: ReturnType<typeof createHash>): Promise<void> {
  await new Promise<void>((resolvePromise, reject) => {
    const stream = createReadStream(path);
    stream.on("data", (chunk: string | Buffer) => { fingerprint.update(chunk); });
    stream.once("error", reject);
    stream.once("end", resolvePromise);
  });
}

async function canonicalDirectory(path: string): Promise<string> {
  const resolved = resolve(path);
  const stat = await fs.lstat(resolved);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Framing root is not a real directory: ${path}`);
  return fs.realpath(resolved);
}

async function resolveScopes(root: string, requested: readonly string[] | undefined): Promise<readonly string[]> {
  const values = requested === undefined || requested.length === 0 ? [root] : requested;
  const scopes: string[] = [];
  for (const value of values) {
    const candidate = resolve(root, value);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) throw new Error(`Repository probe scope escapes the project: ${value}`);
    const real = await canonicalDirectory(candidate);
    if (real !== root && !real.startsWith(`${root}${sep}`)) throw new Error(`Repository probe scope resolves outside the project: ${value}`);
    scopes.push(real);
  }
  return [...new Set(scopes)].sort();
}

async function countSubmodules(root: string, reasons: RepositoryProbeReason[]): Promise<number> {
  try {
    const raw = await fs.readFile(join(root, ".gitmodules"), "utf8");
    const count = raw.split(/\r?\n/u).filter((line) => /^\s*path\s*=/u.test(line)).length;
    if (count > 0) reasons.push({ code: "submodule_detected", evidenceRef: `.gitmodules:${count}` });
    return count;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return 0;
    reasons.push({ code: "repository_access_error", evidenceRef: safeError(error, ".gitmodules") });
    return 0;
  }
}

async function readGitCommit(root: string, reasons: RepositoryProbeReason[]): Promise<string | null> {
  try {
    const result = await execFileAsync("git", ["-c", "core.hooksPath=/dev/null", "rev-parse", "--verify", "HEAD"], {
      cwd: root,
      env: { PATH: "/usr/bin:/bin:/usr/local/bin", GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" },
      encoding: "utf8",
      timeout: 5_000,
    });
    return result.stdout.trim() || null;
  } catch (error) {
    if (isExecFailure(error) && error.stderr.includes("not a git repository")) return null;
    reasons.push({ code: "git_snapshot_unavailable", evidenceRef: safeError(error, "git:HEAD") });
    return null;
  }
}

function classify(inventory: MutableInventory, reasons: readonly RepositoryProbeReason[]): RepositoryProbe["nature"] {
  if (inventory.truncated || inventory.symlinks > 0 || inventory.submodules > 0 || reasons.some((reason) => reason.code === "repository_access_error")) return "indeterminate";
  if (inventory.sourceFiles > 0 || inventory.testFiles > 0) return "implemented";
  if (inventory.manifestFiles > 0 || inventory.constraintFiles > 0) return "skeleton";
  return "empty";
}

function inventoryReference(value: MutableInventory): string {
  return `files:${value.files};source:${value.sourceFiles};tests:${value.testFiles};manifests:${value.manifestFiles};constraints:${value.constraintFiles}`;
}

function freezeInventory(value: MutableInventory, ignoredRoots: readonly string[]): RepositoryInventory {
  return { ...value, ignoredRoots };
}

function safeError(error: unknown, subject: string): string {
  const code = error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : "UNKNOWN";
  return `${subject}:${code}`.slice(0, 240);
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}

function isNodeError(error: unknown, code: string): boolean {
  return error instanceof Error && "code" in error && error.code === code;
}

function isExecFailure(error: unknown): error is Error & { stderr: string } {
  return error instanceof Error && "stderr" in error && typeof error.stderr === "string";
}
