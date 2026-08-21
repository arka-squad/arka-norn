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
import { titledBox } from "./box.js";
const HORIZONTAL = String.fromCharCode(0x2500);
// LOGO glyph codes -- mapping compact conservé ASCII-pur à la source.
// Décodé via `decodeLogoLine` à l'init du module.
//   ' ' -- espace (inchangé)
//   'F' -- U+2588 bloc plein
//   'T' -- U+2554 box-drawings double down + right
//   'R' -- U+2557 box-drawings double down + left
//   'L' -- U+255A box-drawings double up + right
//   'J' -- U+255D box-drawings double up + left
//   'H' -- U+2550 box-drawings double horizontal
//   'V' -- U+2551 box-drawings double vertical
const LOGO_GLYPHS = {
    F: String.fromCharCode(0x2588),
    T: String.fromCharCode(0x2554),
    R: String.fromCharCode(0x2557),
    L: String.fromCharCode(0x255a),
    J: String.fromCharCode(0x255d),
    H: String.fromCharCode(0x2550),
    V: String.fromCharCode(0x2551),
};
function decodeLogoLine(coded) {
    let out = "";
    for (const ch of coded) {
        out += LOGO_GLYPHS[ch] ?? ch;
    }
    return out;
}
// LOGO ARKALABS original -- 6 lignes, largeur uniforme 66 cellules.
// Mapping repris octet pour octet de la source (vérifié via stringWidth).
const LOGO_CODED = [
    "   FFFFFR FFFFFFR FFR  FFR FFFFFR FFR      FFFFFR FFFFFFR FFFFFFFR",
    "  FFTHHFFRFFTHHFFRFFV FFTJFFTHHFFRFFV     FFTHHFFRFFTHHFFRFFTHHHHJ",
    "  FFFFFFFVFFFFFFTJFFFFFTJ FFFFFFFVFFV     FFFFFFFVFFFFFFTJFFFFFFFR",
    "  FFTHHFFVFFTHHFFRFFTHFFR FFTHHFFVFFV     FFTHHFFVFFTHHFFRLHHHHFFV",
    "  FFV  FFVFFV  FFVFFV  FFRFFV  FFVFFFFFFFRFFV  FFVFFFFFFTJFFFFFFFV",
    "  LHJ  LHJLHJ  LHJLHJ  LHJLHJ  LHJLHHHHHHJLHJ  LHJLHHHHHJ LHHHHHHJ",
];
export const ARKA_LOGO = Object.freeze(LOGO_CODED.map(decodeLogoLine));
/**
 * Header pleine page -- LOGO + ligne de marque + tagline. Affiché au
 * démarrage de la TUI (chrome persistant, cf. tui-app.ts).
 */
export function renderArkaHeader(theme, opts = {}) {
    const version = opts.version ?? "1.2.0";
    const tagline = opts.tagline ?? "Framework méthodologique multiprovider";
    const runtimeLabel = opts.runtimeLabel ?? "";
    const runtimePart = runtimeLabel ? ` ${theme.dim("-")} ${theme.arkaAccent(runtimeLabel)}` : "";
    return [
        ...ARKA_LOGO.map((line) => theme.arkaRed(line)),
        "",
        `${theme.dim("arkalabs")} ${theme.dim("-")} ${theme.bold("arka-norn")} ${theme.gray(`v${version}`)}${runtimePart}`,
        theme.gray(tagline),
        "",
    ];
}
/** Bandeau compact -- en-tête de sous-vues secondaires. */
export function renderArkaBanner(theme, opts = {}) {
    const version = opts.version ?? "1.2.0";
    const sectionPart = opts.section ? ` ${theme.dim(">")} ${theme.bold(opts.section)}` : "";
    const line = `  ${theme.dim("arkalabs")} ${theme.dim("-")} ${theme.bold("arka-norn")} ${theme.gray(`v${version}`)}${sectionPart}`;
    const rule = `  ${theme.dim(HORIZONTAL.repeat(40))}`;
    return [line, rule];
}
/** Encadré haut d'écran -- runtime + racine + Project/Feature actifs éventuels. */
export function renderContextBanner(ctx, theme) {
    const lines = [];
    lines.push(`${theme.dim("Runtime :")} ${ctx.runtime}`);
    lines.push(`${theme.dim("Racine  :")} ${ctx.root}`);
    if (ctx.project !== undefined) {
        lines.push(`${theme.dim("Project :")} ${ctx.project.name}`);
    }
    if (ctx.feature !== undefined) {
        lines.push(`${theme.dim("Feature :")} ${ctx.feature.name}`);
    }
    if (ctx.agent !== undefined) {
        lines.push(`${theme.dim("Agent   :")} ${ctx.agent.id}`);
    }
    const titleSuffix = ctx.feature !== undefined
        ? `Feature : ${ctx.feature.name}`
        : ctx.project !== undefined
            ? `Project : ${ctx.project.name}`
            : undefined;
    const title = titleSuffix !== undefined ? `${theme.bold("arka-norn")} ${theme.dim("-")} ${theme.bold(titleSuffix)}` : theme.bold("arka-norn");
    return titledBox(title, lines, theme, { paddingX: 1, border: theme.dim }).split("\n");
}
//# sourceMappingURL=banner.js.map