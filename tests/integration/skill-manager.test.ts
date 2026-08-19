import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { DirectSkillManager } from "../../src/adapters/outbound/skills/direct-skill-manager.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("le manager TUI installe directement les 15 skills sans sous-processus", async (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-direct-skills-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT);

  assert.deepEqual(await manager.inspect(target), { total: 15, healthy: 0, missing: 15, divergent: 0 });
  const installed = await manager.install({ target });
  assert.equal(installed.code, 0, installed.output);
  assert.deepEqual(await manager.inspect(target), { total: 15, healthy: 15, missing: 0, divergent: 0 });
});

test("les skills audit, dev et QA générés portent un workflow exécutable sans réponse métier préremplie", async (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-forward-skills-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT);
  await manager.install({ target });

  const audit = skill(target, "arka-framework-audit");
  const dev = skill(target, "arka-framework-dev");
  const qa = skill(target, "arka-framework-recette-qa");
  assert.match(audit, /Vérifier directement/);
  assert.match(audit, /Ne modifier aucun fichier métier pendant l'audit/);
  assert.match(dev, /Lire avant d'écrire/);
  assert.match(dev, /typecheck, tests ciblés puis gates globaux/);
  assert.match(dev, /cr_dev/);
  assert.match(qa, /dernier `cr_dev_id`/);
  assert.match(qa, /Ne pas modifier le code pendant la recette indépendante/);
  assert.doesNotMatch(`${audit}${dev}${qa}`, /\/Users\/|À_REMPLIR|résultat attendu de cette Feature/);
});

function skill(target: string, name: string): string {
  return readFileSync(resolve(target, ".agents", "skills", name, "SKILL.md"), "utf8");
}
