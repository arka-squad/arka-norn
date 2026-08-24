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

import type { Feature } from "../../../../domain/feature/feature.js";
import type { ExecutionRecord } from "../../../../domain/orchestration/execution-record.js";
import type { ExecutionProvider } from "../../../../domain/orchestration/types.js";
import type {
  ForOrchestration,
  OrchestrationPreview,
  OrchestrationPreviewCandidate,
  OrchestrationStatus,
} from "../../../../ports/inbound/for-orchestration.js";
import type { Project } from "../../../../domain/project/project.js";
import type { WorkspaceChanges } from "../../../../ports/outbound/orchestration-workspace.js";
import { translate } from "../../../../application/localization/locale.js";

import { titledBox } from "../components/box.js";
import { createMenuScene, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import type { Scene } from "../runtime/tui-app.js";
import {
  displayMissionStatus,
  displayProvider,
  displayTarget,
  isReadOnlyAnalysisAwaitingValidation,
  renderMissionSummary,
  renderPreviewSummary,
  selectableCandidates,
  translatePreparationError,
} from "./orchestration-presentation.js";

type AssistedViewMode = "overview" | "feature-selection" | "preview" | "target-selection" | "provider-selection" | "model-input" | "workspace-selection" | "decision-input" | "changes-preview";
type OrchestrationAction =
  | "prepare" | "refresh" | "refresh-preview" | "start"
  | "choose-feature" | "choose-target" | "configure-target"
  | "cancel" | "pause-campaign" | "resume-campaign" | "decide-campaign"
  | "cancel-campaign" | "review-campaign-changes" | "apply-campaign"
  | "abandon-campaign" | "retry" | "retry-campaign" | "inspect" | "back"
  | `feature:${string}`
  | `target:${number}`
  | `provider:${ExecutionProvider}`
  | `workspace:${"isolated" | "direct"}`;

const EXECUTION_PROVIDER_CHOICES = ["claude", "codex", "kimi", "zai"] as const satisfies readonly ExecutionProvider[];

export interface OrchestrationViewDeps {
  readonly project: Project;
  readonly initialStatus: OrchestrationStatus;
  /** Features belonging to this Project, loaded by the composition root. */
  readonly initialFeatures?: readonly Feature[];
  readonly orchestration: ForOrchestration;
  /** Reads current Project state after an orchestration mutation. */
  readonly refreshProject?: () => Promise<Project>;
  readonly redraw: () => void;
  readonly onBack: () => void;
}

/**
 * Human-facing control-plane view. Preparation is read-only and every start
 * explicitly confirms the Feature, target and preview fingerprint.
 */
export function createOrchestrationView(deps: OrchestrationViewDeps): Scene {
  let project = deps.project;
  let status = deps.initialStatus;
  const features = [...(deps.initialFeatures ?? [])];
  let viewMode: AssistedViewMode = "overview";
  let selectedFeature: Feature | undefined;
  let preview: OrchestrationPreview | undefined;
  let selectedCandidateIndex: number | undefined;
  let selectedProvider: ExecutionProvider | undefined;
  let modelInput = "";
  let decisionActor = "";
  let decisionChoice = "";
  let decisionStage: "actor" | "choice" = "actor";
  let pendingChanges: WorkspaceChanges | undefined;
  let busy = false;
  let message: string | undefined;
  let menu = buildMenu();

  function buildMenu(): MenuScene {
    return createMenuScene<OrchestrationAction>(items(), {
      hint: translate("tui.orchestration.menu.hint"),
      maxVisible: 10,
      onSelect: (action) => void select(action),
    });
  }

  function modalItems(): readonly MenuItem<OrchestrationAction>[] | undefined {
    if (viewMode === "feature-selection") {
      return [
        ...features.map((feature) => ({
          label: feature.name,
          value: `feature:${feature.id.value}` as const,
          description: translate("tui.orchestration.feature.description"),
        })),
        { label: `<- ${translate("tui.orchestration.back.dashboard")}`, value: "back" },
      ];
    }

    if (viewMode === "target-selection") {
      const prepared = requirePreview();
      const choices = selectableCandidates(prepared);
      return [
        ...choices.map(({ candidate, index }) => ({
          label: displayTarget(candidate.target),
          value: `target:${index}` as const,
          description: candidate.recommended
            ? translate("tui.orchestration.target.recommended")
            : translate("tui.orchestration.target.compatible"),
        })),
        { label: translate("tui.orchestration.target.configure"), value: "configure-target", description: translate("tui.orchestration.target.configureDescription") },
        { label: `<- ${translate("tui.orchestration.back.preview")}`, value: "back" },
      ];
    }

    if (viewMode === "provider-selection") {
      return [
        ...EXECUTION_PROVIDER_CHOICES.map((provider) => ({
          label: displayProvider(provider),
          value: `provider:${provider}` as const,
          description: translate("tui.orchestration.provider.description"),
        })),
        { label: `<- ${translate("tui.orchestration.back.preview")}`, value: "back" },
      ];
    }

    if (viewMode === "workspace-selection") {
      return [
        { label: translate("tui.orchestration.workspace.isolated"), value: "workspace:isolated", description: translate("tui.orchestration.workspace.isolatedDescription") },
        { label: translate("tui.orchestration.workspace.direct"), value: "workspace:direct", description: translate("tui.orchestration.workspace.directDescription") },
        { label: `<- ${translate("tui.orchestration.back.preview")}`, value: "back" },
      ];
    }

    if (viewMode === "changes-preview") {
      return [
        { label: translate("tui.orchestration.campaign.apply"), value: "apply-campaign", description: translate("tui.orchestration.campaign.applyDescription") },
        { label: `<- ${translate("tui.orchestration.back.preview")}`, value: "back" },
      ];
    }

    if (viewMode === "preview") {
      const candidate = selectedCandidate();
      return [
        ...(candidate === undefined
          ? []
          : [{
              label: translate("tui.orchestration.start", { target: displayTarget(candidate.target) }),
              value: "start" as const,
              description: translate("tui.orchestration.start.description"),
            }]),
        ...(selectableCandidates(requirePreview()).length > 1
          ? [{ label: translate("tui.orchestration.target.choose"), value: "choose-target" as const, description: translate("tui.orchestration.target.chooseDescription") }]
          : []),
        { label: translate("tui.orchestration.target.configure"), value: "configure-target", description: translate("tui.orchestration.target.configureDescription") },
        { label: translate("tui.orchestration.preview.refresh"), value: "refresh-preview", description: translate("tui.orchestration.preview.refreshDescription") },
        ...(features.length > 1 ? [{ label: translate("tui.orchestration.feature.chooseAnother"), value: "choose-feature" as const }] : []),
        { label: `<- ${translate("tui.orchestration.back.dashboard")}`, value: "back" },
      ];
    }

    return undefined;
  }

  function overviewItems(): readonly MenuItem<OrchestrationAction>[] {
    const active = status.activeExecution;
    const campaign = status.activeCampaign;
    if (campaign !== undefined) {
      return [
        ...(campaign.status === "running" ? [{ label: translate("tui.orchestration.campaign.pause"), value: "pause-campaign" as const, description: translate("tui.orchestration.campaign.pauseDescription") }] : []),
        ...(campaign.status === "paused" ? [{ label: translate("tui.orchestration.campaign.resume"), value: "resume-campaign" as const, description: translate("tui.orchestration.campaign.resumeDescription") }] : []),
        ...(campaign.status === "awaiting_decision" && campaign.actionRequired?.kind === "business_decision" ? [{ label: translate("tui.orchestration.campaign.decide"), value: "decide-campaign" as const, description: translate("tui.orchestration.campaign.decideDescription") }] : []),
        ...(campaign.status === "awaiting_application" ? [{ label: translate("tui.orchestration.campaign.reviewChanges"), value: "review-campaign-changes" as const, description: translate("tui.orchestration.campaign.reviewChangesDescription") }] : []),
        ...campaignRetryItem(campaign),
        ...(["running", "paused", "awaiting_decision", "awaiting_application", "blocked"].includes(campaign.status) ? [{ label: translate("tui.orchestration.campaign.cancel"), value: "cancel-campaign" as const, description: translate("tui.orchestration.campaign.cancelDescription") }] : []),
        ...(["awaiting_application", "awaiting_decision", "blocked", "paused"].includes(campaign.status) ? [{ label: translate("tui.orchestration.campaign.abandon"), value: "abandon-campaign" as const, description: translate("tui.orchestration.campaign.abandonDescription") }] : []),
        ...(campaign.actionRequired !== undefined ? [{ label: translate("tui.orchestration.mission.inspect"), value: "inspect" as const, description: campaign.actionRequired.reason }] : []),
        { label: translate("tui.orchestration.refresh"), value: "refresh", description: translate("tui.orchestration.refresh.description") },
        { label: `<- ${translate("tui.orchestration.back.project")}`, value: "back" },
      ];
    }
    if (active !== undefined) {
      return [
        ...(active.status === "planned" || active.status === "running" || active.status === "awaiting_approval"
          ? [{ label: translate("tui.orchestration.mission.cancel"), value: "cancel" as const, description: translate("tui.orchestration.mission.cancelDescription") }]
          : []),
        ...(active.status === "failed" || active.status === "cancelled" || active.status === "interrupted"
          ? [{ label: translate("tui.orchestration.mission.retry"), value: "retry" as const, description: translate("tui.orchestration.mission.retryDescription") }]
          : []),
        ...(status.actionRequired?.kind === "inspect"
          ? [{ label: translate("tui.orchestration.mission.inspect"), value: "inspect" as const, description: translate("tui.orchestration.mission.inspectDescription") }]
          : []),
        { label: translate("tui.orchestration.refresh"), value: "refresh", description: translate("tui.orchestration.refresh.description") },
        { label: `<- ${translate("tui.orchestration.back.project")}`, value: "back" },
      ];
    }

    const manualAuditValidation = isReadOnlyAnalysisAwaitingValidation(status.latestExecution);
    return [
      ...(isRetryable(status.latestExecution)
        ? [{ label: translate("tui.orchestration.mission.retry"), value: "retry" as const, description: translate("tui.orchestration.mission.retryDescription") }]
        : []),
      ...(status.actionRequired?.kind === "inspect"
        ? [{
            label: translate(manualAuditValidation ? "tui.orchestration.mission.auditValidation" : "tui.orchestration.mission.inspect"),
            value: "inspect" as const,
            description: translate(manualAuditValidation ? "tui.orchestration.mission.auditValidationDescription" : "tui.orchestration.mission.inspectDescription"),
          }]
        : []),
      ...(status.orchestrationMode !== "automatic" || features.length === 0 || manualAuditValidation
        ? []
        : [{
            label: features.length === 1
              ? translate("tui.orchestration.prepare.one", { feature: features[0]!.name })
              : translate("tui.orchestration.prepare.many"),
            value: "prepare" as const,
            description: translate("tui.orchestration.prepare.description"),
          }]),
      { label: translate("tui.orchestration.refresh"), value: "refresh", description: translate("tui.orchestration.refresh.description") },
      { label: `<- ${translate("tui.orchestration.back.project")}`, value: "back", ...(status.orchestrationMode !== "automatic" ? { description: translate("tui.orchestration.enable.description") } : {}) },
    ];
  }

  function items(): readonly MenuItem<OrchestrationAction>[] { return modalItems() ?? overviewItems(); }

  async function select(action: OrchestrationAction): Promise<void> {
    if (busy) return;
    if (action === "back") {
      if (viewMode === "overview") deps.onBack();
      else {
        viewMode = previousMode(viewMode);
        menu = buildMenu();
        deps.redraw();
      }
      return;
    }
    if (action.startsWith("feature:")) {
      const feature = features.find((candidate) => candidate.id.value === action.slice("feature:".length));
      if (feature !== undefined) await loadPreview(feature);
      return;
    }
    if (action.startsWith("target:")) {
      selectedCandidateIndex = Number(action.slice("target:".length));
      viewMode = "preview";
      menu = buildMenu();
      deps.redraw();
      return;
    }
    if (action.startsWith("provider:")) {
      selectedProvider = providerFromAction(action);
      modelInput = "";
      viewMode = "model-input";
      menu = buildMenu();
      deps.redraw();
      return;
    }
    if (action.startsWith("workspace:")) {
      await configureSelectedTarget(action === "workspace:isolated" ? "isolated" : "direct");
      return;
    }
    if (action === "prepare") {
      if (features.length === 1) await loadPreview(features[0]!);
      else if (features.length > 1) {
        viewMode = "feature-selection";
        menu = buildMenu();
        deps.redraw();
      }
      return;
    }
    if (action === "choose-feature") {
      viewMode = "feature-selection";
      menu = buildMenu();
      deps.redraw();
      return;
    }
    if (action === "choose-target") {
      viewMode = "target-selection";
      menu = buildMenu();
      deps.redraw();
      return;
    }
    if (action === "configure-target") {
      viewMode = "provider-selection";
      menu = buildMenu();
      deps.redraw();
      return;
    }
    if (action === "refresh-preview") {
      if (selectedFeature !== undefined) await loadPreview(selectedFeature);
      return;
    }
    if (action === "start") {
      await startPreparedMission();
      return;
    }
    if (action === "inspect") {
      message = displayMissionStatus(status.activeExecution ?? status.latestExecution).detail;
      deps.redraw();
      return;
    }
    if (action === "refresh") {
      await run(refreshStatusAndProject);
      return;
    }
    if (action === "cancel") {
      await updateCurrentMission((execution) => deps.orchestration.cancel({ projectId: project.id, executionId: execution.id }), translate("tui.orchestration.message.cancelled"));
      return;
    }
    if (action === "pause-campaign") {
      await updateCampaign((campaign) => deps.orchestration.pause!({ projectId: project.id, campaignId: campaign.id, expectedRevision: campaign.revision }), translate("tui.orchestration.campaign.paused"));
      return;
    }
    if (action === "resume-campaign") {
      await updateCampaign((campaign) => deps.orchestration.resume!({ projectId: project.id, campaignId: campaign.id, expectedRevision: campaign.revision }), translate("tui.orchestration.campaign.resumed"));
      return;
    }
    if (action === "decide-campaign") {
      decisionActor = "";
      decisionChoice = "";
      decisionStage = "actor";
      viewMode = "decision-input";
      deps.redraw();
      return;
    }
    if (action === "cancel-campaign") {
      await updateCampaign((campaign) => deps.orchestration.cancelCampaign!({ projectId: project.id, campaignId: campaign.id, expectedRevision: campaign.revision }), translate("tui.orchestration.campaign.cancelled"));
      return;
    }
    if (action === "review-campaign-changes") {
      await run(async () => {
        const campaign = status.activeCampaign;
        if (campaign === undefined) throw new Error("No automatic campaign is active.");
        pendingChanges = await deps.orchestration.changes!({ projectId: project.id, campaignId: campaign.id });
        viewMode = "changes-preview";
        menu = buildMenu();
      });
      return;
    }
    if (action === "apply-campaign") {
      await updateCampaign((campaign) => deps.orchestration.apply!({ projectId: project.id, campaignId: campaign.id, expectedRevision: campaign.revision, fingerprint: pendingChanges?.fingerprint ?? "" }), translate("tui.orchestration.campaign.applied"));
      pendingChanges = undefined;
      viewMode = "overview";
      return;
    }
    if (action === "abandon-campaign") {
      await updateCampaign((campaign) => deps.orchestration.abandon!({ projectId: project.id, campaignId: campaign.id, expectedRevision: campaign.revision }), translate("tui.orchestration.campaign.abandoned"));
      return;
    }
    if (action === "retry") {
      await updateCurrentMission((execution) => deps.orchestration.retry({ projectId: project.id, executionId: execution.id }), translate("tui.orchestration.message.retry"));
      return;
    }
    if (action === "retry-campaign") {
      await updateCampaign((campaign) => deps.orchestration.retryCampaign!({
        projectId: project.id,
        campaignId: campaign.id,
        expectedRevision: campaign.revision,
        fingerprint: campaign.actionRequired?.fingerprint ?? "",
      }), translate("tui.orchestration.message.retry"));
    }
  }

  async function loadPreview(feature: Feature): Promise<void> {
    await run(() => preparePreview(feature));
  }

  async function preparePreview(
    feature: Feature,
    configuredTarget?: { readonly provider: ExecutionProvider; readonly model: string },
  ): Promise<void> {
    const prepared = await deps.orchestration.preview({ projectId: project.id, featureId: feature.id });
    selectedFeature = feature;
    preview = prepared;
    selectedCandidateIndex = configuredTarget === undefined
      ? undefined
      : selectableCandidates(prepared).find(({ candidate }) =>
        candidate.target.provider === configuredTarget.provider && candidate.target.model === configuredTarget.model,
      )?.index;
    viewMode = selectedCandidateIndex === undefined ? "target-selection" : "preview";
    menu = buildMenu();
  }

  async function configureSelectedTarget(workspaceMode: "isolated" | "direct"): Promise<void> {
    const provider = selectedProvider;
    const model = modelInput.trim();
    const feature = selectedFeature;
    if (provider === undefined || feature === undefined || model.length === 0) {
      message = translate("tui.orchestration.model.required");
      deps.redraw();
      return;
    }
    await run(async () => {
      await deps.orchestration.configure({ projectId: project.id, selection: { provider, model }, workspaceMode });
      await preparePreview(feature, { provider, model });
      message = translate("tui.orchestration.model.saved", { provider: displayProvider(provider), model });
    });
  }

  async function startPreparedMission(): Promise<void> {
    const prepared = preview;
    const feature = selectedFeature;
    const candidate = selectedCandidate();
    const model = candidate?.target.model;
    if (prepared === undefined || feature === undefined || candidate === undefined || model === undefined) {
      message = translate("tui.orchestration.target.incomplete");
      deps.redraw();
      return;
    }
    await run(async () => {
      await deps.orchestration.start({
        projectId: project.id,
        featureId: feature.id,
        selection: { provider: candidate.target.provider, model },
        previewFingerprint: prepared.fingerprint,
      });
      await refreshStatusAndProject();
      preview = undefined;
      selectedCandidateIndex = undefined;
      viewMode = "overview";
      menu = buildMenu();
      message = translate("tui.orchestration.mission.started", { target: displayTarget(candidate.target) });
    });
  }

  async function updateCurrentMission(
    operation: (execution: ExecutionRecord) => Promise<ExecutionRecord>,
    successMessage: string,
  ): Promise<void> {
    await run(async () => {
      const execution = requireCurrentExecution(status);
      await operation(execution);
      await refreshStatusAndProject();
      menu = buildMenu();
      message = successMessage;
    });
  }

  async function updateCampaign(operation: (campaign: NonNullable<OrchestrationStatus["activeCampaign"]>) => Promise<unknown>, successMessage: string): Promise<void> {
    await run(async () => {
      const campaign = status.activeCampaign;
      if (campaign === undefined) throw new Error("No automatic campaign is active.");
      await operation(campaign);
      await refreshStatusAndProject();
      message = successMessage;
    });
  }

  async function refreshStatusAndProject(): Promise<void> {
    const refreshedStatus = await deps.orchestration.status({ projectId: project.id });
    if (deps.refreshProject !== undefined && refreshedStatus.orchestrationMode !== project.orchestrationMode) {
      project = await deps.refreshProject();
    }
    status = refreshedStatus;
    menu = buildMenu();
  }

  function requirePreview(): OrchestrationPreview {
    if (preview === undefined) throw new Error("No assisted mission preview is available.");
    return preview;
  }

  function selectedCandidate(): OrchestrationPreviewCandidate | undefined {
    const prepared = preview;
    if (prepared === undefined || selectedCandidateIndex === undefined) return undefined;
    const candidate = prepared.candidates[selectedCandidateIndex];
    return candidate?.eligible === true && candidate.target.model !== undefined ? candidate : undefined;
  }

  async function run(task: () => Promise<void>): Promise<void> {
    busy = true;
    message = undefined;
    deps.redraw();
    try {
      await task();
    } catch (error) {
      message = translatePreparationError(error);
    } finally {
      busy = false;
      deps.redraw();
    }
  }

  function handleModelInput(event: KeyEvent): "consumed" {
    if (busy) return "consumed";
    if (event.kind === "escape") {
      viewMode = "provider-selection";
    } else if (event.kind === "backspace") {
      modelInput = modelInput.slice(0, -1);
    } else if (event.kind === "char") {
      modelInput += event.value;
    } else if (event.kind === "enter") {
      if (modelInput.trim().length > 0) {
        viewMode = "workspace-selection";
        menu = buildMenu();
      }
    }
    deps.redraw();
    return "consumed";
  }

  function handleDecisionInput(event: KeyEvent): "consumed" {
    if (busy) return "consumed";
    if (event.kind === "escape") {
      viewMode = "overview";
      menu = buildMenu();
    } else if (event.kind === "backspace") {
      if (decisionStage === "actor") decisionActor = decisionActor.slice(0, -1);
      else decisionChoice = decisionChoice.slice(0, -1);
    } else if (event.kind === "char") {
      if (decisionStage === "actor") decisionActor += event.value;
      else decisionChoice += event.value;
    } else if (event.kind === "enter") {
      if (decisionStage === "actor" && decisionActor.trim().length > 0) decisionStage = "choice";
      else if (decisionStage === "choice" && decisionChoice.trim().length > 0) void submitDecision();
    }
    deps.redraw();
    return "consumed";
  }

  async function submitDecision(): Promise<void> {
    await updateCampaign((campaign) => deps.orchestration.decide!({
      projectId: project.id,
      campaignId: campaign.id,
      expectedRevision: campaign.revision,
      fingerprint: campaign.actionRequired?.fingerprint ?? "",
      actor: decisionActor.trim(),
      choice: decisionChoice.trim(),
    }), translate("tui.orchestration.campaign.decided"));
    viewMode = "overview";
    menu = buildMenu();
  }

  return {
    chrome: { contextBanner: false },
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (viewMode === "model-input") return handleModelInput(event);
      if (viewMode === "decision-input") return handleDecisionInput(event);
      if (event.kind === "escape") {
        if (viewMode === "overview") deps.onBack();
        else {
          viewMode = previousMode(viewMode);
          menu = buildMenu();
          deps.redraw();
        }
        return "consumed";
      }
      return busy ? "consumed" : menu.onKey(event);
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        for (const value of titledBox(translate("tui.orchestration.title"), renderSummary(), theme, { border: theme.arkaAccent }).split("\n")) line(value);
        line("");
        if (busy) line(`  ${theme.dim(translate("tui.orchestration.busy"))}`);
        if (message !== undefined) line(`  ${theme.arkaAccent(message)}`);
        if (viewMode !== "model-input" && viewMode !== "decision-input") {
          for (const value of menu.renderLines(theme)) line(value);
        }
      });
    },
  };

  function renderSummary(): readonly string[] {
    if (viewMode === "feature-selection") {
      return [
        `Project : ${project.name}`,
        translate("tui.orchestration.summary.feature.choose"),
        translate("tui.orchestration.summary.previewOnly"),
      ];
    }
    if (viewMode === "target-selection") {
      const choices = selectableCandidates(requirePreview());
      return [
        `Feature : ${requirePreview().featureName}`,
        choices.length === 0
          ? translate("tui.orchestration.summary.target.none")
          : translate("tui.orchestration.summary.target.choose"),
        choices.length === 0
          ? translate("tui.orchestration.summary.target.configure")
          : translate("tui.orchestration.summary.target.filtered"),
      ];
    }
    if (viewMode === "provider-selection") {
      return [
        `Feature : ${requirePreview().featureName}`,
        translate("tui.orchestration.summary.provider.choose"),
        translate("tui.orchestration.summary.provider.verify"),
      ];
    }
    if (viewMode === "model-input") {
      return [
        translate("tui.orchestration.summary.assistant", { provider: selectedProvider === undefined ? translate("tui.orchestration.summary.assistant.none") : displayProvider(selectedProvider) }),
        translate("tui.orchestration.summary.model.help"),
        "",
        translate("tui.orchestration.summary.model", { model: `${modelInput}_` }),
        translate("tui.orchestration.summary.model.hint"),
      ];
    }
    if (viewMode === "decision-input") {
      return [
        translate("tui.orchestration.decision.title"),
        status.activeCampaign?.actionRequired?.reason ?? translate("tui.orchestration.decision.reasonMissing"),
        "",
        decisionStage === "actor"
          ? translate("tui.orchestration.decision.actor", { value: `${decisionActor}_` })
          : translate("tui.orchestration.decision.choice", { value: `${decisionChoice}_` }),
        translate("tui.orchestration.decision.hint"),
      ];
    }
    if (viewMode === "workspace-selection") {
      return [translate("tui.orchestration.workspace.title"), translate("tui.orchestration.workspace.help")];
    }
    if (viewMode === "changes-preview") {
      const changes = pendingChanges?.changes ?? [];
      return [
        translate("tui.orchestration.changes.title", { count: changes.length }),
        ...changes.slice(0, 20).map((change) => `${change.kind} · ${change.path}${change.binary ? " · binary" : ""}`),
        ...(changes.length > 20 ? [translate("tui.orchestration.changes.more", { count: changes.length - 20 })] : []),
        translate("tui.orchestration.changes.confirm"),
      ];
    }
    if (viewMode === "preview") return renderPreviewSummary(requirePreview(), selectedCandidateIndex);

    const execution = status.activeExecution ?? status.latestExecution;
    const displayed = displayMissionStatus(execution);
    const manualAuditValidation = isReadOnlyAnalysisAwaitingValidation(status.latestExecution);
    const missionSummary = execution === undefined
      ? []
      : renderMissionSummary(execution, status.actionRequired, status.activeExecution !== undefined);
    return [
      `Project : ${project.name}`,
      translate("tui.orchestration.summary.mode", { state: translate(status.orchestrationMode === "automatic" ? "tui.project.state.enabled" : "tui.project.state.disabled") }),
      ...(status.projection === undefined ? [] : [
        translate("tui.orchestration.campaign.progress", { completed: status.projection.progress.completedMissions, maximum: status.projection.progress.maximumMissions }),
        translate("tui.orchestration.campaign.activity", { activity: status.projection.currentActivity }),
        translate("tui.orchestration.campaign.freshness", { freshness: status.projection.stale ? translate("tui.orchestration.campaign.stale") : translate("tui.orchestration.campaign.current") }),
      ]),
      ...missionSummary,
      translate("tui.orchestration.summary.situation", { situation: displayed.title }),
      displayed.detail,
      ...(status.activeExecution === undefined && status.orchestrationMode === "automatic"
        ? [manualAuditValidation
            ? translate("tui.orchestration.summary.audit")
            : features.length === 0
            ? translate("tui.orchestration.summary.noFeature")
            : translate("tui.orchestration.summary.confirmation")]
        : []),
      ...(status.activeExecution === undefined && status.orchestrationMode !== "automatic"
        ? [translate("tui.orchestration.summary.disabled")]
        : []),
    ];
  }
}

