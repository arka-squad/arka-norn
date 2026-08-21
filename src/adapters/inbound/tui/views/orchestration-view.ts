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

import { titledBox } from "../components/box.js";
import { createMenuScene, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import type { Scene } from "../runtime/tui-app.js";
import {
  displayCandidateReason,
  displayMissionAction,
  displayMissionEvents,
  displayMissionStatus,
  displayPermission,
  displayProvider,
  displayRole,
  displayScopePath,
  displayStep,
  displayTarget,
  isReadOnlyAnalysisAwaitingValidation,
  translatePreparationError,
} from "./orchestration-presentation.js";

type AssistedViewMode = "overview" | "feature-selection" | "preview" | "target-selection" | "provider-selection" | "model-input";
type OrchestrationAction =
  | "prepare"
  | "refresh"
  | "refresh-preview"
  | "start"
  | "choose-feature"
  | "choose-target"
  | "configure-target"
  | "cancel"
  | "approve"
  | "retry"
  | "inspect"
  | "back"
  | `feature:${string}`
  | `target:${number}`
  | `provider:${ExecutionProvider}`;

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
  let busy = false;
  let message: string | undefined;
  let menu = buildMenu();

  function buildMenu(): MenuScene {
    return createMenuScene<OrchestrationAction>(items(), {
      hint: "↑/↓ naviguer · Entrée confirmer · Échap retour",
      maxVisible: 10,
      onSelect: (action) => void select(action),
    });
  }

  function items(): readonly MenuItem<OrchestrationAction>[] {
    if (viewMode === "feature-selection") {
      return [
        ...features.map((feature) => ({
          label: feature.name,
          value: `feature:${feature.id.value}` as const,
          description: "préparer sa prochaine étape sans lancer d’assistant",
        })),
        { label: "← Retour au Pilote assisté", value: "back" },
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
            ? "recommandé par Arka selon les règles du Project"
            : "compatible avec le périmètre et les autorisations prévus",
        })),
        { label: "Enregistrer un autre assistant et modèle", value: "configure-target", description: "ce choix sera vérifié avant toute mission" },
        { label: "← Revenir à la préparation", value: "back" },
      ];
    }

    if (viewMode === "provider-selection") {
      return [
        ...EXECUTION_PROVIDER_CHOICES.map((provider) => ({
          label: displayProvider(provider),
          value: `provider:${provider}` as const,
          description: "choisir ensuite le modèle à enregistrer pour ce Project",
        })),
        { label: "← Revenir à la préparation", value: "back" },
      ];
    }

    if (viewMode === "preview") {
      const candidate = selectedCandidate();
      return [
        ...(candidate === undefined
          ? []
          : [{
              label: `Confirmer et lancer avec ${displayTarget(candidate.target)}`,
              value: "start" as const,
              description: "Arka vérifiera de nouveau cette préparation juste avant le lancement",
            }]),
        ...(selectableCandidates(requirePreview()).length > 1
          ? [{ label: "Choisir un autre assistant et modèle", value: "choose-target" as const, description: "seuls les choix compatibles sont proposés" }]
          : []),
        { label: "Enregistrer un autre assistant et modèle", value: "configure-target", description: "ce choix sera vérifié avant toute mission" },
        { label: "Actualiser cette préparation", value: "refresh-preview", description: "relit la Feature et les règles sans rien lancer" },
        ...(features.length > 1 ? [{ label: "Choisir une autre Feature", value: "choose-feature" as const }] : []),
        { label: "← Retour au Pilote assisté", value: "back" },
      ];
    }

    const active = status.activeExecution;
    if (active !== undefined) {
      return [
        ...(active.status === "planned" || active.status === "running" || active.status === "awaiting_approval"
          ? [{ label: "Arrêter la mission", value: "cancel" as const, description: "l’arrêt est explicite et ne supprime aucun résultat" }]
          : []),
        ...(active.status === "awaiting_approval"
          ? [{ label: "Donner mon accord et reprendre", value: "approve" as const, description: "Arka vérifiera de nouveau les conditions avant la reprise" }]
          : []),
        ...(active.status === "failed" || active.status === "cancelled" || active.status === "interrupted"
          ? [{ label: "Reprendre avec le même assistant", value: "retry" as const, description: "le choix initial reste inchangé" }]
          : []),
        ...(status.actionRequired?.kind === "inspect"
          ? [{ label: "Vérifier ce qui bloque", value: "inspect" as const, description: "affiche une explication sans donnée technique" }]
          : []),
        { label: "Actualiser le suivi", value: "refresh", description: "aucun assistant n’est lancé" },
        { label: "← Retour au Project", value: "back" },
      ];
    }

    const manualAuditValidation = isReadOnlyAnalysisAwaitingValidation(status.latestExecution);
    return [
      ...(isRetryable(status.latestExecution)
        ? [{ label: "Reprendre avec le même assistant", value: "retry" as const, description: "le choix initial reste inchangé" }]
        : []),
      ...(status.actionRequired?.kind === "inspect"
        ? [{
            label: manualAuditValidation ? "Voir la validation attendue" : "Vérifier ce qui bloque",
            value: "inspect" as const,
            description: manualAuditValidation ? "explique le livrable à valider avant la suite" : "affiche une explication sans donnée technique",
          }]
        : []),
      ...(status.orchestrationMode !== "automatic" || features.length === 0 || manualAuditValidation
        ? []
        : [{
            label: features.length === 1
              ? `Préparer la mission de « ${features[0]!.name} »`
              : "Choisir une Feature à préparer",
            value: "prepare" as const,
            description: "aucun assistant ne sera lancé avant votre confirmation",
          }]),
      { label: "Actualiser le suivi", value: "refresh", description: "aucun assistant n’est lancé" },
      { label: "← Retour au Project", value: "back", ...(status.orchestrationMode !== "automatic" ? { description: "activez le Pilote assisté avant de préparer une mission" } : {}) },
    ];
  }

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
      await updateCurrentMission((execution) => deps.orchestration.cancel({ projectId: project.id, executionId: execution.id }), "La mission a été arrêtée.");
      return;
    }
    if (action === "approve") {
      await updateCurrentMission((execution) => deps.orchestration.approve({ projectId: project.id, executionId: execution.id }), "Votre accord a été enregistré. Arka prépare la reprise.");
      return;
    }
    if (action === "retry") {
      await updateCurrentMission((execution) => deps.orchestration.retry({ projectId: project.id, executionId: execution.id }), "La mission va reprendre avec le même assistant.");
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

  async function configureSelectedTarget(): Promise<void> {
    const provider = selectedProvider;
    const model = modelInput.trim();
    const feature = selectedFeature;
    if (provider === undefined || feature === undefined || model.length === 0) {
      message = "Indiquez un modèle avant de l’enregistrer pour ce Project.";
      deps.redraw();
      return;
    }
    await run(async () => {
      await deps.orchestration.configure({ projectId: project.id, selection: { provider, model } });
      await preparePreview(feature, { provider, model });
      message = `Le choix ${displayProvider(provider)} · ${model} est enregistré. Vérifiez la préparation avant de confirmer.`;
    });
  }

  async function startPreparedMission(): Promise<void> {
    const prepared = preview;
    const feature = selectedFeature;
    const candidate = selectedCandidate();
    const model = candidate?.target.model;
    if (prepared === undefined || feature === undefined || candidate === undefined || model === undefined) {
      message = "Cette préparation ne contient pas de choix d’assistant complet. Actualisez-la avant de continuer.";
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
      message = `La mission a été confiée à ${displayTarget(candidate.target)}. Arka vérifiera son résultat avant toute suite.`;
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
      void configureSelectedTarget();
    }
    deps.redraw();
    return "consumed";
  }

  return {
    chrome: { contextBanner: false },
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (viewMode === "model-input") return handleModelInput(event);
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
        for (const value of titledBox("Pilote assisté", renderSummary(), theme, { border: theme.arkaAccent }).split("\n")) line(value);
        line("");
        if (busy) line(`  ${theme.dim("Préparation en cours…")}`);
        if (message !== undefined) line(`  ${theme.arkaAccent(message)}`);
        if (viewMode !== "model-input") {
          for (const value of menu.renderLines(theme)) line(value);
        }
      });
    },
  };

  function renderSummary(): readonly string[] {
    if (viewMode === "feature-selection") {
      return [
        `Project : ${project.name}`,
        "Choisissez la Feature à préparer.",
        "Cette étape est une prévisualisation : aucun assistant ne sera lancé.",
      ];
    }
    if (viewMode === "target-selection") {
      const choices = selectableCandidates(requirePreview());
      return [
        `Feature : ${requirePreview().featureName}`,
        choices.length === 0
          ? "Aucun assistant et modèle compatibles ne sont encore disponibles."
          : "Choisissez l’assistant et le modèle à confirmer.",
        choices.length === 0
          ? "Vous pouvez enregistrer un choix, qu’Arka vérifiera avant toute mission."
          : "Arka ne propose que les choix compatibles avec le périmètre et les autorisations prévus.",
      ];
    }
    if (viewMode === "provider-selection") {
      return [
        `Feature : ${requirePreview().featureName}`,
        "Choisissez l’assistant dont vous voulez enregistrer le modèle.",
        "Arka vérifiera ce choix avant toute mission.",
      ];
    }
    if (viewMode === "model-input") {
      return [
        `Assistant : ${selectedProvider === undefined ? "à choisir" : displayProvider(selectedProvider)}`,
        "Indiquez le nom du modèle à utiliser. N’entrez jamais une clé ou un secret.",
        "",
        `Modèle : ${modelInput}_`,
        "Entrée enregistre et prépare de nouveau la mission · Échap revient au choix de l’assistant",
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
      `Pilote assisté : ${status.orchestrationMode === "automatic" ? "activé" : "désactivé"}`,
      ...missionSummary,
      `Situation : ${displayed.title}`,
      displayed.detail,
      ...(status.activeExecution === undefined && status.orchestrationMode === "automatic"
        ? [manualAuditValidation
            ? "Validez le livrable d’audit avant de préparer la suite."
            : features.length === 0
            ? "Créez ou importez une Feature avant de préparer une mission."
            : "Aucun assistant ne sera lancé avant votre confirmation de la préparation."]
        : []),
      ...(status.activeExecution === undefined && status.orchestrationMode !== "automatic"
        ? ["Activez le Pilote assisté depuis le Project pour préparer une mission. Le lancement manuel reste disponible dans le cockpit Feature."]
        : []),
    ];
  }
}

