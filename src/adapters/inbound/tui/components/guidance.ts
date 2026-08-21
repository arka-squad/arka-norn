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
import { titledBox } from "./box.js";

export interface GuidanceContent {
  readonly title: string;
  readonly purpose: string;
  readonly steps: readonly string[];
  readonly shortcuts?: readonly string[];
}

export function renderGuidance(content: GuidanceContent, theme: Theme): readonly string[] {
  const lines = [
    content.purpose,
    "",
    ...content.steps.map((step, index) => `${index + 1}. ${step}`),
    ...(content.shortcuts === undefined ? [] : ["", "Raccourcis", ...content.shortcuts.map((shortcut) => `• ${shortcut}`)]),
    "",
    "Appuyez sur ? pour fermer l’aide.",
  ];
  return titledBox(content.title, lines, theme, { border: theme.arkaRed }).split("\n");
}

export function nextActionLine(action: string, reason: string, theme: Theme): string {
  return `  ${theme.bold("Action recommandée")} : ${theme.arkaAccent(action)} ${theme.gray(`— ${reason}`)}`;
}

export const GUIDED_SHORTCUTS = [
  "↑/↓ : déplacer la sélection",
  "Entrée : exécuter l’action sélectionnée",
  "/ : filtrer la liste",
  "Échap : revenir sans modifier",
  "? : afficher ou fermer cette aide",
] as const;
