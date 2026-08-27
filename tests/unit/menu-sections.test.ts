/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import { createMenuScene, type MenuItem } from "../../src/adapters/inbound/tui/components/menu.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";

const theme = createTheme({ NO_COLOR: "1" }, false);

function grouped(): readonly MenuItem<string>[] {
  return [
    { label: "Projects", value: "h:projects", heading: true },
    { label: "Frame or import a Project", value: "action:create" },
    { label: "Arka Norn", value: "project:1" },
    { label: "Maintenance", value: "h:maintenance", heading: true },
    { label: "System health", value: "action:health" },
    { label: "Preferences", value: "h:preferences", heading: true },
    { label: "Language", value: "action:locale" },
  ];
}

test("le menu groupé démarre sur la première action et saute les en-têtes", () => {
  const selected: string[] = [];
  const menu = createMenuScene(grouped(), { onSelect: (value) => selected.push(value) });
  assert.equal(menu.cursor, 1, "cursor starts on the first selectable item, not the heading");

  menu.onKey({ kind: "enter" });
  assert.deepEqual(selected, ["action:create"]);

  menu.onKey({ kind: "down" });
  assert.equal(menu.cursor, 2);
  menu.onKey({ kind: "down" });
  assert.equal(menu.cursor, 4, "down skips the Maintenance heading");
  menu.onKey({ kind: "down" });
  assert.equal(menu.cursor, 6, "down skips the Preferences heading");
  menu.onKey({ kind: "enter" });
  assert.deepEqual(selected.at(-1), "action:locale");

  menu.onKey({ kind: "up" });
  assert.equal(menu.cursor, 4, "up skips the Preferences heading");
});

test("une entrée d'en-tête ne peut jamais être sélectionnée", () => {
  const selected: string[] = [];
  const menu = createMenuScene([{ label: "Projects", value: "h:projects", heading: true }, { label: "Only", value: "action:only" }], { onSelect: (value) => selected.push(value) });
  assert.equal(menu.cursor, 1);
  menu.onKey({ kind: "up" });
  assert.equal(menu.cursor, 1, "wrapping up still lands on the single selectable item");
  menu.onKey({ kind: "enter" });
  assert.deepEqual(selected, ["action:only"]);
});

test("le rendu affiche les en-têtes en section et n'y met pas de curseur", () => {
  const menu = createMenuScene(grouped(), { onSelect: () => undefined });
  const lines = menu.renderLines(theme).join("\n");
  assert.match(lines, /PROJECTS/u);
  assert.match(lines, /MAINTENANCE/u);
  assert.match(lines, /PREFERENCES/u);
  const headingWithCursor = menu.renderLines(theme).some((line) => line.includes("PROJECTS") && line.includes(String.fromCharCode(0x276f)));
  assert.equal(headingWithCursor, false);
});

