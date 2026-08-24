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

import type { Theme } from "../runtime/theme.js";
import { translate } from "../../../../application/localization/locale.js";
import { PRODUCT_VERSION } from "../../../../application/product-metadata.js";
import { titledBox } from "./box.js";

const HORIZONTAL = String.fromCharCode(0x2500);

//   'F' -- U+2588 bloc plein
//   'T' -- U+2554 box-drawings double down + right
//   'R' -- U+2557 box-drawings double down + left
//   'L' -- U+255A box-drawings double up + right
//   'J' -- U+255D box-drawings double up + left
//   'H' -- U+2550 box-drawings double horizontal
//   'V' -- U+2551 box-drawings double vertical
const LOGO_GLYPHS: Record<string, string> = {
  F: String.fromCharCode(0x2588),
  T: String.fromCharCode(0x2554),
  R: String.fromCharCode(0x2557),
  L: String.fromCharCode(0x255a),
  J: String.fromCharCode(0x255d),
  H: String.fromCharCode(0x2550),
  V: String.fromCharCode(0x2551),
};

function decodeLogoLine(coded: string): string {
  let out = "";
  for (const ch of coded) {
    out += LOGO_GLYPHS[ch] ?? ch;
  }
  return out;
}

// LOGO ARKALABS original -- 6 lignes, largeur uniforme 66 cellules.
const LOGO_CODED: readonly string[] = [
  "   FFFFFR FFFFFFR FFR  FFR FFFFFR FFR      FFFFFR FFFFFFR FFFFFFFR",
  "  FFTHHFFRFFTHHFFRFFV FFTJFFTHHFFRFFV     FFTHHFFRFFTHHFFRFFTHHHHJ",
  "  FFFFFFFVFFFFFFTJFFFFFTJ FFFFFFFVFFV     FFFFFFFVFFFFFFTJFFFFFFFR",
  "  FFTHHFFVFFTHHFFRFFTHFFR FFTHHFFVFFV     FFTHHFFVFFTHHFFRLHHHHFFV",
  "  FFV  FFVFFV  FFVFFV  FFRFFV  FFVFFFFFFFRFFV  FFVFFFFFFTJFFFFFFFV",
  "  LHJ  LHJLHJ  LHJLHJ  LHJLHJ  LHJLHHHHHHJLHJ  LHJLHHHHHJ LHHHHHHJ",
];

export const ARKA_LOGO: readonly string[] = Object.freeze(LOGO_CODED.map(decodeLogoLine));

export interface ArkaHeaderOptions {
  readonly version?: string;
  readonly tagline?: string;
  readonly runtimeLabel?: string;
}

export function renderArkaHeader(theme: Theme, opts: ArkaHeaderOptions = {}): readonly string[] {
  const version = opts.version ?? PRODUCT_VERSION;
  const tagline = opts.tagline ?? translate("tui.brand.tagline");
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

export interface ArkaBannerOptions {
  readonly version?: string;
  readonly section?: string;
}

export function renderArkaBanner(theme: Theme, opts: ArkaBannerOptions = {}): readonly string[] {
  const version = opts.version ?? PRODUCT_VERSION;
  const sectionPart = opts.section ? ` ${theme.dim(">")} ${theme.bold(opts.section)}` : "";
  const line = `  ${theme.dim("arkalabs")} ${theme.dim("-")} ${theme.bold("arka-norn")} ${theme.gray(`v${version}`)}${sectionPart}`;
  const rule = `  ${theme.dim(HORIZONTAL.repeat(40))}`;
  return [line, rule];
}

export interface ContextInfo {
  readonly runtime: string;
  readonly root: string;
  readonly project?: { readonly name: string };
  readonly feature?: { readonly name: string };
  readonly agent?: { readonly id: string };
}

export function renderContextBanner(ctx: ContextInfo, theme: Theme): readonly string[] {
  const lines: string[] = [];
  lines.push(`${theme.dim(translate("tui.context.runtime"))} ${ctx.runtime}`);
  lines.push(`${theme.dim(translate("tui.context.root"))} ${ctx.root}`);
  if (ctx.project !== undefined) {
    lines.push(`${theme.dim("Project :")} ${ctx.project.name}`);
  }
  if (ctx.feature !== undefined) {
    lines.push(`${theme.dim("Feature :")} ${ctx.feature.name}`);
  }
  if (ctx.agent !== undefined) {
    lines.push(`${theme.dim("Agent   :")} ${ctx.agent.id}`);
  }
  const titleSuffix =
    ctx.feature !== undefined
      ? `Feature : ${ctx.feature.name}`
      : ctx.project !== undefined
        ? `Project : ${ctx.project.name}`
        : undefined;
  const title = titleSuffix !== undefined ? `${theme.bold("arka-norn")} ${theme.dim("-")} ${theme.bold(titleSuffix)}` : theme.bold("arka-norn");
  return titledBox(title, lines, theme, { paddingX: 1, border: theme.dim }).split("\n");
}