function requireCurrentExecution(status: OrchestrationStatus): ExecutionRecord {
  const execution = status.activeExecution ?? status.latestExecution;
  if (execution === undefined) throw new Error("No assisted mission is available.");
  return execution;
}

function isRetryable(execution: ExecutionRecord | undefined): boolean {
  return execution?.status === "failed" || execution?.status === "cancelled" || execution?.status === "interrupted";
}

function campaignRetryItem(campaign: NonNullable<OrchestrationStatus["activeCampaign"]>): readonly MenuItem<OrchestrationAction>[] { return campaign.status !== "blocked" || campaign.actionRequired?.kind !== "retry" ? [] : [{ label: translate("tui.orchestration.mission.retry"), value: "retry-campaign", description: campaign.actionRequired.reason }]; }

function previousMode(mode: AssistedViewMode): AssistedViewMode {
  if (mode === "decision-input") return "overview";
  if (mode === "changes-preview") return "overview";
  if (mode === "model-input") return "provider-selection";
  if (mode === "workspace-selection") return "model-input";
  if (mode === "target-selection" || mode === "provider-selection") return "preview";
  return "overview";
}

function providerFromAction(action: OrchestrationAction): ExecutionProvider {
  const value = action.slice("provider:".length);
  if ((EXECUTION_PROVIDER_CHOICES as readonly string[]).includes(value)) return value as ExecutionProvider;
  throw new Error("Unknown assistant selection.");
}
