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
import { guidedShortcuts, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";
import { formatNumber, translate } from "../../../../application/localization/locale.js";

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
    { label: translate(mainSession ? "tui.registry.registerProduct" : "tui.registry.registerSpecialist"), value: "action:register", description: translate(mainSession ? "tui.registry.registerProductDescription" : "tui.registry.registerSpecialistDescription") },
    ...[...deps.agents].sort((left, right) => Number(right.active) - Number(left.active) || left.id.value.localeCompare(right.id.value)).map((agent) => ({
      label: `${agent.active ? "●" : "○"} ${agent.id.value}${agent.id.value === deps.currentAgentId ? ` (${translate("tui.registry.current")})` : ""}`,
      value: `agent:${agent.id.value}` as const,
      description: `${agent.provider}/${agent.role} - ${scopeLabel(agent)}`,
    })),
    { label: `<- ${translate("tui.registry.back")}`, value: "action:back" },
  ];
  const menu: MenuScene = createMenuScene(items, {
    title: translate("tui.registry.actions"),
    hint: translate("tui.project.menu.hint"),
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
            title: translate("tui.registry.help.title"),
            purpose: translate("tui.registry.help.purpose"),
            steps: [
              translate(mainSession ? "tui.registry.help.stepMain" : "tui.registry.help.stepSpecialist"),
              translate("tui.registry.help.step2"),
              translate("tui.registry.help.step3"),
              translate("tui.registry.help.step4"),
            ],
            shortcuts: guidedShortcuts(),
          }, theme)) line(value);
          return;
        }
        for (const value of titledBox(translate("tui.registry.title"), [
          `Project : ${deps.project.name} (${deps.project.id.value})`,
          translate("tui.registry.agents", { active: formatNumber(activeCount), inactive: formatNumber(deps.agents.length - activeCount) }),
          translate("tui.registry.currentSession", { session: deps.sessionId ?? "main" }),
          translate("tui.registry.sessionIdentity", { agent: deps.currentAgentId ?? translate("tui.registry.noIdentity") }),
          translate("tui.registry.bindings", { bindings: deps.sessionBindings?.map((binding) => `${binding.sessionId}=${binding.agentId}`).join(" - ") || translate("tui.registry.noBindings") }),
          translate("tui.registry.portableSource", { path: `${deps.project.root}/.arka-norn/agents.json` }),
        ], theme, { border: theme.arkaRed }).split("\n")) line(value);
        line("");
        line(nextActionLine(
          translate(deps.currentAgentId === undefined ? mainSession ? "tui.registry.registerProduct" : "tui.registry.registerSpecialist" : "tui.registry.openCurrent"),
          translate(deps.currentAgentId === undefined ? "tui.registry.noAuthorReason" : "tui.registry.scopeReason"),
          theme,
        ));
        for (const value of menu.renderLines(theme)) line(value);
      });
    },
  };
}

function scopeLabel(agent: AgentRegistration): string {
  if (agent.scope.featureIds.length === 0 && agent.scope.paths.length === 0) return translate("tui.registry.scope.project");
  return [
    agent.scope.featureIds.length === 0 ? undefined : translate("tui.registry.scope.features", { count: formatNumber(agent.scope.featureIds.length) }),
    agent.scope.paths.length === 0 ? undefined : translate("tui.registry.scope.paths", { count: formatNumber(agent.scope.paths.length) }),
  ].filter((value): value is string => value !== undefined).join(" - ");
}
