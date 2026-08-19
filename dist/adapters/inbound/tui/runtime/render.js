/**
 * Render -- buffered string-based frame writer, redraw stable via
 * `ESC[NA ESC[J`. Port TS fidèle de arka-cc-management
 * (adapters/inbound/tui/runtime/render.ts). Pas de diff char-by-char.
 */
import { stringWidth } from "./theme.js";
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
        const truncation = `… ${remaining + 1} ligne(s) masquée(s)`;
        const reserve = remaining > 0 ? physicalRows([truncation], columns) : 0;
        if (used + lineRows + reserve > maximumRows) {
            const omitted = lines.length - index;
            visible.push(`… ${omitted} ligne(s) masquée(s) — utilise les vues scrollables`);
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