import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { Scene, TuiApp } from "../../src/adapters/inbound/tui/runtime/tui-app.ts";
import { DirectSkillManager } from "../../src/adapters/outbound/skills/direct-skill-manager.ts";
import { showSkillInstallation } from "../../src/composition/tui/skill-scene-controller.ts";
import type { SkillManager } from "../../src/ports/outbound/skill-manager.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("le manager TUI installe directement les 17 skills sans sous-processus", async (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-direct-skills-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT);

  assert.deepEqual(await manager.inspect(target), { total: 17, healthy: 0, missing: 17, divergent: 0 });
  const installed = await manager.install({ target });
  assert.equal(installed.code, 0, installed.output);
  assert.deepEqual(await manager.inspect(target), { total: 17, healthy: 17, missing: 0, divergent: 0 });
});

test("les skills audit, dev et QA générés portent un workflow exécutable sans réponse métier préremplie", async (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-forward-skills-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT);
  await manager.install({ target });

  const audit = skill(target, "arka-framework-audit");
  const bootstrap = skill(target, "arka-norn");
  const fastdev = skill(target, "arka-fastdev");
  const concept = skill(target, "arka-framework-concept");
  const dev = skill(target, "arka-framework-dev");
  const qa = skill(target, "arka-framework-recette-qa");
  assert.match(audit, /Vérifier directement/);
  assert.match(audit, /Ne modifier aucun fichier métier pendant l'audit/);
  assert.match(dev, /Lire avant d'écrire/);
  assert.match(dev, /typecheck, tests ciblés puis gates globaux/);
  assert.match(dev, /cr_dev/);
  assert.match(qa, /dernier `cr_dev_id`/);
  assert.match(qa, /Ne pas modifier le code pendant la recette indépendante/);
  assert.match(concept, /ChatGPT ou Claude\.ai/);
  assert.match(concept, /prompt complètement prérempli/);
  assert.match(concept, /proposition non fiable/);
  assert.match(bootstrap, /Mode arka-norn activé/);
  assert.match(bootstrap, /project add/);
  assert.match(bootstrap, /agent register/);
  assert.match(bootstrap, /Ne pas utiliser `--force`|ne pas utiliser `--force`/i);
  assert.match(fastdev, /fastdev next/);
  assert.match(fastdev, /une seule action calculée|exactement une action calculée/i);
  assert.doesNotMatch(`${audit}${dev}${qa}`, /\/Users\/|À_REMPLIR|résultat attendu de cette Feature/);
});

test("le parcours TUI de réparation force le remplacement après sauvegarde", async () => {
  const calls: { readonly target: string; readonly global?: boolean; readonly force?: boolean }[] = [];
  const manager: SkillManager = {
    inspect: async () => ({ total: 17, healthy: 15, missing: 0, divergent: 2 }),
    async install(input) {
      calls.push(input);
      return { code: 0, output: "17/17 skills healthy" };
    },
  };
  const stack: Scene[] = [];
  const app: TuiApp = {
    push(scene) { stack.push(scene); },
    pop() { stack.pop(); },
    topScene: () => stack.at(-1),
    redraw() {},
    run: async () => {},
  };

  await showSkillInstallation(app, manager, "/workspace/project");
  const menu = app.topScene();
  assert.ok(menu);
  menu.onKey({ kind: "down" });
  menu.onKey({ kind: "enter" });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  assert.deepEqual(calls, [{ target: "/workspace/project", global: false, force: true }]);
  assert.ok(app.topScene());
});

function skill(target: string, name: string): string {
  return readFileSync(resolve(target, ".agents", "skills", name, "SKILL.md"), "utf8");
}
