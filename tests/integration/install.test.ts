import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

interface SkillDefinition {
  readonly name: string;
}

const ROOT = resolve(import.meta.dirname, "..", "..");
const BIN = resolve(ROOT, "bin", "arka-norn.mjs");

test("install déploie réellement chaque skill dans un target et un home temporaires", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-install-test-"));
  const target = join(sandbox, "target");
  const home = join(sandbox, "home");
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const isolatedEnv = { ...process.env, ARKA_NORN_HOME: home, HOME: home, USERPROFILE: home };

  const result = spawnSync(process.execPath, [BIN, "install", "--target", target, "--global"], {
    cwd: ROOT,
    encoding: "utf8",
    env: isolatedEnv,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const definitions = readdirSync(resolve(ROOT, "skills-src"))
    .filter((name) => name.endsWith(".json"))
    .map((name) => JSON.parse(readFileSync(resolve(ROOT, "skills-src", name), "utf8")) as SkillDefinition);
  assert.ok(definitions.length > 0);

  const generated: string[] = [];
  for (const definition of definitions) {
    generated.push(
      resolve(target, ".claude", "skills", definition.name, "SKILL.md"),
      resolve(target, ".agents", "skills", definition.name, "SKILL.md"),
      resolve(target, ".agents", "skills", definition.name, "agents", "openai.yaml"),
      resolve(home, ".claude", "skills", definition.name, "SKILL.md"),
      resolve(home, ".codex", "skills", definition.name, "SKILL.md"),
      resolve(home, ".codex", "skills", definition.name, "agents", "openai.yaml"),
    );
  }

  assert.equal(generated.length, definitions.length * 6);
  for (const file of generated) {
    const content = readFileSync(file, "utf8");
    assert.doesNotMatch(content, /\{\{[^}]+\}\}|\bundefined\b/, file);
  }

  const healthy = spawnSync(process.execPath, [BIN, "skills", "doctor", "--target", target, "--global", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: isolatedEnv,
  });
  assert.equal(healthy.status, 0, `${healthy.stdout}\n${healthy.stderr}`);
  assert.equal((JSON.parse(healthy.stdout) as { readonly data: { readonly global: boolean } }).data.global, true);

  const divergentSkill = resolve(home, ".codex", "skills", definitions[0]!.name, "SKILL.md");
  writeFileSync(divergentSkill, "divergent\n");
  const divergent = spawnSync(process.execPath, [BIN, "skills", "doctor", "--target", target, "--global", "--json"], {
    cwd: ROOT,
    encoding: "utf8",
    env: isolatedEnv,
  });
  assert.equal(divergent.status, 3, `${divergent.stdout}\n${divergent.stderr}`);
  assert.match(divergent.stdout, /divergent/);
});

test("install dry-run ne crée rien et un conflit exige --force avec backup", (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-install-safe-"));
  const target = join(sandbox, "target");
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const preview = spawnSync(process.execPath, [BIN, "install", "--target", target, "--dry-run", "--json"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(preview.status, 0, preview.stderr);
  assert.equal(existsSync(target), false);
  const previewJson = JSON.parse(preview.stdout) as { readonly data: { readonly plan: readonly { readonly action: string }[] } };
  assert.ok(previewJson.data.plan.every((item) => item.action === "create"));

  const initial = spawnSync(process.execPath, [BIN, "install", "--target", target], { cwd: ROOT, encoding: "utf8" });
  assert.equal(initial.status, 0, initial.stderr);
  const skill = resolve(target, ".agents", "skills", "arka-framework-statut", "SKILL.md");
  writeFileSync(skill, "custom local content\n");

  const refused = spawnSync(process.execPath, [BIN, "install", "--target", target], { cwd: ROOT, encoding: "utf8" });
  assert.equal(refused.status, 5);
  assert.equal(readFileSync(skill, "utf8"), "custom local content\n");

  const forced = spawnSync(process.execPath, [BIN, "install", "--target", target, "--force"], { cwd: ROOT, encoding: "utf8" });
  assert.equal(forced.status, 0, forced.stderr);
  assert.notEqual(readFileSync(skill, "utf8"), "custom local content\n");
  const backupsRoot = resolve(target, ".arka-norn", "backups", "skills");
  assert.ok(existsSync(backupsRoot));
  assert.match(findBackupContent(backupsRoot), /custom local content/);
});

function findBackupContent(directory: string): string {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const candidate = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = findBackupContent(candidate);
      if (nested.length > 0) return nested;
    } else if (entry.isFile()) {
      const content = readFileSync(candidate, "utf8");
      if (content.includes("custom local content")) return content;
    }
  }
  return "";
}
