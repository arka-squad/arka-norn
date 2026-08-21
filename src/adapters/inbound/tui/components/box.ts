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
 * Box -- cadres unicode emoji-aware. Port TS verbatim de
 * arka-cc-management (adapters/inbound/tui/components/box.ts) : aucune
 * logique métier, pur rendu, aucune adaptation nécessaire.
 *
 * `box(lines, theme, opts)` encadre `lines`. `titledBox(title, ...)`
 * incruste un titre dans la bordure haute.
 */
import type { Theme } from "../runtime/theme.js";

const TOP_LEFT = String.fromCharCode(0x250c);
const TOP_RIGHT = String.fromCharCode(0x2510);
const BOTTOM_LEFT = String.fromCharCode(0x2514);
const BOTTOM_RIGHT = String.fromCharCode(0x2518);
const HORIZONTAL = String.fromCharCode(0x2500);
const VERTICAL = String.fromCharCode(0x2502);

const IDENTITY: (s: string) => string = (s) => s;

export interface BoxOptions {
  /** Padding horizontal interne (défaut 2). */
  readonly paddingX?: number;
  /** Padding vertical -- lignes vides haut+bas (défaut 0). */
  readonly paddingY?: number;
  /** Couleur/style appliqué à chaque glyphe de bordure. Défaut : identité. */
  readonly border?: (s: string) => string;
}

function padEndVisible(value: string, width: number, stringWidth: Theme["stringWidth"]): string {
  const missing = Math.max(0, width - stringWidth(value));
  return `${value}${" ".repeat(missing)}`;
}

export function box(lines: readonly string[], theme: Theme, options: BoxOptions = {}): string {
  const paddingX = options.paddingX ?? 2;
  const paddingY = options.paddingY ?? 0;
  const border = options.border ?? IDENTITY;

  const contentWidth = lines.reduce((max, line) => Math.max(max, theme.stringWidth(line)), 0);
  const innerWidth = contentWidth + paddingX * 2;

  const top = `${border(TOP_LEFT)}${border(HORIZONTAL.repeat(innerWidth))}${border(TOP_RIGHT)}`;
  const bottom = `${border(BOTTOM_LEFT)}${border(HORIZONTAL.repeat(innerWidth))}${border(BOTTOM_RIGHT)}`;
  const empty = `${border(VERTICAL)}${" ".repeat(innerWidth)}${border(VERTICAL)}`;

  const out: string[] = [top];
  for (let i = 0; i < paddingY; i += 1) out.push(empty);
  for (const line of lines) {
    out.push(
      `${border(VERTICAL)}${" ".repeat(paddingX)}${padEndVisible(line, contentWidth, theme.stringWidth)}${" ".repeat(paddingX)}${border(VERTICAL)}`,
    );
  }
  for (let i = 0; i < paddingY; i += 1) out.push(empty);
  out.push(bottom);
  return out.join("\n");
}

export function titledBox(title: string, lines: readonly string[], theme: Theme, options: BoxOptions = {}): string {
  const paddingX = options.paddingX ?? 2;
  const paddingY = options.paddingY ?? 0;
  const border = options.border ?? IDENTITY;

  const contentWidth = lines.reduce((max, line) => Math.max(max, theme.stringWidth(line)), 0);
  const innerWidthFromContent = contentWidth + paddingX * 2;

  const titlePrefixRaw = `${HORIZONTAL} ${title} `;
  const titleWidth = theme.stringWidth(titlePrefixRaw);
  const innerWidth = Math.max(innerWidthFromContent, titleWidth);
  const contentAreaWidth = innerWidth - paddingX * 2;

  const titlePrefix = `${border(HORIZONTAL)} ${title} `;
  const remainingTop = Math.max(0, innerWidth - theme.stringWidth(titlePrefixRaw));
  const top = `${border(TOP_LEFT)}${titlePrefix}${border(HORIZONTAL.repeat(remainingTop))}${border(TOP_RIGHT)}`;
  const bottom = `${border(BOTTOM_LEFT)}${border(HORIZONTAL.repeat(innerWidth))}${border(BOTTOM_RIGHT)}`;
  const empty = `${border(VERTICAL)}${" ".repeat(innerWidth)}${border(VERTICAL)}`;

  const out: string[] = [top];
  for (let i = 0; i < paddingY; i += 1) out.push(empty);
  for (const line of lines) {
    out.push(
      `${border(VERTICAL)}${" ".repeat(paddingX)}${padEndVisible(line, contentAreaWidth, theme.stringWidth)}${" ".repeat(paddingX)}${border(VERTICAL)}`,
    );
  }
  for (let i = 0; i < paddingY; i += 1) out.push(empty);
  out.push(bottom);
  return out.join("\n");
}
