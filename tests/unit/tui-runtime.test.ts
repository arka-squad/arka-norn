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
import { test } from "node:test";

import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { createTuiApp } from "../../src/adapters/inbound/tui/runtime/tui-app.ts";
import { createResultView } from "../../src/adapters/inbound/tui/views/result-view.ts";
import { showHealthReport } from "../../src/composition/tui/skill-scene-controller.ts";
import type { DoctorReport } from "../../src/ports/inbound/for-doctor.ts";

const theme = createTheme({ NO_COLOR: "1" }, false);

test("la TUI affiche un état explicite sous la largeur minimale", async () => {
  let output = "";
  let listener: ((event: { kind: "interrupt" }) => void) | undefined;
  const app = createTuiApp({
    input: {
      start() { queueMicrotask(() => listener?.({ kind: "interrupt" })); },
      stop() {},
      on(next) { listener = next as typeof listener; return () => { listener = undefined; }; },
    },
    renderer: createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false }),
    theme,
    viewport: () => ({ columns: 40, rows: 20 }),
  });
  app.push({ onKey: () => "consumed", render: (renderer) => renderer.redraw((line) => line("ne doit pas apparaître")) });
  await app.run({ registerProcessHandlers: false });
  assert.match(output, /Terminal trop étroit/);
  assert.doesNotMatch(output, /ne doit pas apparaître/);
});

test("les résultats longs défilent avec les flèches", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false });
  const view = createResultView({ title: "Rapport", code: 0, output: "L1\nL2\nL3\nL4\nL5", maxVisibleLines: 3, onBack() {} });
  view.render(renderer, theme);
  assert.match(output, /L1/);
  assert.doesNotMatch(output, /L5/);
  output = "";
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.render(renderer, theme);
  assert.match(output, /L5/);
  assert.match(output, /2 ligne\(s\) au-dessus/);
});

test("la Santé TUI délègue son verdict au rapport doctor", () => {
  const warningReport: DoctorReport = {
    schemaVersion: 1,
    ok: true,
    mode: "inspect",
    checks: [{ id: "skills.installation", status: "warn", message: "10/10 core healthy; 11 optional missing; 0 divergent", repairable: true }],
    repairs: [],
    summary: { pass: 0, warn: 1, fail: 0 },
  };
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false });
  const app = createTuiApp({
    input: { start() {}, stop() {}, on() { return () => {}; } },
    renderer,
    theme,
  });

  showHealthReport(
    app,
    warningReport,
    { total: 21, healthy: 10, missing: 11, divergent: 0 },
    { total: 21, healthy: 21, missing: 0, divergent: 0 },
  );
  app.topScene()?.render(renderer, theme);

  assert.match(output, /Statut : OK/);
  assert.doesNotMatch(output, /ÉCHEC/);
  assert.match(output, /11 absents/);
  assert.match(output, /Global Claude\/Codex 21\/21 sains/);

  output = "";
  showHealthReport(app, {
    ...warningReport,
    ok: false,
    checks: [{ id: "audit.trail", status: "fail", message: "audit unavailable", repairable: false }],
    summary: { pass: 0, warn: 0, fail: 1 },
  }, { total: 21, healthy: 21, missing: 0, divergent: 0 }, { total: 21, healthy: 21, missing: 0, divergent: 0 });
  app.topScene()?.render(renderer, theme);

  assert.match(output, /Statut : ÉCHEC \(code 3\)/);

  output = "";
  showHealthReport(
    app,
    warningReport,
    { total: 21, healthy: 21, missing: 0, divergent: 0 },
    { total: 21, healthy: 20, missing: 0, divergent: 1 },
  );
  app.topScene()?.render(renderer, theme);

  assert.match(output, /Statut : ÉCHEC \(code 3\)/);
  assert.match(output, /Global Claude\/Codex 20\/21 sains/);
  assert.match(output, /diagnostic global sera affiché/);
});

test("le renderer borne une frame à la hauteur du terminal", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: true, rows: 5 });
  renderer.redraw((line) => {
    for (let index = 1; index <= 10; index++) line(`L${index}`);
  });
  assert.equal(renderer.lastFrameLines, 4);
  assert.match(output, /ligne\(s\) masquée\(s\)/);
});

test("le renderer remonte le nombre réel de lignes après wrapping terminal", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: true, rows: 10, columns: 10 });
  renderer.redraw((line) => line("1234567890123456789012345"));
  assert.equal(renderer.lastFrameLines, 3);
  renderer.redraw((line) => line("court"));
  assert.match(output, /\u001b\[3A\u001b\[J/);
});
