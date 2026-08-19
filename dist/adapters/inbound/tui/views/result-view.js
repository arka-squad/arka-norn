import { GUIDED_SHORTCUTS, renderGuidance } from "../components/guidance.js";
export function createResultView(deps) {
    const outputLines = deps.output.replace(/\n$/, "").split("\n");
    const maxVisible = Math.max(3, deps.maxVisibleLines ?? 16);
    let offset = 0;
    let helpVisible = false;
    return {
        onKey(event) {
            if (event.kind === "help") {
                helpVisible = !helpVisible;
                return "consumed";
            }
            if (helpVisible) {
                if (event.kind === "escape")
                    helpVisible = false;
                return "consumed";
            }
            if (event.kind === "enter" || event.kind === "escape" || event.kind === "quit") {
                deps.onBack();
                return "pop";
            }
            if (event.kind === "up")
                offset = Math.max(0, offset - 1);
            if (event.kind === "down")
                offset = Math.min(Math.max(0, outputLines.length - maxVisible), offset + 1);
            return "consumed";
        },
        render(renderer, theme) {
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
                    }, theme))
                        line(value);
                    return;
                }
                line(`  ${theme.bold(deps.title)}`);
                line("");
                const statusLabel = deps.code === 0 ? theme.green("OK") : theme.red(`ÉCHEC (code ${deps.code})`);
                line(`  Statut : ${statusLabel}`);
                line("");
                if (offset > 0)
                    line(`  ${theme.dim(`▲ ${offset} ligne(s) au-dessus`)}`);
                for (const value of outputLines.slice(offset, offset + maxVisible))
                    line(`  ${value}`);
                const remaining = outputLines.length - offset - maxVisible;
                if (remaining > 0)
                    line(`  ${theme.dim(`▼ ${remaining} ligne(s) en dessous`)}`);
                line("");
                line(`  ${theme.bold("Suite")} : ${deps.nextStep ?? (deps.code === 0 ? "revenez à l’écran précédent et poursuivez l’action recommandée" : "corrigez la première erreur, puis relancez la même action")}`);
                line("");
                line(`  ${theme.dim("↑/↓ défiler · ? aide · Entrée / Échap pour revenir")}`);
            });
        },
    };
}
//# sourceMappingURL=result-view.js.map