import { createHash } from "node:crypto";
import { basename, relative, resolve } from "node:path";

import { DomainError } from "../../../../domain/errors.js";
import { FeatureId } from "../../../../domain/feature/feature-id.js";
import type { Feature } from "../../../../domain/feature/feature.js";
import type { Project } from "../../../../domain/project/project.js";
import type { AgentRegistration } from "../../../../domain/agent/agent.js";
import type { ForFeatures } from "../../../../ports/inbound/for-features.js";
import type { ForScan } from "../../../../ports/inbound/for-scan.js";
import { mapConcurrent } from "../../../../application/shared/map-concurrent.js";
import { titledBox } from "../components/box.js";
import { GUIDED_SHORTCUTS, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import type { Scene } from "../runtime/tui-app.js";

type ProjectAction = "action:fastdev" | "action:standard" | "action:import" | "action:agents" | "action:scan" | "action:forget" | "action:back" | `feature:${string}`;

export interface ProjectDetailViewDeps {
  readonly project: Project;
  readonly initialFeatures: readonly Feature[];
  readonly initialStatuses?: ReadonlyMap<string, string>;
  readonly initialMetrics?: ReadonlyMap<string, ProjectFeatureMetrics>;
  readonly initialAgents?: readonly AgentRegistration[];
  readonly currentAgentId?: string;
  readonly features: ForFeatures;
  readonly scan: ForScan;
  readonly redraw: () => void;
  readonly onBack: () => void;
  readonly onFeatureFocused?: (feature: Feature | undefined) => void;
  readonly onOpenFeature?: (feature: Feature) => Promise<void> | void;
  readonly onForget?: (project: Project) => Promise<void> | void;
  readonly onManageAgents?: (project: Project) => Promise<void> | void;
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
}

export function createProjectDetailView(deps: ProjectDetailViewDeps): ProjectDetailView {
  let features = [...deps.initialFeatures];
  let statuses = new Map(deps.initialStatuses ?? []);
  let metrics = new Map(deps.initialMetrics ?? []);
  let agents = [...(deps.initialAgents ?? [])];
  let currentAgentId = deps.currentAgentId;
  let mode: "menu" | "create" | "confirm-fastdev" = "menu";
  let createKind: "fastdev" | "standard" | "import" = "standard";
  let createPath = `${deps.project.root}/`;
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
      { label: "Démarrer un rework FastDev", value: "action:fastdev", description: "4 documents · audit bloquant · correction conditionnelle" },
      { label: "Créer une Feature standard", value: "action:standard", description: "cycle complet à dix étapes" },
      { label: "Importer une Feature existante", value: "action:import", description: "utilise son marqueur et son workflow" },
      ...groupedFeatures.map((feature) => {
        const featureMetrics = metrics.get(feature.id.value);
        const badge = feature.pipelineId === "arka-norn-fastdev" ? "[FASTDEV] " : "";
        const progress = featureMetrics === undefined ? "" : ` · ${featureMetrics.phase} · ${featureMetrics.progress}${featureMetrics.phase === "Développement" && featureMetrics.iteration > 1 ? ` · itération ${featureMetrics.iteration}` : ""}`;
        return { label: `● ${badge}[${statuses.get(feature.id.value) ?? "inconnu"}] ${feature.name}${progress}`, value: `feature:${feature.id.value}` as const, description: feature.root };
      }),
      { label: "Gérer les agents du projet", value: "action:agents", description: "identités, périmètres, agent courant et remplacements" },
      { label: "Rescanner le projet", value: "action:scan" },
      { label: "Retirer ce projet de l’index", value: "action:forget" },
      { label: "← Retour", value: "action:back" },
    ];
  }

  function buildMenu(): MenuScene {
    return createMenuScene<ProjectAction>(items(), {
      hint: "↑/↓ naviguer · Entrée ouvrir · / filtrer · ? aide · Échap retour",
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
    } else if (value === "action:fastdev") {
      createKind = "fastdev";
      mode = "confirm-fastdev";
      deps.redraw();
    } else if (value === "action:standard") {
      createKind = "standard";
      mode = "create";
      deps.redraw();
    } else if (value === "action:import") {
      createKind = "import";
      mode = "create";
      deps.redraw();
    } else if (value === "action:agents") {
      await run(async () => { await deps.onManageAgents?.(deps.project); });
    } else if (value === "action:scan") {
      await run(async () => {
        const results = await deps.scan.scan({ target: deps.project.root, projectId: deps.project.id });
        await refresh();
        message = `Scan terminé : ${results.filter((entry) => entry.feature !== undefined).length} feature(s).`;
      });
    } else if (value === "action:forget") {
      await run(() => deps.onForget?.(deps.project));
    } else {
      deps.onBack();
    }
  }

  async function submit(): Promise<void> {
    if (busy) return;
    const root = resolve(createPath.trim());
    if (!isContained(deps.project.root, root)) {
      message = `La Feature doit rester dans le Project "${deps.project.root}".`;
      deps.redraw();
      return;
    }
    await run(async () => {
      const name = basename(root);
      if (createKind === "import") {
        await deps.features.importFrom({ root, projectId: deps.project.id });
      } else {
        await deps.features.create({
          id: deriveFeatureId(root, slugify(name)),
          projectId: deps.project.id,
          name,
          root,
          pipelineId: createKind === "fastdev" ? "arka-norn-fastdev" : "arka-norn-default",
        });
      }
      mode = "menu";
      await refresh();
    });
  }

  async function refresh(): Promise<void> {
    features = (await deps.features.list()).filter((feature) => feature.belongsTo(deps.project.id));
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
      if (mode === "create") {
        if (event.kind === "escape") mode = "menu";
        else if (event.kind === "enter" && !busy) void submit();
        else if (event.kind === "backspace") createPath = createPath.slice(0, -1);
        else if (event.kind === "char") createPath += event.value;
        else if (event.kind === "filter") createPath += "/";
        deps.redraw();
        return "consumed";
      }
      if (mode === "confirm-fastdev") {
        if (event.kind === "escape") mode = "menu";
        else if (event.kind === "enter") mode = "create";
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
            title: "Aide — espace Project",
            purpose: "Un Project regroupe ses Features et son registre d’agents. Rien n’est produit avant d’avoir choisi une identité active.",
            steps: [
              "Ouvrez « Gérer les agents » et enregistrez ou sélectionnez votre identité.",
              "Créez/importez une Feature dans la racine du Project.",
              "Ouvrez la Feature prioritaire et suivez l’action recommandée par son Pipeline.",
              "Utilisez le scan pour reconstruire l’index depuis les marqueurs portables.",
            ],
            shortcuts: GUIDED_SHORTCUTS,
          }, theme)) line(value);
          return;
        }
        if (mode === "confirm-fastdev") {
          for (const value of titledBox("Démarrer un rework FastDev", [
            "Parcours court : cadrage → développement → audit → validation.",
            "4 documents structurés · un même Agent peut tout exécuter.",
            "L'audit est bloquant ; une seconde passe Dev n'existe que si des corrections sont requises.",
            "FastDev convient uniquement à un rework borné.",
            "",
            "Entrée continue · Échap annule sans modifier",
          ], theme, { border: theme.arkaRed }).split("\n")) line(value);
          return;
        }
        if (mode === "create") {
          const title = createKind === "import" ? "Importer une Feature existante" : createKind === "fastdev" ? "Dossier du rework FastDev" : "Créer une Feature standard";
          const explanation = createKind === "import"
            ? "Indiquez un dossier enfant qui contient déjà .arka-norn/feature.json."
            : `Indiquez le nouveau dossier enfant. Workflow : ${createKind === "fastdev" ? "FastDev" : "standard"}.`;
          for (const value of titledBox(title, [
            explanation,
            `Racine autorisée : ${deps.project.root}`,
            `Exemple : ${deps.project.root}/ma-feature`,
            "",
            `${createPath}${theme.dim("_")}`,
            message ?? "Entrée confirme · Échap annule sans modifier",
          ], theme).split("\n")) line(value);
          return;
        }
        const health = [...statuses.values()].reduce<Record<string, number>>((counts, status) => ({ ...counts, [status]: (counts[status] ?? 0) + 1 }), {});
        const groups = Object.entries(health).sort(([left], [right]) => left.localeCompare(right)).map(([status, count]) => `${status}=${count}`).join(" · ") || "aucune";
        const totals = [...metrics.values()].reduce((sum, item) => ({
          debts: sum.debts + item.debtDocuments,
          qa: sum.qa + item.qaFailures,
          handoffs: sum.handoffs + item.handoffSignals,
          invalid: sum.invalid + item.invalidDocuments,
        }), { debts: 0, qa: 0, handoffs: 0, invalid: 0 });
        for (const value of titledBox(deps.project.name, [
          `Racine : ${deps.project.root}`,
          `Features : ${features.length}`,
          `États : ${groups}`,
          `Dettes : ${totals.debts} · anomalies QA : ${totals.qa} · handoffs : ${totals.handoffs} · documents invalides : ${totals.invalid}`,
          `Agents : ${agents.filter((agent) => agent.active).length} actif(s) / ${agents.length} · courant : ${currentAgentId ?? "aucun"}`,
        ], theme, { border: theme.arkaRed }).split("\n")) line(value);
        line("");
        line(nextActionLine(
          currentAgentId === undefined ? "Gérer les agents du projet" : features.length === 0 ? "Choisir FastDev, standard ou import" : "Ouvrir une Feature",
          currentAgentId === undefined ? "une identité active est requise avant tout document" : features.length === 0 ? "aucun pipeline n’est encore piloté" : "le Pipeline indiquera quoi faire et pourquoi",
          theme,
        ));
        if (features.length === 0) line(`  ${theme.dim("Démarrage guidé : identité → Feature → statut Pipeline → scaffold signé → validation.")}`);
        if (busy) line(`  ${theme.dim("Chargement…")}`);
        if (message !== undefined) line(`  ${theme.arkaAccent(message)}`);
        for (const value of menu.renderLines(theme)) line(value);
      });
    },
    setAgents(updatedAgents, updatedCurrentAgentId): void {
      agents = [...updatedAgents];
      currentAgentId = updatedCurrentAgentId;
      deps.redraw();
    },
  };
}

function isContained(projectRoot: string, featureRoot: string): boolean {
  const relation = relative(resolve(projectRoot), resolve(featureRoot));
  return relation.length > 0 && !relation.startsWith("..") && !relation.startsWith("/");
}

function deriveFeatureId(root: string, code: string): FeatureId {
  const suffix = createHash("sha1").update(root).digest("hex").slice(0, 8);
  return FeatureId.of(`${code.slice(0, 55)}-${suffix}`);
}

function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length === 0) throw new DomainError("INVALID_FEATURE_OPTION", `Nom de Feature inexploitable : "${name}".`);
  return slug;
}
