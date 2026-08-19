import { createHash } from "node:crypto";
import { basename } from "node:path";

import { DomainError } from "../../../../domain/errors.js";
import { ProjectId } from "../../../../domain/project/project-id.js";
import type { Project } from "../../../../domain/project/project.js";
import type { ForProjects } from "../../../../ports/inbound/for-projects.js";
import type { ForScanProjects } from "../../../../ports/inbound/for-scan-projects.js";
import { titledBox } from "../components/box.js";
import { createMenuScene, filterItems, type MenuItem, type MenuScene } from "../components/menu.js";
import type { KeyEvent } from "../runtime/input.js";
import type { Renderer } from "../runtime/render.js";
import type { Theme } from "../runtime/theme.js";
import type { Scene } from "../runtime/tui-app.js";

type HomeAction = "action:create" | "action:scan" | "action:health" | "action:install" | `project:${string}`;

export interface HomeViewDeps {
  readonly initialProjects: readonly Project[];
  readonly projects: ForProjects;
  readonly scan: ForScanProjects;
  readonly cwd: string;
  readonly contextRoot: string;
  readonly redraw: () => void;
  readonly now?: () => Date;
  readonly onProjectFocused?: (project: Project | undefined) => void;
  readonly onOpenProject?: (project: Project) => Promise<void> | void;
  readonly onShowHealth?: () => Promise<void> | void;
  readonly onInstallSkills?: () => Promise<void> | void;
  readonly skillHealth?: string;
  readonly systemHealth?: string;
}

export type HomeView = Scene;

const CIRCLE = "●";
const IDENTITY = (value: string): string => value;

