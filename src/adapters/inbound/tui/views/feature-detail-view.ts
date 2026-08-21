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

/**
 * FeatureDetailView -- écran d'une feature sélectionnée : statut pipeline,
 * scaffold, validation, retrait. Modelé sur project-detail-view.ts
 * (arka-cc-management), sans équivalent direct : "bundles" (agents/hooks/
 * teams installés) n'existe pas pour une feature -- remplacé par les 4
 * actions pipeline (status/scaffold/validate/forget), chacune déléguée à
 * un callback fourni par composition/container.ts (qui seul connaît `app`
 * et peut pousser TextInput/ResultView -- cf. home-view.ts).
 */
import { createMenuScene, filterItems, type MenuItem, type MenuScene } from "../components/menu.js";
import { GUIDED_SHORTCUTS, renderGuidance } from "../components/guidance.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";
import type { Feature } from "../../../../domain/feature/feature.js";
import type { PipelineReport } from "../../../../domain/pipeline/pipeline-report.js";
import { createFeatureCockpitViewModel } from "../../../../application/view-models/feature-cockpit.js";

type FeatureDetailAction = "action:continue" | "action:orchestrate" | "action:status" | "action:scaffold" | "action:validate" | "action:forget" | "action:back";

export interface FeatureDetailViewDeps {
  readonly feature: Feature;
  readonly report: PipelineReport;
  readonly currentAgentId?: string;
  readonly sessionId?: string;
  readonly redraw: () => void;
  readonly onBack: () => void;
  readonly onShowStatus?: (feature: Feature) => Promise<void> | void;
  readonly onContinue?: (feature: Feature) => Promise<void> | void;
  readonly onOrchestrate?: (feature: Feature) => Promise<void> | void;
  readonly onScaffold?: (feature: Feature) => Promise<void> | void;
  readonly onValidate?: (feature: Feature) => Promise<void> | void;
  readonly onForget?: (feature: Feature) => Promise<void> | void;
}

export type FeatureDetailView = Scene;

const ANGLE_RIGHT = String.fromCharCode(0x276f);
const LEFT_ARROW = String.fromCharCode(0x2190);
const EM_DASH = String.fromCharCode(0x2014);
const HORIZONTAL = String.fromCharCode(0x2500);

