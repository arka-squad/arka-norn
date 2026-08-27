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

import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import { translate } from "../../../../application/localization/locale.js";

const ANGLE_RIGHT = String.fromCharCode(0x276f);
const TRIANGLE_UP = String.fromCharCode(0x25b2);
const TRIANGLE_DOWN = String.fromCharCode(0x25bc);
const EM_DASH = String.fromCharCode(0x2014);

export interface MenuItem<V = string> {
  readonly label: string;
  readonly value: V;
  readonly description?: string;
  /** A non-selectable section header used to group the list. */
  readonly heading?: boolean;
}

interface IndexedMenuItem<V> extends MenuItem<V> {
  readonly _origIndex: number;
}

export interface MenuOptions<V> {
  readonly title?: string;
  readonly hint?: string;
  readonly maxVisible?: number;
  readonly onSelect: (value: V) => void;
  readonly onCancel?: () => void;
}

export interface MenuScene {
  onKey(event: KeyEvent): "pop" | "consumed" | undefined;
  render(renderer: Renderer, theme: Theme): void;
  renderLines(theme: Theme): readonly string[];
  readonly cursor: number;
  readonly filterMode: boolean;
  readonly filterText: string;
  readonly visibleCount: number;
}

export function filterItems<V>(
  items: readonly MenuItem<V>[],
  text: string,
  stripAnsi: (s: string) => string,
): readonly IndexedMenuItem<V>[] {
  if (text === "") return items.map((item, i) => ({ ...item, _origIndex: i }));
  const lower = text.toLowerCase();
  return items
    .map((item, i) => ({ ...item, _origIndex: i }))
    .filter((item) => {
      const haystack = `${stripAnsi(item.label)} ${item.description ?? ""}`.toLowerCase();
      return haystack.includes(lower);
    });
}

