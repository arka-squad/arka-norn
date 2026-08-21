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
const ANGLE_RIGHT = String.fromCharCode(0x276f);
const TRIANGLE_UP = String.fromCharCode(0x25b2);
const TRIANGLE_DOWN = String.fromCharCode(0x25bc);
const EM_DASH = String.fromCharCode(0x2014);
const DEFAULT_HINT = "Flèches naviguer, Enter sélectionner, / filtrer, q quitter";
export function filterItems(items, text, stripAnsi) {
    if (text === "")
        return items.map((item, i) => ({ ...item, _origIndex: i }));
    const lower = text.toLowerCase();
    return items
        .map((item, i) => ({ ...item, _origIndex: i }))
        .filter((item) => {
        const haystack = `${stripAnsi(item.label)} ${item.description ?? ""}`.toLowerCase();
        return haystack.includes(lower);
    });
}
export function createMenuScene(items, options) {
    const maxVisible = options.maxVisible ?? 0;
    let cursor = 0;
    let viewOffset = 0;
    let filterMode = false;
    let filterText = "";
    let filtered = items.map((it, i) => ({ ...it, _origIndex: i }));
    function visible() {
        return filterMode ? filtered : items;
    }
    function effectiveMax() {
        const vis = visible();
        return maxVisible > 0 && maxVisible < vis.length ? maxVisible : vis.length;
    }
    function needsScroll() {
        return visible().length > effectiveMax();
    }
    function adjustViewport() {
        const vis = visible();
        const eMax = effectiveMax();
        if (vis.length === 0) {
            viewOffset = 0;
            return;
        }
        if (cursor < viewOffset)
            viewOffset = cursor;
        if (cursor >= viewOffset + eMax)
            viewOffset = cursor - eMax + 1;
    }
    function applyFilter(stripAnsi) {
        filtered = filterItems(items, filterText, stripAnsi);
        cursor = 0;
        viewOffset = 0;
    }
    function moveUp() {
        const vis = visible();
        if (vis.length === 0)
            return;
        cursor = (cursor - 1 + vis.length) % vis.length;
        adjustViewport();
    }
    function moveDown() {
        const vis = visible();
        if (vis.length === 0)
            return;
        cursor = (cursor + 1) % vis.length;
        adjustViewport();
    }
    function selectCurrent() {
        const vis = visible();
        if (vis.length === 0)
            return;
        const item = vis[cursor];
        if (item === undefined)
            return;
        options.onSelect(item.value);
    }
    function exitFilter() {
        filterMode = false;
        filterText = "";
        filtered = items.map((it, i) => ({ ...it, _origIndex: i }));
        cursor = 0;
        viewOffset = 0;
    }
    function handleFilterMode(event, stripAnsi) {
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
    function handleNormalMode(event) {
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
    function renderLines(theme) {
        if (filterMode) {
            filtered = filterItems(items, filterText, theme.stripAnsi);
            if (cursor >= filtered.length)
                cursor = Math.max(0, filtered.length - 1);
        }
        const lines = [];
        if (options.title !== undefined) {
            lines.push(`  ${theme.bold(options.title)}`, "");
        }
        const vis = visible();
        const eMax = effectiveMax();
        const scroll = needsScroll();
        if (scroll)
            lines.push(viewOffset > 0 ? `    ${theme.dim(`${TRIANGLE_UP} ${viewOffset} de plus`)}` : "");
        if (vis.length === 0) {
            for (let index = 0; index < Math.max(eMax, 1); index++)
                lines.push(index === 0 ? `    ${theme.dim("(aucun résultat)")}` : "");
        }
        else {
            for (let index = 0; index < eMax; index++) {
                const realIndex = viewOffset + index;
                const item = vis[realIndex];
                if (item === undefined) {
                    lines.push("");
                    continue;
                }
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
        if (filterMode)
            lines.push(`  ${theme.arkaAccent("/")} ${filterText}${theme.dim("_")}`);
        return lines;
    }
    return {
        onKey(event) {
            const noStrip = (s) => s;
            if (filterMode)
                return handleFilterMode(event, noStrip);
            return handleNormalMode(event);
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                for (const value of renderLines(theme))
                    line(value);
            });
        },
        renderLines,
        get cursor() {
            return cursor;
        },
        get filterMode() {
            return filterMode;
        },
        get filterText() {
            return filterText;
        },
        get visibleCount() {
            return visible().length;
        },
    };
}
//# sourceMappingURL=menu.js.map