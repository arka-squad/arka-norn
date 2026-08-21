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

import type { AgentRegistration } from "../../../../domain/agent/agent.js";
import type { Project } from "../../../../domain/project/project.js";
import { titledBox } from "../components/box.js";
import { GUIDED_SHORTCUTS, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";

type AgentRegistryAction = "action:register" | "action:back" | `agent:${string}`;

export interface AgentRegistryViewDeps {
  readonly project: Project;
  readonly agents: readonly AgentRegistration[];
  readonly currentAgentId?: string;
  readonly sessionId?: string;
  readonly sessionBindings?: readonly { readonly sessionId: string; readonly agentId: string }[];
  readonly onRegister: () => Promise<void> | void;
  readonly onOpenAgent: (agent: AgentRegistration) => Promise<void> | void;
  readonly onBack: () => void;
}

export function createAgentRegistryView(deps: AgentRegistryViewDeps): Scene {
  let helpVisible = false;
  const activeCount = deps.agents.filter((agent) => agent.active).length;
  const mainSession = (deps.sessionId ?? "main") === "main";
  const items: readonly MenuItem<AgentRegistryAction>[] = [
    { label: mainSession ? "Enregistrer le Product principal" : "Enregistrer mon identité spécialisée", value: "action:register", description: mainSession ? "crée Provider_product_YYYYMMDD dans la session main" : "crée Provider_role_YYYYMMDD dans cette session isolée" },
    ...[...deps.agents].sort((left, right) => Number(right.active) - Number(left.active) || left.id.value.localeCompare(right.id.value)).map((agent) => ({
      label: `${agent.active ? "●" : "○"} ${agent.id.value}${agent.id.value === deps.currentAgentId ? " (courant)" : ""}`,
      value: `agent:${agent.id.value}` as const,
      description: `${agent.provider}/${agent.role} · ${scopeLabel(agent)}`,
    })),
    { label: "← Retour au Project", value: "action:back" },
  ];
  const menu: MenuScene = createMenuScene(items, {
    title: "Actions",
    hint: "↑/↓ naviguer · Entrée ouvrir · / filtrer · ? aide · Échap retour",
    maxVisible: 12,
    onSelect(value) {
      if (value === "action:register") void deps.onRegister();
      else if (value === "action:back") deps.onBack();
      else {
        const agent = deps.agents.find((candidate) => candidate.id.value === value.slice("agent:".length));
        if (agent !== undefined) void deps.onOpenAgent(agent);
      }
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
            title: "Aide — registre Agents",
            purpose: "Le registre rend chaque intervention attribuable et borne ce que l’agent est autorisé à produire.",
            steps: [
              mainSession ? "La session main appartient au Product principal ; enregistrez cette identité une seule fois." : "Enregistrez une identité spécialisée si aucune ligne active ne correspond à cette session.",
              "Ouvrez une identité pour voir son périmètre, la sélectionner, la remplacer ou la désactiver.",
              "Un document v3 ne peut être généré qu’avec l’agent courant actif.",
              "Remplacez un agent au lieu de réutiliser son identité : l’historique reste lisible.",
            ],
            shortcuts: GUIDED_SHORTCUTS,
          }, theme)) line(value);
          return;
        }
        for (const value of titledBox("Registre Agents", [
          `Project : ${deps.project.name} (${deps.project.id.value})`,
          `Agents : ${activeCount} actif(s) · ${deps.agents.length - activeCount} inactif(s)`,
          `Session courante : ${deps.sessionId ?? "main"}`,
          `Identité de cette session : ${deps.currentAgentId ?? "aucune — requise avant tout scaffold"}`,
          `Sessions liées : ${deps.sessionBindings?.map((binding) => `${binding.sessionId}=${binding.agentId}`).join(" · ") || "aucune"}`,
          `Source portable : ${deps.project.root}/.arka-norn/agents.json`,
        ], theme, { border: theme.arkaRed }).split("\n")) line(value);
        line("");
        line(nextActionLine(
          deps.currentAgentId === undefined ? mainSession ? "Enregistrer le Product principal" : "Enregistrer mon identité spécialisée" : "Ouvrir l’agent courant",
          deps.currentAgentId === undefined ? "aucun auteur n’est sélectionné" : "vérifier son périmètre avant de produire",
          theme,
        ));
        for (const value of menu.renderLines(theme)) line(value);
      });
    },
  };
}

function scopeLabel(agent: AgentRegistration): string {
  if (agent.scope.featureIds.length === 0 && agent.scope.paths.length === 0) return "tout le Project";
  return [
    agent.scope.featureIds.length === 0 ? undefined : `${agent.scope.featureIds.length} feature(s)`,
    agent.scope.paths.length === 0 ? undefined : `${agent.scope.paths.length} chemin(s)`,
  ].filter((value): value is string => value !== undefined).join(" · ");
}
