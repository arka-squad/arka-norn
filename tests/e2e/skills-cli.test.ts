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
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("skills list/install/doctor partagent le catalogue et détectent une divergence", (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-skills-cli-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));

  const listed = run(["skills", "list", "--json"], target);
  assert.equal(listed.status, 0, listed.stderr);
  const listEnvelope = JSON.parse(listed.stdout) as { readonly data: readonly { readonly name: string }[] };
  assert.equal(listEnvelope.data.length, 21);
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-norn"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-audit"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-product"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-fastdev"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-mastery"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-audit"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-development"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-qa-review"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-git-steward"));

  const core = run(["skills", "install", "--target", target, "--profile", "core", "--json"], target);
  assert.equal(core.status, 0, core.stderr);
  assert.equal((JSON.parse(core.stdout) as { readonly data: { readonly skills: readonly string[] } }).data.skills.length, 10);
  assert.equal(run(["skills", "doctor", "--target", target, "--profile", "core", "--json"], target).status, 0);

  const all = run(["skills", "install", "--target", target, "--profile", "all", "--json"], target);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(run(["skills", "doctor", "--target", target, "--json"], target).status, 0);

  for (const [profile, count] of [["product", 13], ["architecture", 12], ["audit", 11], ["dev", 11], ["qa", 10]] as const) {
    const result = run(["skills", "install", "--target", target, "--profile", profile, "--json"], target);
    assert.equal(result.status, 0, `${profile}: ${result.stderr}`);
    assert.equal((JSON.parse(result.stdout) as { readonly data: { readonly skills: readonly string[] } }).data.skills.length, count, profile);
  }

  const devSkill = resolve(target, ".agents", "skills", "arka-framework-development", "SKILL.md");
  const content = readFileSync(devSkill, "utf8");
  assert.doesNotMatch(content, /\/Users\/|\{\{[^}]+\}\}/);
  const openai = readFileSync(resolve(target, ".agents", "skills", "arka-framework-development", "agents", "openai.yaml"), "utf8");
  assert.match(openai, /default_prompt:/);
  writeFileSync(devSkill, `${content}\nlocal divergence\n`);
  const unhealthy = run(["skills", "doctor", "--target", target, "--json"], target);
  assert.equal(unhealthy.status, 3);
  assert.match(unhealthy.stdout, /divergent/);
});

test("skills global installe et diagnostique les 21 rendus sans masquer une divergence", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-skills-global-cli-"));
  const target = join(sandbox, "project");
  const home = join(sandbox, "home");
  const env = { ...process.env, ARKA_NORN_HOME: home, HOME: home, USERPROFILE: home };
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  mkdirSync(target, { recursive: true });

  const installed = run(["skills", "install", "--target", target, "--profile", "all", "--global", "--json"], target, env);
  assert.equal(installed.status, 0, `${installed.stdout}\n${installed.stderr}`);
  const plan = (JSON.parse(installed.stdout) as { readonly data: { readonly skills: readonly string[]; readonly plan: readonly unknown[] } }).data;
  assert.equal(plan.skills.length, 21);
  assert.equal(plan.plan.length, 21 * 6);

  const nornGlobal = readFileSync(resolve(home, ".claude", "skills", "arka-norn", "SKILL.md"), "utf8");
  assert.match(nornGlobal, /framing enter/);
  assert.match(nornGlobal, /framing resume/);
  assert.match(nornGlobal, /two stabilizations/);
  assert.match(nornGlobal, /Do not expose raw JSON/);

  const productGlobal = readFileSync(resolve(home, ".claude", "skills", "arka-product", "SKILL.md"), "utf8");
  assert.match(productGlobal, /Reply in the active display locale/);
  assert.match(productGlobal, /Machine-readable CLI data is the source of truth/);
  assert.match(productGlobal, /signed and mechanically validated artifact/);

  const healthy = run(["skills", "doctor", "--target", target, "--profile", "all", "--global", "--json"], target, env);
  assert.equal(healthy.status, 0, `${healthy.stdout}\n${healthy.stderr}`);
  const healthyChecks = (JSON.parse(healthy.stdout) as { readonly data: { readonly checks: readonly { readonly status: string }[] } }).data.checks;
  assert.equal(healthyChecks.length, 21);
  assert.ok(healthyChecks.every((check) => check.status === "ok"));

  const orphanGlobal = resolve(home, ".claude", "skills", "arka-orphan-agentdev");
  const orphanLocal = resolve(target, ".agents", "skills", "arka-local-orphan");
  mkdirSync(orphanGlobal, { recursive: true });
  mkdirSync(orphanLocal, { recursive: true });
  writeFileSync(join(orphanGlobal, "SKILL.md"), "---\nname: arka-orphan-agentdev\n---\n");
  const withOrphans = run(["skills", "doctor", "--target", target, "--profile", "all", "--global", "--json"], target, env);
  assert.equal(withOrphans.status, 0, `${withOrphans.stdout}\n${withOrphans.stderr}`);
  const orphanData = (JSON.parse(withOrphans.stdout) as { readonly data: { readonly orphans: readonly { readonly name: string }[] } }).data;
  assert.deepEqual(orphanData.orphans.map((orphan) => orphan.name), ["arka-local-orphan", "arka-orphan-agentdev"]);
  const withOrphansHuman = run(["skills", "doctor", "--target", target, "--profile", "all", "--global"], target, env);
  assert.equal(withOrphansHuman.status, 0, `${withOrphansHuman.stdout}\n${withOrphansHuman.stderr}`);
  assert.match(withOrphansHuman.stdout, /WARN\tarka-orphan-agentdev\tunmanaged arka entry/);

  const divergent = resolve(home, ".codex", "skills", "arka-framework-qa-review", "SKILL.md");
  writeFileSync(divergent, "custom global content\n");
  const diagnosed = run(["skills", "doctor", "--target", target, "--profile", "all", "--global", "--json"], target, env);
  assert.equal(diagnosed.status, 3, `${diagnosed.stdout}\n${diagnosed.stderr}`);
  const check = (JSON.parse(diagnosed.stdout) as {
    readonly data: { readonly checks: readonly { readonly name: string; readonly status: string }[] };
  }).data.checks.find((item) => item.name === "arka-framework-qa-review");
  assert.equal(check?.status, "divergent");
  assert.equal(readFileSync(divergent, "utf8"), "custom global content\n");
});

function run(args: readonly string[], cwd: string, env = process.env) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8", env });
}
