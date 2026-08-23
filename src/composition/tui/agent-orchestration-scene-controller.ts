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

import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import type { TuiApp } from "../../adapters/inbound/tui/runtime/tui-app.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { Project } from "../../domain/project/project.js";
import type { ForAgentOrchestration } from "../../ports/inbound/for-agent-orchestration.js";
import { translate } from "../../application/localization/locale.js";

export interface AgentOrchestrationSceneController {
  showProjectAdvice(project: Project): Promise<void>;
  openFeatureOrchestration(feature: Feature): Promise<void>;
}

export function createAgentOrchestrationSceneController(app: TuiApp, orchestration: ForAgentOrchestration): AgentOrchestrationSceneController {
  return {
    async showProjectAdvice(project) {
      const advice = await orchestration.advise({ projectId: project.id });
      app.push(adviceView(advice));
    },
    async openFeatureOrchestration(feature) {
      const advice = await orchestration.advise({ projectId: feature.projectId, featureId: feature.id });
      const items = [
        { label: translate("tui.agentAdvice.productAdvice"), value: "advice", description: `${advice.phase} - ${advice.productNextAction}` },
        ...advice.recommendations.map((item, index) => ({
          label: translate("tui.agentAdvice.item", { mode: translate(item.mode === "execute" ? "tui.agentAdvice.execute" : "tui.agentAdvice.prepare"), role: item.role }),
          value: `prompt:${index}`,
          description: translate("tui.agentAdvice.description", { session: item.sessionId, access: translate(item.canWrite ? "tui.agentAdvice.write" : "tui.agentAdvice.read") }),
        })),
        { label: translate("tui.agentAdvice.handoff"), value: "handoff", description: translate("tui.agentAdvice.handoffDescription") },
        { label: `<- ${translate("tui.agentAdvice.back")}`, value: "back" },
      ];
      app.push(createMenuScene(items, {
        title: translate("tui.agentAdvice.organizationTitle"),
        hint: translate("tui.agentAdvice.menuHint"),
        onSelect(value) {
          void select(value);
        },
      }));

      async function select(value: string): Promise<void> {
        if (value === "back") {
          app.pop();
          return;
        }
        if (value === "advice") {
          app.push(adviceView(advice));
          return;
        }
        if (value === "handoff") {
          try {
            const result = await orchestration.productHandoffPrompt({ projectId: feature.projectId, featureId: feature.id });
            app.push(promptView(translate("tui.agentAdvice.handoffTitle"), result.prompt));
          } catch (error) {
            app.push(errorView(translate("tui.agentAdvice.handoffFailed"), error));
          }
          return;
        }
        const recommendation = advice.recommendations[Number(value.slice("prompt:".length))];
        if (recommendation === undefined) return;
        app.push(createTextInputScene({
          title: translate("tui.agentAdvice.providerTitle", { role: recommendation.role }),
          hint: translate("tui.agentAdvice.providerHint"),
          onSubmit(provider) {
            app.pop();
            void openPrompt(recommendation, provider.trim());
          },
        }));
      }

      async function openPrompt(recommendation: typeof advice.recommendations[number], provider: string): Promise<void> {
        try {
          const result = await orchestration.initializationPrompt({
            projectId: feature.projectId,
            featureId: feature.id,
            role: recommendation.role,
            mode: recommendation.mode,
            provider,
          });
          app.push(promptView(translate("tui.agentAdvice.promptTitle", { role: recommendation.role }), result.prompt, result.preflightCommand));
        } catch (error) {
          app.push(errorView(translate("tui.agentAdvice.promptFailed"), error));
        }
      }
    },
  };
}

function adviceView(advice: Awaited<ReturnType<ForAgentOrchestration["advise"]>>) {
  const recommendations = advice.recommendations.length === 0
    ? [translate("tui.agentAdvice.none")]
    : advice.recommendations.map((item) => translate("tui.agentAdvice.recommendation", {
        mode: translate(item.mode === "execute" ? "tui.agentAdvice.now" : "tui.agentAdvice.parallel"),
        role: item.role,
        session: item.sessionId,
        reason: item.reason,
        command: item.command,
      }));
  return createResultView({
    title: translate("tui.agentAdvice.adviceTitle"),
    code: advice.productPrincipal.status === "conflict" ? 3 : 0,
    output: [
      translate("tui.agentAdvice.phase", { phase: advice.phase }),
      translate("tui.agentAdvice.next", { step: advice.nextStepId ?? translate("tui.agentAdvice.chooseFeature") }),
      translate("tui.agentAdvice.product", { status: advice.productPrincipal.status, agent: advice.productPrincipal.agentId ?? translate("tui.agentAdvice.notBound") }),
      translate("tui.agentAdvice.guidance", { guidance: advice.productNextAction }),
      "",
      translate("tui.agentAdvice.proposed"),
      ...recommendations,
      "",
      translate("tui.agentAdvice.continuation", { command: advice.handoffPromptCommand }),
      ...advice.warnings.map((warning) => translate("tui.agentAdvice.warning", { warning })),
    ].join("\n") + "\n",
    onBack: () => {},
    nextStep: advice.recommendations[0]?.command ?? advice.handoffPromptCommand,
  });
}

function promptView(title: string, prompt: string, preflightCommand?: string) {
  return createResultView({
    title,
    code: 0,
    output: `${preflightCommand === undefined ? "" : translate("tui.agentAdvice.preflight", { command: preflightCommand })}${prompt}\n`,
    onBack: () => {},
    nextStep: translate("tui.agentAdvice.nextPrompt"),
  });
}

function errorView(title: string, error: unknown) {
  return createResultView({ title, code: 3, output: `${error instanceof Error ? error.message : String(error)}\n`, onBack: () => {} });
}
