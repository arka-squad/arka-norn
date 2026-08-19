export function createResultView(deps) {
    const outputLines = deps.output.replace(/\n$/, "").split("\n");
    const maxVisible = Math.max(3, deps.maxVisibleLines ?? 16);
    let offset = 0;
    return {
        onKey(event) {
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
                line(`  ${theme.dim("↑/↓ défiler · Entrée / Échap pour revenir")}`);
            });
        },
    };
}
//# sourceMappingURL=result-view.js.map