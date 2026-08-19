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

export interface ResultViewDeps {
  readonly title: string;
  readonly code: number;
  readonly output: string;
  readonly onBack: () => void;
  readonly maxVisibleLines?: number;
}

export type ResultView = Scene;

export function createResultView(deps: ResultViewDeps): ResultView {
  const outputLines = deps.output.replace(/\n$/, "").split("\n");
  const maxVisible = Math.max(3, deps.maxVisibleLines ?? 16);
  let offset = 0;

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
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
        line(`  ${theme.dim("↑/↓ défiler · Entrée / Échap pour revenir")}`);
      });
    },
  };
}
