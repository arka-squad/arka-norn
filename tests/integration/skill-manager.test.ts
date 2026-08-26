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
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { Scene, TuiApp } from "../../src/adapters/inbound/tui/runtime/tui-app.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { DirectSkillManager } from "../../src/adapters/outbound/skills/direct-skill-manager.ts";
import { showSkillInstallation } from "../../src/composition/tui/skill-scene-controller.ts";
import type { SkillManager } from "../../src/ports/outbound/skill-manager.ts";

const ROOT = resolve(import.meta.dirname, "..", "..");

test("le manager TUI installe directement les 21 skills sans sous-processus", async (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-direct-skills-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT);

  assert.deepEqual(await manager.inspect(target), { total: 21, healthy: 0, missing: 21, divergent: 0 });
  const installed = await manager.install({ target });
  assert.equal(installed.code, 0, installed.output);
  assert.deepEqual(await manager.inspect(target), { total: 21, healthy: 21, missing: 0, divergent: 0 });
  assert.deepEqual(await manager.inspect(target, "product"), { total: 13, healthy: 13, missing: 0, divergent: 0 });
});

test("le manager TUI distingue les 21 skills globales Claude/Codex du Project", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-direct-global-skills-"));
  const target = join(sandbox, "project");
  const globalHome = join(sandbox, "home");
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT, globalHome);

  assert.deepEqual(await manager.inspectGlobal(), { total: 21, healthy: 0, missing: 21, divergent: 0 });
  assert.equal((await manager.install({ target, global: true })).code, 0);
  assert.deepEqual(await manager.inspect(target), { total: 21, healthy: 21, missing: 0, divergent: 0 });
  assert.deepEqual(await manager.inspectGlobal(), { total: 21, healthy: 21, missing: 0, divergent: 0 });

  writeFileSync(resolve(globalHome, ".codex", "skills", "arka-framework-audit", "SKILL.md"), "global divergence\n");
  assert.deepEqual(await manager.inspect(target), { total: 21, healthy: 21, missing: 0, divergent: 0 });
  assert.deepEqual(await manager.inspectGlobal(), { total: 21, healthy: 20, missing: 0, divergent: 1 });
});

test("les skills audit, dev et QA générés portent un workflow exécutable sans réponse métier préremplie", async (context) => {
  const target = mkdtempSync(join(tmpdir(), "arka-norn-forward-skills-"));
  context.after(() => rmSync(target, { recursive: true, force: true }));
  const manager = new DirectSkillManager(ROOT);
  await manager.install({ target });

  const audit = skill(target, "arka-framework-audit");
  const bootstrap = skill(target, "arka-norn");
  const fastdev = skill(target, "arka-fastdev");
  const product = skill(target, "arka-product");
  const concept = skill(target, "arka-framework-concept");
  const dev = skill(target, "arka-framework-development");
  const qa = skill(target, "arka-framework-qa-review");
  for (const rendered of [audit, fastdev, product, concept, dev, qa]) {
    assert.match(rendered, /locale show --json/);
    assert.match(rendered, /content_locale/);
    assert.match(rendered, /(?:pipeline|essential|fastdev) next <feature>.*--json/);
    assert.match(rendered, /Do not execute a second phase/);
  }
  assert.match(bootstrap, /framing enter/);
  assert.match(bootstrap, /framing resume/);
  assert.match(bootstrap, /two stabilizations/);
  assert.match(bootstrap, /Do not expose raw JSON/);
  assert.match(dev, /development_report/);
  assert.match(qa, /qa_review/);
  assert.doesNotMatch(`${audit}${dev}${qa}`, /\/Users\/|À_REMPLIR|TO_FILL/);
});

test("le parcours TUI de réparation force le remplacement après sauvegarde", async () => {
  const calls: { readonly target: string; readonly global?: boolean; readonly force?: boolean }[] = [];
  const manager: SkillManager = {
    inspect: async () => ({ total: 21, healthy: 19, missing: 0, divergent: 2 }),
    inspectGlobal: async () => ({ total: 21, healthy: 21, missing: 0, divergent: 0 }),
    async install(input) {
      calls.push(input);
      return { code: 0, output: "21/21 skills healthy" };
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
  let healthRefreshes = 0;

  await showSkillInstallation(app, manager, "/workspace/project", async () => {
    healthRefreshes += 1;
  });
  const menu = app.topScene();
  assert.ok(menu);
  menu.onKey({ kind: "down" });
  menu.onKey({ kind: "enter" });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  assert.deepEqual(calls, [{ target: "/workspace/project", global: false, force: true }]);
  assert.equal(healthRefreshes, 1);
  assert.ok(app.topScene());
});

test("la réparation globale affiche le diagnostic puis exige une seconde confirmation avant --force", async () => {
  const calls: { readonly target: string; readonly global?: boolean; readonly force?: boolean }[] = [];
  const manager: SkillManager = {
    inspect: async () => ({ total: 21, healthy: 19, missing: 0, divergent: 2 }),
    inspectGlobal: async () => ({ total: 21, healthy: 18, missing: 1, divergent: 2 }),
    async install(input) {
      calls.push(input);
      return { code: 0, output: "36 scopes contrôlés" };
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
  const initial = app.topScene();
  assert.ok(initial);
  initial.onKey({ kind: "down" });
  initial.onKey({ kind: "down" });
  initial.onKey({ kind: "enter" });

  assert.deepEqual(calls, []);
  let output = "";
  const confirmation = app.topScene();
  assert.ok(confirmation);
  confirmation.render(createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false }), createTheme({ NO_COLOR: "1" }, false));
  assert.match(output, /Confirm global repair \(2\/2\)/);
  assert.match(output, /Project 19\/21 healthy/);
  assert.match(output, /Global 18\/21 healthy/);
  assert.match(output, /back up then repair Project and global/);

  confirmation.onKey({ kind: "enter" });
  await new Promise((resolvePromise) => setImmediate(resolvePromise));

  assert.deepEqual(calls, [{ target: "/workspace/project", global: true, force: true }]);
});

function skill(target: string, name: string): string {
  return readFileSync(resolve(target, ".agents", "skills", name, "SKILL.md"), "utf8");
}