export function createMenuScene<V = string>(items: readonly MenuItem<V>[], options: MenuOptions<V>): MenuScene {
  const maxVisible = options.maxVisible ?? 0;
  let cursor = 0;
  let viewOffset = 0;
  let filterMode = false;
  let filterText = "";
  let filtered: readonly IndexedMenuItem<V>[] = items.map((it, i) => ({ ...it, _origIndex: i }));
  cursor = items.findIndex((item) => item.heading !== true);
  if (cursor === -1) cursor = 0;

  function visible(): readonly MenuItem<V>[] {
    return filterMode ? filtered : items;
  }

  function isSelectable(item: MenuItem<V> | undefined): boolean {
    return item !== undefined && item.heading !== true;
  }

  function firstSelectable(): number {
    const vis = visible();
    const index = vis.findIndex((item) => isSelectable(item));
    return index === -1 ? 0 : index;
  }

  function effectiveMax(): number {
    const vis = visible();
    return maxVisible > 0 && maxVisible < vis.length ? maxVisible : vis.length;
  }

  function needsScroll(): boolean {
    return visible().length > effectiveMax();
  }

  function adjustViewport(): void {
    const vis = visible();
    const eMax = effectiveMax();
    if (vis.length === 0) {
      viewOffset = 0;
      return;
    }
    if (cursor < viewOffset) viewOffset = cursor;
    if (cursor >= viewOffset + eMax) viewOffset = cursor - eMax + 1;
  }

  function applyFilter(stripAnsi: (s: string) => string): void {
    filtered = filterItems(items, filterText, stripAnsi);
    cursor = filtered.findIndex((item) => item.heading !== true);
    if (cursor === -1) cursor = 0;
    viewOffset = 0;
  }

  function moveUp(): void {
    const vis = visible();
    if (vis.length === 0) return;
    for (let step = 0; step < vis.length; step += 1) {
      cursor = (cursor - 1 + vis.length) % vis.length;
      if (isSelectable(vis[cursor])) break;
    }
    adjustViewport();
  }

  function moveDown(): void {
    const vis = visible();
    if (vis.length === 0) return;
    for (let step = 0; step < vis.length; step += 1) {
      cursor = (cursor + 1) % vis.length;
      if (isSelectable(vis[cursor])) break;
    }
    adjustViewport();
  }

  function selectCurrent(): void {
    const vis = visible();
    if (vis.length === 0) return;
    const item = vis[cursor];
    if (item === undefined || !isSelectable(item)) return;
    options.onSelect(item.value);
  }

  function exitFilter(): void {
    filterMode = false;
    filterText = "";
    filtered = items.map((it, i) => ({ ...it, _origIndex: i }));
    cursor = firstSelectable();
    viewOffset = 0;
  }

  function handleFilterMode(event: KeyEvent, stripAnsi: (s: string) => string): "pop" | "consumed" | undefined {
    if (event.kind === "escape") {
      exitFilter();
      return "consumed";
    }
    if (event.kind === "enter") {
      selectCurrent();
      return "consumed";
    }
    if (event.kind === "backspace") {
      if (filterText.length > 0) {
        filterText = filterText.slice(0, -1);
        applyFilter(stripAnsi);
      }
      return "consumed";
    }
    if (event.kind === "up") {
      moveUp();
      return "consumed";
    }
    if (event.kind === "down") {
      moveDown();
      return "consumed";
    }
    if (event.kind === "char") {
      filterText += event.value;
      applyFilter(stripAnsi);
      return "consumed";
    }
    return undefined;
  }

  function handleNormalMode(event: KeyEvent): "pop" | "consumed" | undefined {
    if (event.kind === "filter") {
      filterMode = true;
      filterText = "";
      filtered = items.map((it, i) => ({ ...it, _origIndex: i }));
      cursor = 0;
      viewOffset = 0;
      return "consumed";
    }
    if (event.kind === "escape" || event.kind === "quit") {
      options.onCancel?.();
      return "pop";
    }
    if (event.kind === "enter") {
      selectCurrent();
      return "consumed";
    }
    if (event.kind === "up") {
      moveUp();
      return "consumed";
    }
    if (event.kind === "down") {
      moveDown();
      return "consumed";
    }
    return undefined;
  }

  function renderLines(theme: Theme): readonly string[] {
    if (filterMode) {
      filtered = filterItems(items, filterText, theme.stripAnsi);
      if (cursor >= filtered.length) cursor = Math.max(0, filtered.length - 1);
    }

    const lines: string[] = [];
    if (options.title !== undefined) {
      lines.push(`  ${theme.bold(options.title)}`, "");
    }

    const vis = visible();
    const eMax = effectiveMax();
    const scroll = needsScroll();
    if (scroll) lines.push(viewOffset > 0 ? `    ${theme.dim(`${TRIANGLE_UP} ${translate("tui.menu.moreAbove", { count: viewOffset })}`)}` : "");

    if (vis.length === 0) {
      for (let index = 0; index < Math.max(eMax, 1); index++) lines.push(index === 0 ? `    ${theme.dim(translate("tui.menu.noResults"))}` : "");
    } else {
      for (let index = 0; index < eMax; index++) {
        const realIndex = viewOffset + index;
        const item = vis[realIndex];
        if (item === undefined) { lines.push(""); continue; }
        const active = realIndex === cursor;
        if (item.heading === true) {
          if (index > 0) lines.push("");
          lines.push(`  ${theme.dim(item.label.toUpperCase())}`);
          continue;
        }
        const marker = active ? theme.arkaRed(ANGLE_RIGHT) : " ";
        const label = active ? theme.bold(item.label) : item.label;
        const desc = item.description !== undefined ? theme.gray(` ${EM_DASH} ${item.description}`) : "";
        lines.push(`  ${marker} ${label}${desc}`);
      }
    }

    if (scroll) {
      const remaining = vis.length - viewOffset - eMax;
      lines.push(remaining > 0 ? `    ${theme.dim(`${TRIANGLE_DOWN} ${translate("tui.menu.moreBelow", { count: remaining })}`)}` : "");
    }
    lines.push("", `  ${theme.dim(options.hint ?? translate("tui.menu.defaultHint"))}`);
    if (filterMode) lines.push(`  ${theme.arkaAccent("/")} ${filterText}${theme.dim("_")}`);
    return lines;
  }

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      const noStrip = (s: string): string => s;
      if (filterMode) return handleFilterMode(event, noStrip);
      return handleNormalMode(event);
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        for (const value of renderLines(theme)) line(value);
      });
    },
    renderLines,
    get cursor(): number {
      return cursor;
    },
    get filterMode(): boolean {
      return filterMode;
    },
    get filterText(): string {
      return filterText;
    },
    get visibleCount(): number {
      return visible().length;
    },
  };
}