function renderMissionSummary(
  execution: ExecutionRecord,
  actionRequired: OrchestrationStatus["actionRequired"],
  isActive: boolean,
): readonly string[] {
  const action = displayMissionAction(execution, actionRequired);
  return [
    `${isActive ? "Mission active" : "Dernière mission"} : ${execution.id}`,
    `Étape : ${displayStep(execution.order.preconditions.nextStepId)}`,
    `Assistant : ${displayTarget(execution.target)}`,
    "Derniers événements :",
    ...displayMissionEvents(execution).map((event) => `  · ${event}`),
    `Action attendue : ${action.title}`,
    `Pourquoi : ${action.detail}`,
  ];
}

function renderPreviewSummary(preview: OrchestrationPreview, selectedCandidateIndex: number | undefined): readonly string[] {
  const selected = selectedCandidateIndex === undefined ? undefined : preview.candidates[selectedCandidateIndex];
  const compatible = selectableCandidates(preview);
  const unavailable = preview.candidates.filter((candidate) => !candidate.eligible);
  return [
    "Préparation terminée : aucun assistant n’a été lancé.",
    `Feature : ${preview.featureName}`,
    `Ce qui sera fait : ${preview.summary}`,
    `Étape : ${displayStep(preview.stepId)}`,
    `Responsabilité : ${displayRole(preview.role)}`,
    `Périmètre : ${preview.scopePaths.map(displayScopePath).join(" · ")}`,
    `Autorisations : ${preview.requiredPermissions.map(displayPermission).join(" · ")}`,
    `Assistant à confirmer : ${selected?.eligible === true && selected.target.model !== undefined ? displayTarget(selected.target) : "aucun choix disponible"}`,
    ...(compatible.length > 1 ? [`Autres choix compatibles : ${compatible.length - 1}`] : []),
    ...(unavailable.length === 0
      ? []
      : ["Choix non disponibles : " + unavailable.map((candidate) => `${displayTarget(candidate.target)} (${candidate.reasons.map(displayCandidateReason).join(", ")})`).join(" · ")]),
    "Arka recalculera ces informations au moment de votre confirmation.",
  ];
}

function selectableCandidates(preview: OrchestrationPreview): readonly { readonly candidate: OrchestrationPreviewCandidate; readonly index: number }[] {
  return preview.candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.eligible && candidate.target.model !== undefined)
    .sort((left, right) => Number(right.candidate.recommended) - Number(left.candidate.recommended));
}

function requireCurrentExecution(status: OrchestrationStatus): ExecutionRecord {
  const execution = status.activeExecution ?? status.latestExecution;
  if (execution === undefined) throw new Error("No assisted mission is available.");
  return execution;
}

function isRetryable(execution: ExecutionRecord | undefined): boolean {
  return execution?.status === "failed" || execution?.status === "cancelled" || execution?.status === "interrupted";
}

function previousMode(mode: AssistedViewMode): AssistedViewMode {
  if (mode === "model-input") return "provider-selection";
  if (mode === "target-selection" || mode === "provider-selection") return "preview";
  return "overview";
}

function providerFromAction(action: OrchestrationAction): ExecutionProvider {
  const value = action.slice("provider:".length);
  if ((EXECUTION_PROVIDER_CHOICES as readonly string[]).includes(value)) return value as ExecutionProvider;
  throw new Error("Unknown assistant selection.");
}
