import assert from "node:assert/strict";
import { test } from "node:test";

import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { createTuiApp } from "../../src/adapters/inbound/tui/runtime/tui-app.ts";
import { createResultView } from "../../src/adapters/inbound/tui/views/result-view.ts";

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

test("le renderer borne une frame à la hauteur du terminal", () => {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: true, rows: 5 });
  renderer.redraw((line) => {
    for (let index = 1; index <= 10; index++) line(`L${index}`);
  });
  assert.equal(renderer.lastFrameLines, 4);
  assert.match(output, /ligne\(s\) masquée\(s\)/);
});
