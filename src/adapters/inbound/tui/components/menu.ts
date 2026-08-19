/**
 * Menu -- Scene de navigation clavier (flèches, filtre `/`, sélection).
 * Port TS de arka-cc-management (adapters/inbound/tui/components/menu.ts).
 *
 * DÉVIATION DÉLIBÉRÉE vs la source : `enter` retourne toujours `'consumed'`,
 * jamais `'pop'`. La source retourne `'pop'` après `onSelect(value)` ; si
 * `onSelect` pousse lui-même une nouvelle Scene de façon synchrone (cas
 * quasi systématique pour toute navigation drill-down), `dispatchKey`
 * (tui-app.ts) exécute le `top.onKey()` -> push AVANT de lire le retour,
 * puis pop la scène qui vient d'être poussée (devenue le nouveau top) au
 * lieu du menu lui-même : la nouvelle vue disparaît instantanément et la
 * pile se retrouve corrompue. Bug reproduit et corrigé pendant le
 * portage initial d'arka-norn (phase JS) ; la correction consiste à ne
 * plus jamais laisser le menu se pop tout seul sur sélection -- c'est à
 * l'appelant de gérer push()/pop() explicitement dans son `onSelect`.
 * `escape`/`quit` restent `'pop'` : `onCancel` ne pousse rien, pas de race.
 */
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";

const ANGLE_RIGHT = String.fromCharCode(0x276f);
const TRIANGLE_UP = String.fromCharCode(0x25b2);
const TRIANGLE_DOWN = String.fromCharCode(0x25bc);
const EM_DASH = String.fromCharCode(0x2014);

export interface MenuItem<V = string> {
  readonly label: string;
  readonly value: V;
  readonly description?: string;
}

interface IndexedMenuItem<V> extends MenuItem<V> {
  readonly _origIndex: number;
}

export interface MenuOptions<V> {
  readonly title?: string;
  readonly hint?: string;
  /** 0 = illimité (défaut). >0 = viewport scrollable. */
  readonly maxVisible?: number;
  /** Appelé sur Enter. Reçoit la valeur choisie. Ne PAS supposer que le menu se ferme -- gérer soi-même push()/pop(). */
  readonly onSelect: (value: V) => void;
  /** Handler d'annulation -- déclenché sur Escape/q (hors mode filtre). */
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

const DEFAULT_HINT = "Flèches naviguer, Enter sélectionner, / filtrer, q quitter";

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

  function visible(): readonly MenuItem<V>[] {
    return filterMode ? filtered : items;
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
    cursor = 0;
    viewOffset = 0;
  }

  function moveUp(): void {
    const vis = visible();
    if (vis.length === 0) return;
    cursor = (cursor - 1 + vis.length) % vis.length;
    adjustViewport();
  }

  function moveDown(): void {
    const vis = visible();
    if (vis.length === 0) return;
    cursor = (cursor + 1) % vis.length;
    adjustViewport();
  }

  function selectCurrent(): void {
    const vis = visible();
    if (vis.length === 0) return;
    const item = vis[cursor];
    if (item === undefined) return;
    options.onSelect(item.value);
  }

  function exitFilter(): void {
    filterMode = false;
    filterText = "";
    filtered = items.map((it, i) => ({ ...it, _origIndex: i }));
    cursor = 0;
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
    if (scroll) lines.push(viewOffset > 0 ? `    ${theme.dim(`${TRIANGLE_UP} ${viewOffset} de plus`)}` : "");

    if (vis.length === 0) {
      for (let index = 0; index < Math.max(eMax, 1); index++) lines.push(index === 0 ? `    ${theme.dim("(aucun résultat)")}` : "");
    } else {
      for (let index = 0; index < eMax; index++) {
        const realIndex = viewOffset + index;
        const item = vis[realIndex];
        if (item === undefined) { lines.push(""); continue; }
        const active = realIndex === cursor;
        const marker = active ? theme.arkaRed(ANGLE_RIGHT) : " ";
        const label = active ? theme.bold(item.label) : item.label;
        const desc = item.description !== undefined ? theme.gray(` ${EM_DASH} ${item.description}`) : "";
        lines.push(`  ${marker} ${label}${desc}`);
      }
    }

    if (scroll) {
      const remaining = vis.length - viewOffset - eMax;
      lines.push(remaining > 0 ? `    ${theme.dim(`${TRIANGLE_DOWN} ${remaining} de plus`)}` : "");
    }
    lines.push("", `  ${theme.dim(options.hint ?? DEFAULT_HINT)}`);
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