export function createHomeView(deps: HomeViewDeps): HomeView {
  const now = deps.now ?? (() => new Date());
  let projects = [...deps.initialProjects];
  let mode: "menu" | "create" = "menu";
  let createPath = deps.cwd;
  let message: string | undefined;
  let busy = false;
  let menu = buildMenu();

  syncFocus();

  function items(): readonly MenuItem<HomeAction>[] {
    return [
      { label: "Créer ou importer un projet", value: "action:create" },
      ...projects.map((project) => ({
        label: `${CIRCLE} ${project.name}`,
        value: `project:${project.id.value}` as const,
        description: `${project.root}  ${formatActivity(project.updatedAt, now())}`,
      })),
      { label: "Rescanner ce dossier", value: "action:scan" },
      { label: "Santé du système", value: "action:health", description: deps.systemHealth ?? "état inconnu" },
      { label: "Installer / réparer les skills", value: "action:install", description: deps.skillHealth ?? "état inconnu" },
    ];
  }

  function buildMenu(): MenuScene {
    return createMenuScene<HomeAction>(items(), {
      hint: "Flèches naviguer, Entrée sélectionner, / filtrer, q quitter",
      maxVisible: 12,
      onSelect: (value) => void select(value),
    });
  }

  async function select(value: HomeAction): Promise<void> {
    if (busy) return;
    if (value.startsWith("project:")) {
      await run(async () => {
        const project = await deps.projects.switchTo(ProjectId.of(value.slice("project:".length)));
        await refresh();
        await deps.onOpenProject?.(project);
      });
      return;
    }
    if (value === "action:create") {
      mode = "create";
      createPath = deps.cwd;
      message = undefined;
      deps.redraw();
      return;
    }
    if (value === "action:scan") {
      await run(async () => {
        const results = await deps.scan.scan({ target: deps.cwd });
        await refresh();
        message = `Scan terminé : ${results.filter((entry) => entry.project !== undefined).length} projet(s).`;
      });
      return;
    }
    if (value === "action:health") await run(async () => { await deps.onShowHealth?.(); });
    else await run(async () => { await deps.onInstallSkills?.(); });
  }

  async function submitCreate(): Promise<void> {
    if (busy) return;
    const root = createPath.trim();
    if (root.length === 0) {
      message = "Le chemin ne peut pas être vide.";
      deps.redraw();
      return;
    }
    await run(async () => {
      const name = basename(root);
      let project: Project;
      try {
        project = await deps.projects.importFrom({ root });
      } catch (error) {
        if (!(error instanceof DomainError) || error.code !== "PROJECT_NOT_FOUND") throw error;
        project = await deps.projects.create({ id: deriveProjectId(root, slugify(name)), name, root });
      }
      mode = "menu";
      message = `Projet créé : ${project.name}`;
      await refresh();
    });
  }

  async function refresh(): Promise<void> {
    projects = [...await deps.projects.list()];
    menu = buildMenu();
    syncFocus();
  }

  async function run(task: () => Promise<void>): Promise<void> {
    busy = true;
    deps.redraw();
    try {
      await task();
    } catch (error) {
      message = translateError(error);
    } finally {
      busy = false;
      deps.redraw();
    }
  }

  function syncFocus(): void {
    const focused = visibleItems(items(), menu, IDENTITY)[menu.cursor];
    if (focused === undefined || !focused.value.startsWith("project:")) {
      deps.onProjectFocused?.(undefined);
      return;
    }
    deps.onProjectFocused?.(projects.find((project) => project.id.value === focused.value.slice("project:".length)));
  }

  return {
    chrome: { contextBanner: false },
    onKey(event: KeyEvent): "pop" | "consumed" | undefined {
      if (mode === "create") {
        if (event.kind === "escape") {
          mode = "menu";
        } else if (event.kind === "enter" && !busy) {
          void submitCreate();
        } else if (event.kind === "backspace") {
          createPath = createPath.slice(0, -1);
        } else if (event.kind === "char") {
          createPath += event.value;
        } else if (event.kind === "filter") {
          createPath += "/";
        }
        deps.redraw();
        return "consumed";
      }
      const result = menu.onKey(event);
      if (result !== undefined) syncFocus();
      return event.kind === "enter" ? "consumed" : result;
    },
    render(renderer: Renderer, theme: Theme): void {
      renderer.redraw((line) => {
        if (mode === "create") {
          for (const value of titledBox("Créer ou importer un projet", ["Chemin absolu :", `${createPath}${theme.dim("_")}`, message ?? ""], theme).split("\n")) line(value);
          return;
        }
        for (const value of renderHome(theme)) line(value);
      });
    },
  };

  function renderHome(theme: Theme): readonly string[] {
    const lines = [
      ...titledBox("Bienvenue", [`Runtime : Node ${process.version}`, `Racine  : ${deps.contextRoot}`, `Santé   : ${deps.systemHealth ?? "inconnue"}`], theme, { border: theme.arkaRed }).split("\n"),
      "",
      `  ${theme.bold("Projets")}`,
    ];
    if (message !== undefined) lines.push(`  ${busy ? theme.dim("Chargement…") : theme.arkaAccent(message)}`);
    if (projects.length === 0) lines.push(`  ${theme.dim("Aucun projet indexé.")}`);
    lines.push(...menu.renderLines(theme));
    return lines;
  }
}

function visibleItems(items: readonly MenuItem<HomeAction>[], menu: MenuScene, stripAnsi: (value: string) => string) {
  return menu.filterMode ? filterItems(items, menu.filterText, stripAnsi) : items.map((item, index) => ({ ...item, _origIndex: index }));
}

function deriveProjectId(root: string, code: string): ProjectId {
  const suffix = createHash("sha1").update(root).digest("hex").slice(0, 8);
  return ProjectId.of(`${code.slice(0, Math.max(1, 55))}-${suffix}`);
}

function slugify(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (slug.length === 0) throw new DomainError("INVALID_PROJECT_OPTION", `Nom de projet inexploitable : "${name}".`);
  return slug;
}

function formatActivity(value: Date, current: Date): string {
  if (value.toDateString() === current.toDateString()) return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function translateError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
