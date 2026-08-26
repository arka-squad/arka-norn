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

import { relative, resolve } from "node:path";

import { FeatureId } from "../../../../domain/feature/feature-id.js";
import type { Feature } from "../../../../domain/feature/feature.js";
import type { Project } from "../../../../domain/project/project.js";
import type { AgentRegistration } from "../../../../domain/agent/agent.js";
import type { ForFeatures } from "../../../../ports/inbound/for-features.js";
import type { ForProjects } from "../../../../ports/inbound/for-projects.js";
import type { ForScan } from "../../../../ports/inbound/for-scan.js";
import { mapConcurrent } from "../../../../application/shared/map-concurrent.js";
import { formatNumber, translate } from "../../../../application/localization/locale.js";
import { capabilityAvailableOn } from "../../../../application/capabilities/capability-registry.js";
import { titledBox } from "../components/box.js";
import { guidedShortcuts, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import type { Scene } from "../runtime/tui-app.js";

type ProjectAction = "action:product" | "action:framing" | "action:import" | "action:agents" | "action:orchestration" | "action:orchestration-dashboard" | "action:scan" | "action:forget" | "action:back" | `feature:${string}`;
const CIRCLE = String.fromCharCode(0x25cf);

export interface ProjectDetailViewDeps {
  readonly project: Project;
  readonly initialFeatures: readonly Feature[];
  readonly initialStatuses?: ReadonlyMap<string, string>;
  readonly initialMetrics?: ReadonlyMap<string, ProjectFeatureMetrics>;
  readonly initialAgents?: readonly AgentRegistration[];
  readonly currentAgentId?: string;
  readonly sessionId?: string;
  readonly features: ForFeatures;
  readonly projects?: ForProjects;
  readonly scan: ForScan;
  readonly redraw: () => void;
  readonly onBack: () => void;
  readonly onFeatureFocused?: (feature: Feature | undefined) => void;
  readonly onOpenFeature?: (feature: Feature) => Promise<void> | void;
  readonly onForget?: (project: Project) => Promise<void> | void;
  readonly onManageAgents?: (project: Project) => Promise<void> | void;
  readonly onShowProductAdvice?: (project: Project) => Promise<void> | void;
  readonly onOpenOrchestration?: (project: Project) => Promise<void> | void;
  readonly onStartFraming?: (project: Project, outcome: string) => Promise<void> | void;
  readonly metricsForFeature?: (feature: Feature) => Promise<ProjectFeatureMetrics>;
}

export interface ProjectFeatureMetrics {
  readonly status: string;
  readonly debtDocuments: number;
  readonly qaFailures: number;
  readonly handoffSignals: number;
  readonly invalidDocuments: number;
  readonly pipelineId: string;
  readonly phase: string;
  readonly progress: string;
  readonly iteration: number;
}

export interface ProjectDetailView extends Scene {
  setAgents(agents: readonly AgentRegistration[], currentAgentId: string | undefined): void;
  /**
   * Synchronises this long-lived scene after a child scene changes
   * Project-owned state, such as arming automatic orchestration.
   */
  setProject(project: Project): void;
}

export function createProjectDetailView(deps: ProjectDetailViewDeps): ProjectDetailView {
  let project = deps.project;
  let features = [...deps.initialFeatures];
  let statuses = new Map(deps.initialStatuses ?? []);
  let metrics = new Map(deps.initialMetrics ?? []);
  let agents = [...(deps.initialAgents ?? [])];
  let currentAgentId = deps.currentAgentId;
  let mode: "menu" | "import" | "framing" | "orchestration-mode" = "menu";
  let importPath = `${project.root}/`;
  let framingOutcome = "";
  let selectedOrchestrationMode = project.orchestrationMode;
  let orchestrationModeDirty = false;
  let message: string | undefined;
  let busy = false;
  let helpVisible = false;
  let menu = buildMenu();

  function items(): readonly MenuItem<ProjectAction>[] {
    const groupedFeatures = [...features].sort((left, right) => {
      const byStatus = (statuses.get(left.id.value) ?? "unknown").localeCompare(statuses.get(right.id.value) ?? "unknown");
      return byStatus === 0 ? left.name.localeCompare(right.name) : byStatus;
    });
    return [
      { label: translate("tui.project.product.label"), value: "action:product", description: translate("tui.project.product.description") },
      ...(capabilityAvailableOn("framing.start", "tui") ? [{ label: translate("tui.project.framing.label"), value: "action:framing" as const, description: translate("tui.project.framing.description") }] : []),
      { label: translate("tui.project.import.label"), value: "action:import", description: translate("tui.project.import.description") },
      ...groupedFeatures.map((feature) => {
        const featureMetrics = metrics.get(feature.id.value);
        const badge = feature.schemaVersion === 4
          ? `[${translate("tui.project.feature.legacy")}] `
          : feature.pipelineId === "arka-norn-fastdev" ? "[FASTDEV] " : "";
        const progress = featureMetrics === undefined ? "" : ` - ${featureMetrics.phase} - ${featureMetrics.progress}${featureMetrics.iteration > 1 ? ` - ${translate("tui.project.iteration", { iteration: formatNumber(featureMetrics.iteration) })}` : ""}`;
        return { label: `${CIRCLE} ${badge}[${statuses.get(feature.id.value) ?? translate("tui.project.status.unknown")}] ${feature.name}${progress}`, value: `feature:${feature.id.value}` as const, description: feature.root };
      }),
      ...(capabilityAvailableOn("agent.register", "tui") ? [{ label: translate("tui.project.agents.label"), value: "action:agents" as const, description: translate("tui.project.agents.description") }] : []),
      ...(deps.projects === undefined || !capabilityAvailableOn("project.set_orchestration_mode", "tui") ? [] : [{
        label: translate("tui.project.assisted.label", { state: translate(project.orchestrationMode === "automatic" ? "tui.project.state.enabled" : "tui.project.state.disabled") }),
        value: "action:orchestration" as const,
        description: project.orchestrationMode === "automatic"
          ? translate("tui.project.assisted.enabledDescription")
          : translate("tui.project.assisted.disabledDescription"),
      }]),
      ...(deps.onOpenOrchestration === undefined ? [] : [{
        label: translate("tui.project.assisted.open"), value: "action:orchestration-dashboard" as const,
        description: translate("tui.project.assisted.openDescription"),
      }]),
      ...(capabilityAvailableOn("project.scan", "tui") ? [{ label: translate("tui.project.scan.label"), value: "action:scan" as const }] : []),
      ...(capabilityAvailableOn("project.forget", "tui") ? [{ label: translate("tui.project.forget.label"), value: "action:forget" as const }] : []),
      { label: `<- ${translate("tui.project.back")}`, value: "action:back" },
    ];
  }

  function buildMenu(): MenuScene {
    return createMenuScene<ProjectAction>(items(), {
      hint: translate("tui.project.menu.hint"),
      maxVisible: 12,
      onSelect: (value) => void select(value),
    });
  }

  async function select(value: ProjectAction): Promise<void> {
    if (busy) return;
    if (value.startsWith("feature:")) {
      await run(async () => {
        const feature = await deps.features.switchTo(FeatureId.of(value.slice("feature:".length)));
        await deps.onOpenFeature?.(feature);
      });
    } else if (value === "action:product") {
      await run(async () => { await deps.onShowProductAdvice?.(project); });
    } else if (value === "action:framing") {
      framingOutcome = "";
      message = undefined;
      mode = "framing";
      deps.redraw();
    } else if (value === "action:import") {
      importPath = `${project.root}/`;
      mode = "import";
      deps.redraw();
    } else if (value === "action:agents") {
      await run(async () => { await deps.onManageAgents?.(project); });
    } else if (value === "action:orchestration") {
      selectedOrchestrationMode = project.orchestrationMode;
      orchestrationModeDirty = false;
      mode = "orchestration-mode";
      deps.redraw();
    } else if (value === "action:orchestration-dashboard") {
      await run(async () => { await deps.onOpenOrchestration?.(project); });
    } else if (value === "action:scan") {
      await run(async () => {
        const results = await deps.scan.scan({ target: project.root, projectId: project.id });
        await refresh();
        message = translate("tui.project.scan.done", { count: formatNumber(results.filter((entry) => entry.feature !== undefined).length) });
      });
    } else if (value === "action:forget") {
      await run(() => deps.onForget?.(project));
    } else {
      deps.onBack();
    }
  }

  async function submitImport(): Promise<void> {
    if (busy) return;
    const root = resolve(importPath.trim());
    if (!isContained(project.root, root)) {
      message = translate("tui.project.path.outside", { root: project.root });
      deps.redraw();
      return;
    }
    await run(async () => {
      await deps.features.importFrom({ root, projectId: project.id });
      mode = "menu";
      await refresh();
    });
  }

  async function submitFraming(): Promise<void> {
    if (busy) return;
    const outcome = framingOutcome.trim();
    if (outcome.length === 0) {
      message = translate("tui.project.framing.required");
      deps.redraw();
      return;
    }
    if (deps.onStartFraming === undefined) {
      message = translate("tui.project.framing.unavailable");
      deps.redraw();
      return;
    }
    await run(async () => {
      await deps.onStartFraming!(project, outcome);
      mode = "menu";
      message = translate("tui.project.framing.started");
    });
  }

  function toggleOrchestrationMode(): void {
    selectedOrchestrationMode = selectedOrchestrationMode === "manual" ? "automatic" : "manual";
    orchestrationModeDirty = true;
  }

  async function saveOrchestrationMode(): Promise<void> {
    if (deps.projects === undefined) return;
    await run(async () => {
      const persistedProject = await deps.projects!.show(project.id);
      const persistedMode = persistedProject.orchestrationMode;

      // A long-lived detail scene may have been covered by the orchestration
      // dashboard while `start` armed automatic mode. Never turn it back to
      // manual merely because the user confirms the stale default selection.
      if (!orchestrationModeDirty && selectedOrchestrationMode !== persistedMode) {
        project = persistedProject;
        selectedOrchestrationMode = persistedMode;
        mode = "menu";
        menu = buildMenu();
        message = translate("tui.project.assisted.updated", { state: translate(persistedMode === "automatic" ? "tui.project.state.enabled" : "tui.project.state.disabled") });
        return;
      }

      if (selectedOrchestrationMode === persistedMode) {
        project = persistedProject;
        mode = "menu";
        menu = buildMenu();
        message = translate(persistedMode === "automatic" ? "tui.project.assisted.alreadyEnabled" : "tui.project.assisted.alreadyDisabled");
        return;
      }

      project = await deps.projects!.setOrchestrationMode({ id: project.id, orchestrationMode: selectedOrchestrationMode });
      mode = "menu";
      menu = buildMenu();
      message = translate(selectedOrchestrationMode === "automatic" ? "tui.project.assisted.enabledMessage" : "tui.project.assisted.disabledMessage");
    });
  }

  async function refresh(): Promise<void> {
    features = [...await deps.features.list(project.id)];
    if (deps.metricsForFeature !== undefined) {
      metrics = new Map(await mapConcurrent(features, 4, async (feature) => [feature.id.value, await deps.metricsForFeature!(feature)] as const));
      statuses = new Map([...metrics].map(([id, value]) => [id, value.status] as const));
    }
    menu = buildMenu();
    deps.redraw();
  }

  async function run(task: () => Promise<void> | void): Promise<void> {
    if (busy) return;
    busy = true;
    deps.redraw();
    try {
      await task();
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
      deps.redraw();
    }
  }

  return {
    chrome: { contextBanner: false },
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (event.kind === "help" && mode === "menu") {
        helpVisible = !helpVisible;
        deps.redraw();
        return "consumed";
      }
      if (helpVisible) {
        if (event.kind === "escape") helpVisible = false;
        deps.redraw();
        return "consumed";
      }
      if (mode === "import") {
        if (event.kind === "escape") mode = "menu";
        else if (event.kind === "enter" && !busy) void submitImport();
        else if (event.kind === "backspace") importPath = importPath.slice(0, -1);
        else if (event.kind === "char") importPath += event.value;
        else if (event.kind === "filter") importPath += "/";
        deps.redraw();
        return "consumed";
      }
      if (mode === "framing") {
        if (event.kind === "escape") mode = "menu";
        else if (event.kind === "enter" && !busy) void submitFraming();
        else if (event.kind === "backspace") framingOutcome = framingOutcome.slice(0, -1);
        else if (event.kind === "char") framingOutcome += event.value;
        else if (event.kind === "filter") framingOutcome += "/";
        deps.redraw();
        return "consumed";
      }
      if (mode === "orchestration-mode") {
        if (event.kind === "escape") mode = "menu";
        else if (event.kind === "up" || event.kind === "down" || event.kind === "left" || event.kind === "right") toggleOrchestrationMode();
        else if (event.kind === "enter" && !busy) void saveOrchestrationMode();
        deps.redraw();
        return "consumed";
      }
      if (event.kind === "escape") {
        deps.onBack();
        return "consumed";
      }
      return menu.onKey(event);
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        if (helpVisible) {
          for (const value of renderGuidance({
            title: translate("tui.project.help.title"),
            purpose: translate("tui.project.help.purpose"),
            steps: [
              translate("tui.project.help.step1"),
              translate("tui.project.help.step2"),
              translate("tui.project.help.step3"),
              translate("tui.project.help.step4"),
            ],
            shortcuts: guidedShortcuts(),
          }, theme)) line(value);
          return;
        }
        if (mode === "framing") {
          for (const value of titledBox(translate("tui.project.framing.title"), [
            translate("tui.project.framing.explanation"),
            translate("tui.project.framing.hint"),
            "",
            `${framingOutcome}${theme.dim("_")}`,
            message ?? translate("tui.project.framing.confirm"),
          ], theme, { border: theme.arkaAccent }).split("\n")) line(value);
          return;
        }
        if (mode === "import") {
          for (const value of titledBox(translate("tui.project.import.title"), [
            translate("tui.project.import.explanation"),
            translate("tui.project.allowedRoot", { root: project.root }),
            "",
            `${importPath}${theme.dim("_")}`,
            message ?? translate("tui.project.path.confirm"),
          ], theme).split("\n")) line(value);
          return;
        }
        if (mode === "orchestration-mode") {
          const selected = translate(selectedOrchestrationMode === "automatic" ? "tui.project.state.enabled" : "tui.project.state.disabled");
          for (const value of titledBox(translate("tui.project.assisted.title"), [
            translate("tui.project.assisted.current", { state: translate(project.orchestrationMode === "automatic" ? "tui.project.state.enabled" : "tui.project.state.disabled") }),
            "",
            translate("tui.project.assisted.new", { state: selected }),
            selectedOrchestrationMode === "automatic"
              ? translate("tui.project.assisted.enabledDetail")
              : translate("tui.project.assisted.disabledDetail"),
            translate("tui.project.assisted.hint"),
          ], theme, { border: selectedOrchestrationMode === "automatic" ? theme.arkaAccent : theme.arkaRed }).split("\n")) line(value);
          return;
        }
        const health = [...statuses.values()].reduce<Record<string, number>>((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {});
        const groups = Object.entries(health).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => `${status}=${formatNumber(count)}`).join(" - ") || translate("tui.project.status.none");
        const totals = [...metrics.values()].reduce((sum, item) => ({
          debts: sum.debts + item.debtDocuments,
          qa: sum.qa + item.qaFailures,
          handoffs: sum.handoffs + item.handoffSignals,
          invalid: sum.invalid + item.invalidDocuments,
        }), { debts: 0, qa: 0, handoffs: 0, invalid: 0 });
        for (const value of titledBox(project.name, [
          translate("tui.project.root", { root: project.root }),
          translate("tui.project.assisted.label", { state: translate(project.orchestrationMode === "automatic" ? "tui.project.assisted.summaryEnabled" : "tui.project.assisted.summaryDisabled") }),
          translate("tui.project.features", { count: formatNumber(features.length) }),
          translate("tui.project.states", { groups }),
          translate("tui.project.metrics", {
            debts: formatNumber(totals.debts),
            qa: formatNumber(totals.qa),
            handoffs: formatNumber(totals.handoffs),
            invalid: formatNumber(totals.invalid),
          }),
          translate("tui.project.agents.summary", {
            active: formatNumber(agents.filter((agent) => agent.active).length),
            total: formatNumber(agents.length),
            current: currentAgentId ?? translate("tui.project.current.none"),
          }),
          translate("tui.project.session", { session: deps.sessionId ?? "main" }),
        ], theme, { border: theme.arkaRed }).split("\n")) line(value);
        line("");
        line(nextActionLine(
          features.length === 0 ? translate("tui.project.next.framing") : currentAgentId === undefined ? translate("tui.registry.registerProduct") : translate("tui.project.next.product"),
          features.length === 0 ? translate("tui.project.noFeatureReason") : currentAgentId === undefined ? translate("tui.project.noCurrentReason") : translate("tui.project.readyReason"),
          theme,
        ));
        if (features.length === 0) line(`  ${theme.dim(translate("tui.project.guidedPath"))}`);
        if (busy) line(`  ${theme.dim(translate("tui.project.loading"))}`);
        if (message !== undefined) line(`  ${theme.arkaAccent(message)}`);
        for (const value of menu.renderLines(theme)) line(value);
      });
    },
    setAgents(updatedAgents, updatedCurrentAgentId): void {
      agents = [...updatedAgents];
      currentAgentId = updatedCurrentAgentId;
      deps.redraw();
    },
    setProject(updatedProject): void {
      if (!project.sameIdentity(updatedProject)) return;
      project = updatedProject;
      selectedOrchestrationMode = updatedProject.orchestrationMode;
      orchestrationModeDirty = false;
      menu = buildMenu();
      deps.redraw();
    },
  };
}

function isContained(projectRoot: string, featureRoot: string): boolean {
  const relation = relative(resolve(projectRoot), resolve(featureRoot));
  return relation.length > 0 && !relation.startsWith("..") && !relation.startsWith("/");
}
