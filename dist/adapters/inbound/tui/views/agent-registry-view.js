import { titledBox } from "../components/box.js";
import { GUIDED_SHORTCUTS, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene } from "../components/menu.js";
export function createAgentRegistryView(deps) {
    let helpVisible = false;
    const activeCount = deps.agents.filter((agent) => agent.active).length;
    const items = [
        { label: "Enregistrer mon identité", value: "action:register", description: "crée Provider_role_YYYYMMDD et le sélectionne" },
        ...[...deps.agents].sort((left, right) => Number(right.active) - Number(left.active) || left.id.value.localeCompare(right.id.value)).map((agent) => ({
            label: `${agent.active ? "●" : "○"} ${agent.id.value}${agent.id.value === deps.currentAgentId ? " (courant)" : ""}`,
            value: `agent:${agent.id.value}`,
            description: `${agent.provider}/${agent.role} · ${scopeLabel(agent)}`,
        })),
        { label: "← Retour au Project", value: "action:back" },
    ];
    const menu = createMenuScene(items, {
        title: "Actions",
        hint: "↑/↓ naviguer · Entrée ouvrir · / filtrer · ? aide · Échap retour",
        maxVisible: 12,
        onSelect(value) {
            if (value === "action:register")
                void deps.onRegister();
            else if (value === "action:back")
                deps.onBack();
            else {
                const agent = deps.agents.find((candidate) => candidate.id.value === value.slice("agent:".length));
                if (agent !== undefined)
                    void deps.onOpenAgent(agent);
            }
        },
    });
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
            if (event.kind === "escape") {
                deps.onBack();
                return "consumed";
            }
            return menu.onKey(event);
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                if (helpVisible) {
                    for (const value of renderGuidance({
                        title: "Aide — registre Agents",
                        purpose: "Le registre rend chaque intervention attribuable et borne ce que l’agent est autorisé à produire.",
                        steps: [
                            "Enregistrez une identité si aucune ligne active ne vous correspond.",
                            "Ouvrez une identité pour voir son périmètre, la sélectionner, la remplacer ou la désactiver.",
                            "Un document v3 ne peut être généré qu’avec l’agent courant actif.",
                            "Remplacez un agent au lieu de réutiliser son identité : l’historique reste lisible.",
                        ],
                        shortcuts: GUIDED_SHORTCUTS,
                    }, theme))
                        line(value);
                    return;
                }
                for (const value of titledBox("Registre Agents", [
                    `Project : ${deps.project.name} (${deps.project.id.value})`,
                    `Agents : ${activeCount} actif(s) · ${deps.agents.length - activeCount} inactif(s)`,
                    `Identité courante : ${deps.currentAgentId ?? "aucune — requise avant tout scaffold"}`,
                    `Source portable : ${deps.project.root}/.arka-norn/agents.json`,
                ], theme, { border: theme.arkaRed }).split("\n"))
                    line(value);
                line("");
                line(nextActionLine(deps.currentAgentId === undefined ? "Enregistrer mon identité" : "Ouvrir l’agent courant", deps.currentAgentId === undefined ? "aucun auteur n’est sélectionné" : "vérifier son périmètre avant de produire", theme));
                for (const value of menu.renderLines(theme))
                    line(value);
            });
        },
    };
}
function scopeLabel(agent) {
    if (agent.scope.featureIds.length === 0 && agent.scope.paths.length === 0)
        return "tout le Project";
    return [
        agent.scope.featureIds.length === 0 ? undefined : `${agent.scope.featureIds.length} feature(s)`,
        agent.scope.paths.length === 0 ? undefined : `${agent.scope.paths.length} chemin(s)`,
    ].filter((value) => value !== undefined).join(" · ");
}
//# sourceMappingURL=agent-registry-view.js.map