export function createFeatureDetailView(deps: FeatureDetailViewDeps): FeatureDetailView {
  const cockpit = createFeatureCockpitViewModel(deps.feature, deps.report);
  const menu = buildMenu();
  let busy = false;
  let status: string | undefined;
  let helpVisible = false;

  function buildMenu(): MenuScene {
    return createMenuScene<FeatureDetailAction>(buildMenuItems(), {
      title: deps.feature.name,
      hint: "↑/↓ naviguer · Entrée agir · / filtrer · ? aide · Échap retour",
      maxVisible: 12,
      onSelect: (value) => {
        void handleSelect(value);
      },
    });
  }

  async function handleSelect(value: FeatureDetailAction): Promise<void> {
    if (busy) return;

    switch (value) {
      case "action:continue":
        if (deps.onContinue !== undefined) {
          await run(() => deps.onContinue!(deps.feature));
          return;
        }
        status = "Action indisponible.";
        deps.redraw();
        return;
      case "action:status":
        if (deps.onShowStatus !== undefined) {
          await run(() => deps.onShowStatus!(deps.feature));
          return;
        }
        status = "Action indisponible.";
        deps.redraw();
        return;
      case "action:orchestrate":
        if (deps.onOrchestrate !== undefined) {
          await run(() => deps.onOrchestrate!(deps.feature));
          return;
        }
        status = "Action indisponible.";
        deps.redraw();
        return;
      case "action:scaffold":
        if (deps.onScaffold !== undefined) {
          await run(() => deps.onScaffold!(deps.feature));
          return;
        }
        status = "Action indisponible.";
        deps.redraw();
        return;
      case "action:validate":
        if (deps.onValidate !== undefined) {
          await run(() => deps.onValidate!(deps.feature));
          return;
        }
        status = "Action indisponible.";
        deps.redraw();
        return;
      case "action:forget":
        if (deps.onForget !== undefined) {
          await run(() => deps.onForget!(deps.feature));
          return;
        }
        status = "Action indisponible.";
        deps.redraw();
        return;
      case "action:back":
        deps.onBack();
        return;
    }
  }

  async function run(task: () => Promise<void> | void): Promise<void> {
    busy = true;
    status = undefined;
    deps.redraw();
    try {
      await task();
    } catch (error) {
      status = `Action impossible : ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      busy = false;
      deps.redraw();
    }
  }

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (busy) return "consumed";
      if (event.kind === "help") {
        helpVisible = !helpVisible;
        deps.redraw();
        return "consumed";
      }
      if (helpVisible) {
        if (event.kind === "escape") helpVisible = false;
        deps.redraw();
        return "consumed";
      }
      const result = menu.onKey(event);
      if (event.kind === "enter") return "consumed";
      if (event.kind === "escape") {
        deps.onBack();
        return "consumed";
      }
      return result;
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        for (const rendered of renderFeatureDetail(theme)) {
          line(rendered);
        }
      });
    },
  };

  function renderFeatureDetail(theme: Theme): readonly string[] {
    if (helpVisible) {
      return renderGuidance({
        title: "Aide — cockpit Feature",
        purpose: cockpit.workflowBadge === "FASTDEV"
          ? "FastDev guide un rework borné : quatre documents, audit bloquant et correction conditionnelle. La validation doit viser le dernier CR."
          : "Le Pipeline décide de la prochaine action à partir des documents réellement présents, de leur schéma, de leurs dépendances et du verdict métier.",
        steps: [
          "Lisez l’action recommandée et sa raison ; ne sautez pas à une étape ultérieure.",
          "Si l’action demande un document, vérifiez qu’un agent actif est affiché puis utilisez le scaffold.",
          "Remplissez toutes les valeurs À_REMPLIR et validez le fichier.",
          "Relancez le statut après chaque document ; une QA fail renvoie au développement.",
        ],
        shortcuts: GUIDED_SHORTCUTS,
      }, theme);
    }
    const lines = [
      `  ${cockpit.workflowBadge === undefined ? "" : `${theme.arkaRed(`[${cockpit.workflowBadge}]`)} `}${theme.bold(deps.feature.name)}`,
      `  ${theme.gray(deps.feature.root)}`,
      `  État : ${theme.arkaAccent(cockpit.overallStatus)} · ${cockpit.progress}`,
      `  Agent auteur : ${deps.currentAgentId ?? "aucun — revenez au Project > Gérer les agents"}`,
      `  Session Agent : ${deps.sessionId ?? "main"} · la sélection est isolée des autres sessions`,
      `  Prochaine action : ${cockpit.nextAction}`,
      `  Pourquoi : ${cockpit.nextReason}`,
      `  Runs : dev=${cockpit.developmentRuns} QA=${cockpit.qaRuns} échecs=${cockpit.qaFailures} · dettes=${cockpit.debtDocuments} · handoffs=${cockpit.handoffSignals}`,
      ...(cockpit.workflowBadge === "FASTDEV" ? [
        `  Itération Dev : ${cockpit.iteration} · constats ouverts : ${cockpit.openFindings} · corrections fermées : ${cockpit.closedCorrections}`,
        `  Commit audité : ${cockpit.latestAuditedCommit ?? "aucun"} · validation : ${cockpit.validationState}`,
      ] : []),
      "",
      `  ${theme.bold("Timeline du pipeline")}`,
      ...cockpit.timeline.map((step) => `    ${step}`),
      "",
    ];
    if (busy) {
      lines.push(`  ${theme.dim("Chargement…")}`);
      lines.push("");
    } else if (status !== undefined) {
      lines.push(`  ${theme.arkaAccent(status)}`);
      lines.push("");
    }

    if (menu.filterMode) {
      lines.push(...renderFlatItems(resolveVisibleItems(buildMenuItems(), theme.stripAnsi), menu.cursor, theme, "index"));
    } else {
      lines.push(...renderFlatItems(buildMenuItems().map((item, index) => ({ ...item, _origIndex: index })), menu.cursor, theme, "origin"));
    }

    lines.push("");
    lines.push(`  ${theme.dim(HORIZONTAL.repeat(44))}`);
    lines.push(`  ${theme.dim("↑/↓ naviguer · Entrée agir · / filtrer · ? aide · Échap retour")}`);
    if (menu.filterMode) {
      lines.push(`  / ${menu.filterText}${theme.dim("_")}`);
    }
    return lines;
  }

  function renderFlatItems(
    items: readonly (MenuItem<FeatureDetailAction> & { readonly _origIndex: number })[],
    cursor: number,
    theme: Theme,
    matchCursorOn: "index" | "origin",
  ): readonly string[] {
    if (items.length === 0) {
      return [`    ${theme.dim("(vide)")}`];
    }

    return items.map((item, index) => {
      const active = matchCursorOn === "index" ? index === cursor : item._origIndex === cursor;
      const marker = active ? theme.arkaRed(ANGLE_RIGHT) : " ";
      const label = active ? theme.bold(item.label) : item.label;
      const description = item.description === undefined ? "" : ` ${theme.gray(`${EM_DASH} ${item.description}`)}`;
      return `  ${marker} ${label}${description}`;
    });
  }

  function buildMenuItems(): readonly MenuItem<FeatureDetailAction>[] {
    return [
      { label: deps.feature.pipelineId === "arka-norn-fastdev" ? "Continuer le rework" : "Continuer la Feature", value: "action:continue", description: "ouvre l'action guidée, sa raison, ses preuves et sa commande" },
      { label: "Préparer une session manuelle", value: "action:orchestrate", description: "conseil Product, prompts parallèles et contexte principal ; aucun lancement automatique" },
      { label: "Voir le diagnostic complet", value: "action:status", description: "présence, schéma, métier, dépendances et raison de blocage" },
      { label: "Scaffold manuel", value: "action:scaffold", description: deps.currentAgentId === undefined ? "bloqué : sélectionnez d’abord un agent dans le Project" : `action secondaire · document v3 signé par ${deps.currentAgentId}` },
      { label: "Valider un document rempli", value: "action:validate", description: "détecte champs manquants, sentinelles et contrat invalide" },
      { label: "Retirer de l'index", value: "action:forget", description: "conserve les fichiers et le marqueur sur disque" },
      { label: `${LEFT_ARROW} Retour`, value: "action:back" },
    ];
  }

  function resolveVisibleItems(
    items: readonly MenuItem<FeatureDetailAction>[],
    stripAnsi: (value: string) => string,
  ): readonly (MenuItem<FeatureDetailAction> & { readonly _origIndex: number })[] {
    return menu.filterMode ? filterItems(items, menu.filterText, stripAnsi) : items.map((item, index) => ({ ...item, _origIndex: index }));
  }
}
