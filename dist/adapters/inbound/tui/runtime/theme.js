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
/**
 * Theme — palette ANSI, lifecycle constants, emoji-aware stringWidth. Port
 * TS fidèle de arka-cc-management
 * (adapters/inbound/tui/runtime/theme.ts), sans les constantes lifecycle
 * (bundle-specific, non pertinentes pour arka-norn).
 *
 * Privacy : seuls NO_COLOR/FORCE_COLOR/ARKA_COLOR sont lus.
 */
const ESC = String.fromCharCode(0x1b);
const ANSI_RE = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
export function isWideCodePoint(codePoint) {
    if (codePoint >= 0x1f300 && codePoint <= 0x1faff)
        return true;
    if (codePoint >= 0x2600 && codePoint <= 0x27bf)
        return true;
    if (codePoint >= 0x1100 && codePoint <= 0x115f)
        return true;
    if (codePoint === 0x2329 || codePoint === 0x232a)
        return true;
    if (codePoint >= 0x2e80 && codePoint <= 0xa4cf && codePoint !== 0x303f)
        return true;
    if (codePoint >= 0xac00 && codePoint <= 0xd7a3)
        return true;
    if (codePoint >= 0xf900 && codePoint <= 0xfaff)
        return true;
    if (codePoint >= 0xfe10 && codePoint <= 0xfe19)
        return true;
    if (codePoint >= 0xfe30 && codePoint <= 0xfe6f)
        return true;
    if (codePoint >= 0xff00 && codePoint <= 0xff60)
        return true;
    if (codePoint >= 0xffe0 && codePoint <= 0xffe6)
        return true;
    if (codePoint >= 0x20000 && codePoint <= 0x3fffd)
        return true;
    return false;
}
export function stripAnsi(value) {
    return value.replace(ANSI_RE, "");
}
const COMBINING_MARK_RE = /^\p{Mark}$/u;
const VS15 = String.fromCharCode(0xfe0e);
const VS16 = String.fromCharCode(0xfe0f);
export function stringWidth(value) {
    const plain = stripAnsi(value);
    let width = 0;
    for (const ch of plain) {
        if (ch === VS15 || ch === VS16)
            continue;
        if (COMBINING_MARK_RE.test(ch))
            continue;
        const codePoint = ch.codePointAt(0) ?? 0;
        width += isWideCodePoint(codePoint) ? 2 : 1;
    }
    return width;
}
export function isColorEnabled(env = process.env, isTTY = false) {
    if (env.ARKA_COLOR === "0")
        return false;
    if (env.ARKA_COLOR === "1")
        return true;
    if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== "")
        return true;
    if (env.NO_COLOR !== undefined && env.NO_COLOR !== "")
        return false;
    return isTTY;
}
export function createTheme(env = process.env, isTTY = Boolean(process.stdout.isTTY)) {
    const colorEnabled = isColorEnabled(env, isTTY);
    const wrap = (open, close, value) => {
        if (!colorEnabled)
            return value;
        return `${ESC}[${open}${value}${ESC}[${close}`;
    };
    const rgb = (r, g, b, value) => wrap(`38;2;${r};${g};${b}m`, "39m", value);
    const bgRgb = (r, g, b, value) => wrap(`48;2;${r};${g};${b}m`, "49m", value);
    const green = (s) => wrap("32m", "39m", s);
    const yellow = (s) => wrap("33m", "39m", s);
    const blue = (s) => wrap("34m", "39m", s);
    return {
        colorEnabled,
        bold: (s) => wrap("1m", "22m", s),
        dim: (s) => wrap("2m", "22m", s),
        italic: (s) => wrap("3m", "23m", s),
        underline: (s) => wrap("4m", "24m", s),
        red: (s) => wrap("31m", "39m", s),
        green,
        yellow,
        blue,
        gray: (s) => rgb(106, 114, 130, s),
        arkaRed: (s) => rgb(199, 18, 68, s),
        arkaAccent: (s) => rgb(99, 102, 241, s),
        rgb,
        bgRgb,
        stripAnsi,
        stringWidth,
    };
}
//# sourceMappingURL=theme.js.map