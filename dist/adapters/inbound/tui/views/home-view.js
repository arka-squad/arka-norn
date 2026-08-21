import { createHash } from "node:crypto";
import { basename } from "node:path";
import { DomainError } from "../../../../domain/errors.js";
import { ProjectId } from "../../../../domain/project/project-id.js";
import { titledBox } from "../components/box.js";
import { GUIDED_SHORTCUTS, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene, filterItems } from "../components/menu.js";
const CIRCLE = "●";
const IDENTITY = (value) => value;
export function createHomeView(deps) {
    const now = deps.now ?? (() => new Date());
    let projects = [...deps.initialProjects];
    let mode = "menu";
    let createPath = deps.cwd;
    let pendingProject;
    let orchestrationMode = "manual";
    let message;
    let busy = false;
    let helpVisible = false;
    let skillHealth = deps.skillHealth ?? "état inconnu";
    let systemHealth = deps.systemHealth ?? "état inconnu";
    let menu = buildMenu();
    syncFocus();
    function items() {
        return [
            { label: "Créer ou importer un Project", value: "action:create", description: "déclare la racine qui contiendra Features et registre Agents" },
            ...projects.map((project) => ({
                label: `${CIRCLE} ${project.name} · ${project.orchestrationMode === "automatic" ? "AUTO" : "MANUEL"}`,
                value: `project:${project.id.value}`,
                description: `${project.root}  ${formatActivity(project.updatedAt, now())}`,
            })),
            { label: "Rescanner ce dossier", value: "action:scan", description: "reconstruit l’index depuis les marqueurs sans supprimer les données" },
            { label: "Santé du système", value: "action:health", description: `${systemHealth} · détail et réparations sûres` },
            { label: "Installer / réparer les skills", value: "action:install", description: `${skillHealth} · guide les agents dans le framework` },
        ];
    }
    function buildMenu() {
        return createMenuScene(items(), {
            hint: "↑/↓ naviguer · Entrée ouvrir · / filtrer · ? aide · q quitter",
            maxVisible: 12,
            onSelect: (value) => void select(value),
        });
    }
    async function select(value) {
        if (busy)
            return;
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
            pendingProject = undefined;
            orchestrationMode = "manual";
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
        if (value === "action:health")
            await run(async () => { await deps.onShowHealth?.(); });
        else
            await run(async () => { await deps.onInstallSkills?.(); });
    }
    async function submitCreate() {
        if (busy)
            return;
        const root = createPath.trim();
        if (root.length === 0) {
            message = "Le chemin ne peut pas être vide.";
            deps.redraw();
            return;
        }
        await run(async () => {
            const name = basename(root);
            try {
                const project = await deps.projects.importFrom({ root });
                mode = "menu";
                message = `Projet importé : ${project.name}`;
                await refresh();
            }
            catch (error) {
                if (!(error instanceof DomainError) || error.code !== "PROJECT_MARKER_NOT_FOUND")
                    throw error;
                pendingProject = { id: deriveProjectId(root, slugify(name)), name, root };
                mode = "orchestration-mode";
                message = undefined;
            }
        });
    }
    async function confirmOrchestrationMode() {
        const input = pendingProject;
        if (input === undefined) {
            mode = "create";
            return;
        }
        await run(async () => {
            const project = await deps.projects.create({ ...input, orchestrationMode });
            pendingProject = undefined;
            mode = "menu";
            message = `Projet créé : ${project.name} (${orchestrationMode === "automatic" ? "orchestration automatique" : "orchestration manuelle"}).`;
            await refresh();
        });
    }
    function toggleOrchestrationMode() {
        orchestrationMode = orchestrationMode === "manual" ? "automatic" : "manual";
    }
    async function refresh() {
        projects = [...await deps.projects.list()];
        menu = buildMenu();
        syncFocus();
    }
    async function run(task) {
        busy = true;
        deps.redraw();
        try {
            await task();
        }
        catch (error) {
            message = translateError(error);
        }
        finally {
            busy = false;
            deps.redraw();
        }
    }
    function syncFocus() {
        const focused = visibleItems(items(), menu, IDENTITY)[menu.cursor];
        if (focused === undefined || !focused.value.startsWith("project:")) {
            deps.onProjectFocused?.(undefined);
            return;
        }
        deps.onProjectFocused?.(projects.find((project) => project.id.value === focused.value.slice("project:".length)));
    }
    return {
        chrome: { contextBanner: false },
        setHealth(summary) {
            skillHealth = summary.skillHealth;
            systemHealth = summary.systemHealth;
            menu = buildMenu();
            syncFocus();
            deps.redraw();
        },
        onKey(event) {
            if (event.kind === "help" && mode === "menu") {
                helpVisible = !helpVisible;
                deps.redraw();
                return "consumed";
            }
            if (helpVisible) {
                if (event.kind === "escape")
                    helpVisible = false;
                deps.redraw();
                return "consumed";
            }
            if (mode === "create") {
                if (event.kind === "escape") {
                    mode = "menu";
                }
                else if (event.kind === "enter" && !busy) {
                    void submitCreate();
                }
                else if (event.kind === "backspace") {
                    createPath = createPath.slice(0, -1);
                }
                else if (event.kind === "char") {
                    createPath += event.value;
                }
                else if (event.kind === "filter") {
                    createPath += "/";
                }
                deps.redraw();
                return "consumed";
            }
            if (mode === "orchestration-mode") {
                if (event.kind === "escape") {
                    mode = "create";
                    pendingProject = undefined;
                }
                else if ((event.kind === "up" || event.kind === "down" || event.kind === "left" || event.kind === "right") && !busy) {
                    toggleOrchestrationMode();
                }
                else if (event.kind === "enter" && !busy) {
                    void confirmOrchestrationMode();
                }
                deps.redraw();
                return "consumed";
            }
            const result = menu.onKey(event);
            if (result !== undefined)
                syncFocus();
            return event.kind === "enter" ? "consumed" : result;
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                if (helpVisible) {
                    for (const value of renderGuidance({
                        title: "Aide — démarrer avec arka-norn",
                        purpose: "arka-norn organise le travail selon Project → Feature → Pipeline → Documents/Runs, avec une identité Agent explicite.",
                        steps: [
                            "Créez ou importez le Project qui porte le produit.",
                            "Dans le Project, enregistrez votre identité Agent et son périmètre.",
                            "Créez/importez une Feature, puis ouvrez son cockpit.",
                            "Suivez l’action recommandée, générez un document signé et validez-le.",
                            "Consultez Santé si un index, un marker, un lock, l’audit ou une skill est en échec.",
                        ],
                        shortcuts: GUIDED_SHORTCUTS,
                    }, theme))
                        line(value);
                    return;
                }
                if (mode === "create") {
                    for (const value of titledBox("Créer ou importer un Project", [
                        "Indiquez la racine du produit. Un marker existant sera importé ; sinon `.arka-norn/project.json` sera créé.",
                        "Exemple : /workspace/mon-produit",
                        "",
                        `Chemin absolu : ${createPath}${theme.dim("_")}`,
                        message ?? "Entrée confirme · Échap annule sans modifier",
                    ], theme).split("\n"))
                        line(value);
                    return;
                }
                if (mode === "orchestration-mode") {
                    const selected = orchestrationMode === "manual" ? "Manuelle" : "Automatique";
                    for (const value of titledBox("Mode d’orchestration du Project", [
                        "Choisissez comment le framework exécute les missions autorisées.",
                        "Manuelle : vous lancez et suivez chaque agent.",
                        "Automatique : Arka garde le contrôle, Mastra exécute les ordres validés.",
                        "",
                        `Choix : ${selected}`,
                        "↑/↓ ou ←/→ change · Entrée confirme · Échap revient au chemin sans créer",
                    ], theme, { border: orchestrationMode === "automatic" ? theme.arkaAccent : theme.arkaRed }).split("\n"))
                        line(value);
                    return;
                }
                for (const value of renderHome(theme))
                    line(value);
            });
        },
    };
    function renderHome(theme) {
        const lines = [
            ...titledBox("Bienvenue", [`Runtime : Node ${process.version}`, `Racine  : ${deps.contextRoot}`, `Santé   : ${systemHealth}`], theme, { border: theme.arkaRed }).split("\n"),
            "",
            `  ${theme.bold("Projets")}`,
        ];
        lines.push(nextActionLine(projects.length === 0 ? "Créer ou importer un Project" : "Ouvrir le Project prioritaire", projects.length === 0 ? "aucune racine produit n’est encore indexée" : "vous pourrez ensuite choisir l’identité Agent et la Feature", theme));
        if (projects.length === 0) {
            lines.push(`  ${theme.dim("Parcours guidé : Project → Agent actif → Feature → prochaine action Pipeline.")}`);
        }
        if (message !== undefined)
            lines.push(`  ${busy ? theme.dim("Chargement…") : theme.arkaAccent(message)}`);
        if (projects.length === 0)
            lines.push(`  ${theme.dim("Aucun projet indexé.")}`);
        lines.push(...menu.renderLines(theme));
        return lines;
    }
}
function visibleItems(items, menu, stripAnsi) {
    return menu.filterMode ? filterItems(items, menu.filterText, stripAnsi) : items.map((item, index) => ({ ...item, _origIndex: index }));
}
function deriveProjectId(root, code) {
    const suffix = createHash("sha1").update(root).digest("hex").slice(0, 8);
    return ProjectId.of(`${code.slice(0, Math.max(1, 55))}-${suffix}`);
}
function slugify(name) {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (slug.length === 0)
        throw new DomainError("INVALID_PROJECT_OPTION", `Nom de projet inexploitable : "${name}".`);
    return slug;
}
function formatActivity(value, current) {
    if (value.toDateString() === current.toDateString())
        return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
    return `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}`;
}
function translateError(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=home-view.js.map