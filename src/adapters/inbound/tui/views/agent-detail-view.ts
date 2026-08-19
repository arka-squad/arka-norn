import type { AgentRegistration } from "../../../../domain/agent/agent.js";
import { titledBox } from "../components/box.js";
import { GUIDED_SHORTCUTS, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";

type AgentDetailAction = "action:select" | "action:replace" | "action:deactivate" | "action:back";

export interface AgentDetailViewDeps {
  readonly agent: AgentRegistration;
  readonly current: boolean;
  readonly onSelect: () => Promise<void> | void;
  readonly onReplace: () => Promise<void> | void;
  readonly onDeactivate: () => Promise<void> | void;
  readonly onBack: () => void;
}

export function createAgentDetailView(deps: AgentDetailViewDeps): Scene {
  let helpVisible = false;
  const items = [
    ...(deps.agent.active && !deps.current ? [{ label: "Utiliser cette identité", value: "action:select" as const, description: "devient l’auteur des prochains documents" }] : []),
    ...(deps.agent.active ? [{ label: "Remplacer cet agent", value: "action:replace" as const, description: "crée un successeur et désactive celui-ci" }] : []),
    ...(deps.agent.active ? [{ label: "Désactiver sans remplaçant", value: "action:deactivate" as const, description: "interdit toute nouvelle production avec cet ID" }] : []),
    { label: "← Retour au registre", value: "action:back" as const },
  ];
  const menu = createMenuScene<AgentDetailAction>(items, {
    hint: "↑/↓ naviguer · Entrée agir · ? aide · Échap retour",
    onSelect(value) {
      if (value === "action:select") void deps.onSelect();
      else if (value === "action:replace") void deps.onReplace();
      else if (value === "action:deactivate") void deps.onDeactivate();
      else deps.onBack();
    },
  });
  return {
    onKey(event: KeyEvent) {
      if (event.kind === "help") {
        helpVisible = !helpVisible;
        return "consumed";
      }
      if (helpVisible) {
        if (event.kind === "escape") helpVisible = false;
        return "consumed";
      }
      if (event.kind === "escape") {
        deps.onBack();
        return "consumed";
      }
      return menu.onKey(event);
    },
    render(renderer: Renderer, theme: Theme) {
      renderer.redraw((line) => {
        if (helpVisible) {
          for (const value of renderGuidance({
            title: "Aide — identité Agent",
            purpose: "Une identité reste immuable. Les transitions explicites conservent l’historique.",
            steps: [
              "Utiliser sélectionne un agent actif pour les prochains scaffolds.",
              "Remplacer crée un nouvel ID, désactive l’ancien et relie les deux entrées.",
              "Désactiver bloque l’identité sans créer de successeur.",
              "Les documents déjà signés gardent toujours leur author_agent_id d’origine.",
            ],
            shortcuts: GUIDED_SHORTCUTS,
          }, theme)) line(value);
          return;
        }
        const agent = deps.agent;
        for (const value of titledBox(agent.id.value, [
          `État : ${agent.active ? "ACTIF" : "INACTIF"}${deps.current ? " · identité courante" : ""}`,
          `Provider / rôle : ${agent.provider} / ${agent.role}`,
          `Project : ${agent.scope.projectId.value}`,
          `Features : ${agent.scope.featureIds.map((id) => id.value).join(", ") || "toutes"}`,
          `Chemins : ${agent.scope.paths.join(", ") || "tous"}`,
          `Responsabilités : ${agent.scope.responsibilities.join(" · ") || "non précisées"}`,
          `Enregistré : ${agent.registeredAt.toISOString()}`,
          ...(agent.replacesAgentId === undefined ? [] : [`Remplace : ${agent.replacesAgentId.value}`]),
          ...(agent.replacedByAgentId === undefined ? [] : [`Remplacé par : ${agent.replacedByAgentId.value}`]),
        ], theme, { border: agent.active ? theme.arkaRed : theme.gray }).split("\n")) line(value);
        line("");
        line(nextActionLine(
          !agent.active ? "Retour au registre" : deps.current ? "Vérifier le périmètre" : "Utiliser cette identité",
          !agent.active ? "une identité inactive est conservée uniquement pour l’historique" : "ne produisez que dans le scope déclaré",
          theme,
        ));
        for (const value of menu.renderLines(theme)) line(value);
      });
    },
  };
}
