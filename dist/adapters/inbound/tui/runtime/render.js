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
import { stringWidth } from "./theme.js";
import { translate } from "../../../../application/localization/locale.js";
const ESC = String.fromCharCode(0x1b);
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const CLEAR_FROM_CURSOR_DOWN = `${ESC}[J`;
function cursorUp(n) {
    if (n <= 0)
        return "";
    return `${ESC}[${n}A`;
}
export function createRenderer(stream, options = {}) {
    const isTTY = Boolean(stream.isTTY);
    const hideCursor = options.hideCursor ?? isTTY;
    let buffer = [];
    let lastLines = 0;
    let cursorHidden = false;
    let destroyed = false;
    function ensureCursorHidden() {
        if (!hideCursor || cursorHidden)
            return;
        stream.write(CURSOR_HIDE);
        cursorHidden = true;
    }
    function emitFrame() {
        if (buffer.length === 0) {
            lastLines = 0;
            return;
        }
        const terminalRows = isTTY ? stream.rows : undefined;
        const maximum = terminalRows !== undefined && terminalRows > 2 ? terminalRows - 1 : undefined;
        const visible = maximum === undefined ? buffer : fitFrame(buffer, maximum, stream.columns);
        stream.write(`${visible.join("\n")}\n`);
        lastLines = physicalRows(visible, stream.columns);
    }
    function rewindAndClear() {
        if (lastLines === 0)
            return;
        if (!isTTY)
            return;
        stream.write(`${cursorUp(lastLines)}${CLEAR_FROM_CURSOR_DOWN}`);
    }
    return {
        begin() {
            if (destroyed)
                return;
            buffer = [];
        },
        line(s) {
            if (destroyed)
                return;
            buffer.push(s);
        },
        commit() {
            if (destroyed)
                return;
            ensureCursorHidden();
            emitFrame();
        },
        redraw(fn) {
            if (destroyed)
                return;
            ensureCursorHidden();
            rewindAndClear();
            buffer = [];
            fn((s) => buffer.push(s));
            emitFrame();
        },
        destroy() {
            if (destroyed)
                return;
            destroyed = true;
            rewindAndClear();
            lastLines = 0;
            if (cursorHidden) {
                stream.write(CURSOR_SHOW);
                cursorHidden = false;
            }
        },
        get lastFrameLines() {
            return lastLines;
        },
    };
}
function fitFrame(lines, maximumRows, columns) {
    const visible = [];
    let used = 0;
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        const lineRows = physicalRows([line], columns);
        const remaining = lines.length - index - 1;
        const truncation = translate("tui.render.hidden", { count: remaining + 1 });
        const reserve = remaining > 0 ? physicalRows([truncation], columns) : 0;
        if (used + lineRows + reserve > maximumRows) {
            const omitted = lines.length - index;
            visible.push(translate("tui.render.hiddenScrollable", { count: omitted }));
            return visible;
        }
        visible.push(line);
        used += lineRows;
    }
    return visible;
}
function physicalRows(lines, columns) {
    if (columns === undefined || columns <= 0)
        return lines.length;
    return lines.reduce((total, line) => total + Math.max(1, Math.ceil(stringWidth(line) / columns)), 0);
}
//# sourceMappingURL=render.js.map