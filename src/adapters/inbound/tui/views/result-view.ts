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
 * ResultView -- affiche la sortie capturée d'une commande CLI, code de
 * sortie en tête (vert si 0, rouge sinon). Entrée/Échap/q ferme.
 *
 * Scene feuille : ne pousse jamais rien pendant son `onKey`, donc son
 * propre retour `'pop'` suffit et est sûr. `onBack` ne doit PAS appeler
 * `app.pop()` lui-même (double-pop -- cf. menu.ts en tête de fichier) ;
 * il ne sert qu'à notifier l'appelant (ex: effacer un statut affiché
 * derrière), jamais à manipuler la pile.
 */
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";
import { GUIDED_SHORTCUTS, renderGuidance } from "../components/guidance.js";

export interface ResultViewDeps {
  readonly title: string;
  readonly code: number;
  readonly output: string;
  readonly onBack: () => void;
  readonly maxVisibleLines?: number;
  readonly nextStep?: string;
}

export type ResultView = Scene;

export function createResultView(deps: ResultViewDeps): ResultView {
  const outputLines = deps.output.replace(/\n$/, "").split("\n");
  const maxVisible = Math.max(3, deps.maxVisibleLines ?? 16);
  let offset = 0;
  let helpVisible = false;

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (event.kind === "help") {
        helpVisible = !helpVisible;
        return "consumed";
      }
      if (helpVisible) {
        if (event.kind === "escape") helpVisible = false;
        return "consumed";
      }
      if (event.kind === "enter" || event.kind === "escape" || event.kind === "quit") {
        deps.onBack();
        return "pop";
      }
      if (event.kind === "up") offset = Math.max(0, offset - 1);
      if (event.kind === "down") offset = Math.min(Math.max(0, outputLines.length - maxVisible), offset + 1);
      return "consumed";
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        if (helpVisible) {
          for (const value of renderGuidance({
            title: `Aide — ${deps.title}`,
            purpose: "Cet écran présente le résultat réel de l’action précédente. Le code et le détail déterminent la suite.",
            steps: [
              "OK signifie que l’action technique s’est terminée ; lisez tout de même la suite recommandée.",
              "ÉCHEC signifie qu’aucune réussite ne doit être supposée ; corrigez la première cause affichée.",
              "Utilisez ↑/↓ si la sortie dépasse l’écran, puis revenez avec Entrée ou Échap.",
            ],
            shortcuts: GUIDED_SHORTCUTS,
          }, theme)) line(value);
          return;
        }
        line(`  ${theme.bold(deps.title)}`);
        line("");
        const statusLabel = deps.code === 0 ? theme.green("OK") : theme.red(`ÉCHEC (code ${deps.code})`);
        line(`  Statut : ${statusLabel}`);
        line("");
        if (offset > 0) line(`  ${theme.dim(`▲ ${offset} ligne(s) au-dessus`)}`);
        for (const value of outputLines.slice(offset, offset + maxVisible)) line(`  ${value}`);
        const remaining = outputLines.length - offset - maxVisible;
        if (remaining > 0) line(`  ${theme.dim(`▼ ${remaining} ligne(s) en dessous`)}`);
        line("");
        line(`  ${theme.bold("Suite")} : ${deps.nextStep ?? (deps.code === 0 ? "revenez à l’écran précédent et poursuivez l’action recommandée" : "corrigez la première erreur, puis relancez la même action")}`);
        line("");
        line(`  ${theme.dim("↑/↓ défiler · ? aide · Entrée / Échap pour revenir")}`);
      });
    },
  };
}
