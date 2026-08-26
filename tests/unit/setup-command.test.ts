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
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { test } from "node:test";

import { runSkillsCommand } from "../../src/adapters/inbound/cli/skills-cli.js";
import { detectHosts } from "../../src/adapters/outbound/skills/host-detector.js";

const ROOT = resolve(import.meta.dirname, "..", "..");

function makeExecutable(path: string): void {
  writeFileSync(path, "#!/bin/sh\necho ok\n", { mode: 0o755 });
  chmodSync(path, 0o755);
}

function withHostBin(callback: (binDir: string) => void): void {
  const binDir = mkdtempSync(join(tmpdir(), "norn-hosts-"));
  try {
    callback(binDir);
  } finally {
    rmSync(binDir, { recursive: true, force: true });
  }
}

function contextFor(home: string, cwd: string) {
  return { cwd, homeDir: home, frameworkRoot: ROOT };
}

function runSetup(argv: readonly string[], context: ReturnType<typeof contextFor>, binDir?: string): ReturnType<typeof runSkillsCommand> {
  const originalPath = process.env.PATH;
  process.env.PATH = binDir === undefined ? "/nonexistent/norn-test-path" : `${binDir}${delimiter}/nonexistent/norn-test-path`;
  try {
    return runSkillsCommand(["setup", ...argv], context);
  } finally {
    process.env.PATH = originalPath;
  }
}

test("detectHosts finds supported hosts present in PATH", () => {
  withHostBin((binDir) => {
    makeExecutable(join(binDir, "codex"));
    const result = detectHosts(`${binDir}${delimiter}/usr/bin`);
    assert.deepEqual(result.detected.map((h) => h.host), ["codex"]);
    assert.deepEqual(result.missing, ["claude"]);
  });
});

test("detectHosts returns empty when no host is present", () => {
  const result = detectHosts("/nonexistent/path-only-for-test");
  assert.equal(result.detected.length, 0);
  assert.deepEqual(result.missing, ["codex", "claude"]);
});

test("setup refuses to install when no supported host is detected", () => {
  const home = mkdtempSync(join(tmpdir(), "norn-home-"));
  const cwd = mkdtempSync(join(tmpdir(), "norn-cwd-"));
  try {
    const result = runSetup([], contextFor(home, cwd));
    assert.equal(result.code, 2);
    assert.match(result.stderr, /No supported Agent host detected|Aucun hôte d'Agent détecté/);
    assert.equal(result.stdout.includes("Norn setup") || result.stdout.includes("Configuration Norn"), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
    rmSync(cwd, { recursive: true, force: true });
  }
});

test("setup installs project skills and runs doctor when a host is detected", () => {
  withHostBin((binDir) => {
    const home = mkdtempSync(join(tmpdir(), "norn-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "norn-cwd-"));
    makeExecutable(join(binDir, "claude"));
    try {
      const result = runSetup([], contextFor(home, cwd), binDir);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Detected hosts|Hôtes détectés/);
      assert.match(result.stdout, /Project target|Cible projet/);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test("setup --global installs skills into home", () => {
  withHostBin((binDir) => {
    const home = mkdtempSync(join(tmpdir(), "norn-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "norn-cwd-"));
    makeExecutable(join(binDir, "codex"));
    try {
      const result = runSetup(["--global"], contextFor(home, cwd), binDir);
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Global target|Cible globale/);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test("install is an alias for setup", () => {
  withHostBin((binDir) => {
    const home = mkdtempSync(join(tmpdir(), "norn-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "norn-cwd-"));
    makeExecutable(join(binDir, "codex"));
    const originalPath = process.env.PATH;
    process.env.PATH = `${binDir}${delimiter}/nonexistent/norn-test-path`;
    try {
      const result = runSkillsCommand(["install"], contextFor(home, cwd));
      assert.equal(result.code, 0, result.stderr);
      assert.match(result.stdout, /Norn setup|Configuration Norn/);
    } finally {
      process.env.PATH = originalPath;
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test("setup --host filters host detection", () => {
  withHostBin((binDir) => {
    const home = mkdtempSync(join(tmpdir(), "norn-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "norn-cwd-"));
    makeExecutable(join(binDir, "claude"));
    try {
      const result = runSetup(["--host", "codex"], contextFor(home, cwd), binDir);
      assert.equal(result.code, 2);
      assert.match(result.stderr, /No supported Agent host detected|Aucun hôte d'Agent détecté/);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});

test("setup is idempotent on re-run", () => {
  withHostBin((binDir) => {
    const home = mkdtempSync(join(tmpdir(), "norn-home-"));
    const cwd = mkdtempSync(join(tmpdir(), "norn-cwd-"));
    makeExecutable(join(binDir, "codex"));
    try {
      const first = runSetup([], contextFor(home, cwd), binDir);
      assert.equal(first.code, 0, first.stderr);
      const second = runSetup([], contextFor(home, cwd), binDir);
      assert.equal(second.code, 0, second.stderr);
      assert.match(second.stdout, /unchanged|inchangés/);
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(cwd, { recursive: true, force: true });
    }
  });
});
