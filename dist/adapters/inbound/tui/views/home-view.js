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
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { DomainError } from "../../../../domain/errors.js";
import { ProjectId } from "../../../../domain/project/project-id.js";
import { titledBox } from "../components/box.js";
import { guidedShortcuts, nextActionLine, renderGuidance } from "../components/guidance.js";
import { createMenuScene, filterItems } from "../components/menu.js";
import { formatNumber, formatShortDate, formatTime, translate } from "../../../../application/localization/locale.js";
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
    let skillHealth = deps.skillHealth ?? translate("tui.health.unknown");
    let systemHealth = deps.systemHealth ?? translate("tui.health.unknown");
    let localePreference = deps.localePreference ?? "auto";
    let menu = buildMenu();
    syncFocus();
    function items() {
        return [
            { label: translate("tui.home.create.label"), value: "action:create", description: translate("tui.home.create.description") },
            ...projects.map((project) => ({
                label: `${CIRCLE} ${project.name} - ${translate(project.orchestrationMode === "automatic" ? "tui.home.mode.assisted" : "tui.home.mode.manual")}`,
                value: `project:${project.id.value}`,
                description: `${project.root}  ${formatActivity(project.updatedAt, now())}`,
            })),
            { label: translate("tui.home.scan.label"), value: "action:scan", description: translate("tui.home.scan.description") },
            { label: translate("tui.home.health.label"), value: "action:health", description: translate("tui.home.health.description", { health: systemHealth }) },
            { label: translate("tui.home.skills.label"), value: "action:install", description: translate("tui.home.skills.description", { health: skillHealth }) },
            { label: `${translate("tui.language")}: ${translate(`common.locale.${localePreference}`)}`, value: "action:locale", description: translate("tui.language.description") },
        ];
    }
    function buildMenu() {
        return createMenuScene(items(), {
            hint: translate("tui.home.menu.hint"),
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
                message = translate("tui.home.scan.done", { count: formatNumber(results.filter((entry) => entry.project !== undefined).length) });
            });
            return;
        }
        if (value === "action:health")
            await run(async () => { await deps.onShowHealth?.(); });
        else if (value === "action:install")
            await run(async () => { await deps.onInstallSkills?.(); });
        else {
            mode = "locale";
            deps.redraw();
        }
    }
    async function submitCreate() {
        if (busy)
            return;
        const root = createPath.trim();
        if (root.length === 0) {
            message = translate("tui.home.path.empty");
            deps.redraw();
            return;
        }
        await run(async () => {
            const name = basename(root);
            try {
                const project = await deps.projects.importFrom({ root });
                mode = "menu";
                message = translate("tui.home.project.imported", { name: project.name });
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
            message = translate("tui.home.project.created", {
                name: project.name,
                mode: translate(orchestrationMode === "automatic" ? "tui.home.mode.assistedEnabled" : "tui.home.mode.manualEnabled"),
            });
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
            if (mode === "locale") {
                if (event.kind === "escape")
                    mode = "menu";
                else if (event.kind === "up" || event.kind === "left")
                    localePreference = previousLocalePreference(localePreference);
                else if (event.kind === "down" || event.kind === "right")
                    localePreference = nextLocalePreference(localePreference);
                else if (event.kind === "enter" && !busy) {
                    void run(async () => {
                        await deps.onLocaleChange?.(localePreference);
                        mode = "menu";
                        menu = buildMenu();
                    });
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
                        title: translate("tui.home.help.title"),
                        purpose: translate("tui.home.help.purpose"),
                        steps: [
                            translate("tui.home.help.step1"),
                            translate("tui.home.help.step2"),
                            translate("tui.home.help.step3"),
                            translate("tui.home.help.step4"),
                            translate("tui.home.help.step5"),
                        ],
                        shortcuts: guidedShortcuts(),
                    }, theme))
                        line(value);
                    return;
                }
                if (mode === "create") {
                    for (const value of titledBox(translate("tui.home.create.title"), [
                        translate("tui.home.create.explanation"),
                        translate("tui.home.create.example"),
                        "",
                        `${translate("tui.home.create.path", { path: createPath })}${theme.dim("_")}`,
                        message ?? translate("tui.home.create.confirm"),
                    ], theme).split("\n"))
                        line(value);
                    return;
                }
                if (mode === "orchestration-mode") {
                    const selected = translate(orchestrationMode === "manual" ? "tui.home.delegation.manualChoice" : "tui.home.mode.assisted");
                    for (const value of titledBox(translate("tui.home.delegation.title"), [
                        translate("tui.home.delegation.explanation"),
                        translate("tui.home.delegation.manual"),
                        translate("tui.home.delegation.assisted"),
                        "",
                        translate("tui.home.delegation.choice", { choice: selected }),
                        translate("tui.home.delegation.hint"),
                    ], theme, { border: orchestrationMode === "automatic" ? theme.arkaAccent : theme.arkaRed }).split("\n"))
                        line(value);
                    return;
                }
                if (mode === "locale") {
                    for (const value of titledBox(translate("tui.language.title"), [
                        translate("tui.language.choice", { locale: translate(`common.locale.${localePreference}`) }),
                        translate("tui.language.instructions"),
                    ], theme).split("\n"))
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
            ...titledBox(translate("tui.home.welcome"), [`${translate("tui.context.runtime")} Node ${process.version}`, `${translate("tui.context.root")} ${deps.contextRoot}`, `${translate("tui.home.health.label")}: ${systemHealth}`], theme, { border: theme.arkaRed }).split("\n"),
            "",
            `  ${theme.bold(translate("tui.home.projects"))}`,
        ];
        lines.push(nextActionLine(translate(projects.length === 0 ? "tui.home.next.empty.action" : "tui.home.next.open.action"), translate(projects.length === 0 ? "tui.home.next.empty.reason" : "tui.home.next.open.reason"), theme));
        if (projects.length === 0) {
            lines.push(`  ${theme.dim(translate("tui.home.guidedPath"))}`);
        }
        if (message !== undefined)
            lines.push(`  ${busy ? theme.dim(translate("tui.home.loading")) : theme.arkaAccent(message)}`);
        if (projects.length === 0)
            lines.push(`  ${theme.dim(translate("tui.home.noProjects"))}`);
        lines.push(...menu.renderLines(theme));
        return lines;
    }
}
const LOCALE_PREFERENCES = ["auto", "en", "fr"];
function nextLocalePreference(value) {
    return LOCALE_PREFERENCES[(LOCALE_PREFERENCES.indexOf(value) + 1) % LOCALE_PREFERENCES.length];
}
function previousLocalePreference(value) {
    return LOCALE_PREFERENCES[(LOCALE_PREFERENCES.indexOf(value) + LOCALE_PREFERENCES.length - 1) % LOCALE_PREFERENCES.length];
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
        throw new DomainError("INVALID_PROJECT_OPTION", translate("tui.error.invalidProjectName", { name }));
    return slug;
}
function formatActivity(value, current) {
    return value.toDateString() === current.toDateString() ? formatTime(value) : formatShortDate(value);
}
function translateError(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=home-view.js.map