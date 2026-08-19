import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
  assert.equal(listEnvelope.data.length, 15);
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-maitrise"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-audit"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-dev"));
  assert.ok(listEnvelope.data.some((skill) => skill.name === "arka-framework-recette-qa"));

  const core = run(["skills", "install", "--target", target, "--profile", "core", "--json"], target);
  assert.equal(core.status, 0, core.stderr);
  assert.equal((JSON.parse(core.stdout) as { readonly data: { readonly skills: readonly string[] } }).data.skills.length, 5);
  assert.equal(run(["skills", "doctor", "--target", target, "--profile", "core", "--json"], target).status, 0);

  const all = run(["skills", "install", "--target", target, "--profile", "all", "--json"], target);
  assert.equal(all.status, 0, all.stderr);
  assert.equal(run(["skills", "doctor", "--target", target, "--json"], target).status, 0);

  const devSkill = resolve(target, ".agents", "skills", "arka-framework-dev", "SKILL.md");
  const content = readFileSync(devSkill, "utf8");
  assert.doesNotMatch(content, /\/Users\/|\{\{[^}]+\}\}/);
  const openai = readFileSync(resolve(target, ".agents", "skills", "arka-framework-dev", "agents", "openai.yaml"), "utf8");
  assert.match(openai, /default_prompt:/);
  writeFileSync(devSkill, `${content}\nlocal divergence\n`);
  const unhealthy = run(["skills", "doctor", "--target", target, "--json"], target);
  assert.equal(unhealthy.status, 3);
  assert.match(unhealthy.stdout, /divergent/);
});

function run(args: readonly string[], cwd: string) {
  return spawnSync(process.execPath, [BIN, ...args], { cwd, encoding: "utf8" });
}
