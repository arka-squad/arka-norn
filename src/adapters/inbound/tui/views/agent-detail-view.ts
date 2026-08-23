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
import { titledBox } from "../components/box.js";
import { guidedShortcuts, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";
import { formatDate, translate } from "../../../../application/localization/locale.js";

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
    ...(deps.agent.active && !deps.current ? [{ label: translate("tui.agent.use.label"), value: "action:select" as const, description: translate("tui.agent.use.description") }] : []),
    ...(deps.agent.active ? [{ label: translate("tui.agent.replace.label"), value: "action:replace" as const, description: translate("tui.agent.replace.description") }] : []),
    ...(deps.agent.active ? [{ label: translate("tui.agent.deactivate.label"), value: "action:deactivate" as const, description: translate("tui.agent.deactivate.description") }] : []),
    { label: `<- ${translate("tui.agent.next.back")}`, value: "action:back" as const },
  ];
  const menu = createMenuScene<AgentDetailAction>(items, {
    hint: translate("tui.feature.menu.hint"),
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
            title: translate("tui.agent.help.title"),
            purpose: translate("tui.agent.help.purpose"),
            steps: [
              translate("tui.agent.help.step1"),
              translate("tui.agent.help.step2"),
              translate("tui.agent.help.step3"),
              translate("tui.agent.help.step4"),
            ],
            shortcuts: guidedShortcuts(),
          }, theme)) line(value);
          return;
        }
        const agent = deps.agent;
        for (const value of titledBox(agent.id.value, [
          translate("tui.agent.state", { state: translate(agent.active ? "tui.agent.active" : "tui.agent.inactive"), current: deps.current ? translate("tui.agent.current") : "" }),
          translate("tui.agent.providerRole", { provider: agent.provider, role: agent.role }),
          `Project : ${agent.scope.projectId.value}`,
          translate("tui.agent.features", { value: agent.scope.featureIds.map((id) => id.value).join(", ") || translate("tui.agent.allFeatures") }),
          translate("tui.agent.paths", { value: agent.scope.paths.join(", ") || translate("tui.agent.allPaths") }),
          translate("tui.agent.responsibilities", { value: agent.scope.responsibilities.join(" - ") || translate("tui.agent.unspecified") }),
          translate("tui.agent.registered", { date: formatDate(agent.registeredAt) }),
          ...(agent.replacesAgentId === undefined ? [] : [translate("tui.agent.replaces", { id: agent.replacesAgentId.value })]),
          ...(agent.replacedByAgentId === undefined ? [] : [translate("tui.agent.replacedBy", { id: agent.replacedByAgentId.value })]),
        ], theme, { border: agent.active ? theme.arkaRed : theme.gray }).split("\n")) line(value);
        line("");
        line(nextActionLine(
          translate(!agent.active ? "tui.agent.next.back" : deps.current ? "tui.agent.next.scope" : "tui.agent.next.use"),
          translate(!agent.active ? "tui.agent.next.inactiveReason" : "tui.agent.next.scopeReason"),
          theme,
        ));
        for (const value of menu.renderLines(theme)) line(value);
      });
    },
  };
}
