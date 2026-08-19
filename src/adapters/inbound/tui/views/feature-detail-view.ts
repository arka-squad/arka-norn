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
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Scene } from "../runtime/tui-app.js";
import type { Theme } from "../runtime/theme.js";
import type { Feature } from "../../../../domain/feature/feature.js";
import type { PipelineReport } from "../../../../domain/pipeline/pipeline-report.js";
import { createFeatureCockpitViewModel } from "../../../../application/view-models/feature-cockpit.js";

type FeatureDetailAction = "action:status" | "action:scaffold" | "action:validate" | "action:forget" | "action:back";

export interface FeatureDetailViewDeps {
  readonly feature: Feature;
  readonly report: PipelineReport;
  readonly redraw: () => void;
  readonly onBack: () => void;
  readonly onShowStatus?: (feature: Feature) => Promise<void> | void;
  readonly onScaffold?: (feature: Feature) => Promise<void> | void;
  readonly onValidate?: (feature: Feature) => Promise<void> | void;
  readonly onForget?: (feature: Feature) => Promise<void> | void;
}

export interface FeatureDetailView extends Scene {}

const ANGLE_RIGHT = String.fromCharCode(0x276f);
const LEFT_ARROW = String.fromCharCode(0x2190);
const EM_DASH = String.fromCharCode(0x2014);
const HORIZONTAL = String.fromCharCode(0x2500);

export function createFeatureDetailView(deps: FeatureDetailViewDeps): FeatureDetailView {
  const cockpit = createFeatureCockpitViewModel(deps.feature, deps.report);
  let menu = buildMenu();
  let busy = false;
  let status: string | undefined;

  function buildMenu(): MenuScene {
    return createMenuScene<FeatureDetailAction>(buildMenuItems(), {
      title: deps.feature.name,
      hint: "Flèches naviguer, Entrée sélectionner, / filtrer, Échap retour",
      maxVisible: 12,
      onSelect: (value) => {
        void handleSelect(value);
      },
    });
  }

  async function handleSelect(value: FeatureDetailAction): Promise<void> {
    if (busy) return;

    switch (value) {
      case "action:status":
        if (deps.onShowStatus !== undefined) {
          await run(() => deps.onShowStatus!(deps.feature));
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
    deps.redraw();
    try {
      await task();
    } finally {
      busy = false;
      deps.redraw();
    }
  }

  return {
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (busy) return "consumed";
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
    const lines = [
      `  ${theme.bold(deps.feature.name)}`,
      `  ${theme.gray(deps.feature.root)}`,
      `  État : ${theme.arkaAccent(cockpit.overallStatus)} · ${cockpit.progress}`,
      `  Prochaine action : ${cockpit.nextAction}`,
      `  Runs : dev=${cockpit.developmentRuns} QA=${cockpit.qaRuns} échecs=${cockpit.qaFailures} · dettes=${cockpit.debtDocuments} · handoffs=${cockpit.handoffSignals}`,
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
    lines.push(`  ${theme.dim("Flèches naviguer, Entrée sélectionner, / filtrer, Échap retour")}`);
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
      { label: "Statut du pipeline", value: "action:status", description: "étapes valides/invalides/absentes + prochaine action" },
      { label: "Générer un squelette (scaffold)", value: "action:scaffold", description: "démarrer une nouvelle étape" },
      { label: "Valider un document", value: "action:validate", description: "vérifier un fichier JSON contre son schema" },
      { label: "Retirer de l'index", value: "action:forget" },
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
