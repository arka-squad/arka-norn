/**
 * Render -- buffered string-based frame writer, redraw stable via
 * `ESC[NA ESC[J`. Port TS fidèle de arka-cc-management
 * (adapters/inbound/tui/runtime/render.ts). Pas de diff char-by-char.
 */
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
        const maximum = terminalRows !== undefined && terminalRows > 2 ? terminalRows - 1 : buffer.length;
        const visible = buffer.length > maximum
            ? [...buffer.slice(0, Math.max(1, maximum - 1)), `… ${buffer.length - maximum + 1} ligne(s) masquée(s) — utilise les vues scrollables`]
            : buffer;
        stream.write(`${visible.join("\n")}\n`);
        lastLines = visible.length;
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
//# sourceMappingURL=render.js.map