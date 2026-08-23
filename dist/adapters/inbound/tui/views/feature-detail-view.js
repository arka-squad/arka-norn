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
import { createMenuScene, filterItems } from "../components/menu.js";
import { guidedShortcuts, renderGuidance } from "../components/guidance.js";
import { createFeatureCockpitViewModel } from "../../../../application/view-models/feature-cockpit.js";
import { formatNumber, translate } from "../../../../application/localization/locale.js";
const ANGLE_RIGHT = String.fromCharCode(0x276f);
const LEFT_ARROW = String.fromCharCode(0x2190);
const EM_DASH = String.fromCharCode(0x2014);
const HORIZONTAL = String.fromCharCode(0x2500);
export function createFeatureDetailView(deps) {
    const cockpit = createFeatureCockpitViewModel(deps.feature, deps.report);
    const menu = buildMenu();
    let busy = false;
    let status;
    let helpVisible = false;
    function buildMenu() {
        return createMenuScene(buildMenuItems(), {
            title: deps.feature.name,
            hint: translate("tui.feature.menu.hint"),
            maxVisible: 12,
            onSelect: (value) => {
                void handleSelect(value);
            },
        });
    }
    async function handleSelect(value) {
        if (busy)
            return;
        switch (value) {
            case "action:continue":
                if (deps.onContinue !== undefined) {
                    await run(() => deps.onContinue(deps.feature));
                    return;
                }
                status = translate("tui.feature.actionUnavailable");
                deps.redraw();
                return;
            case "action:status":
                if (deps.onShowStatus !== undefined) {
                    await run(() => deps.onShowStatus(deps.feature));
                    return;
                }
                status = translate("tui.feature.actionUnavailable");
                deps.redraw();
                return;
            case "action:orchestrate":
                if (deps.onOrchestrate !== undefined) {
                    await run(() => deps.onOrchestrate(deps.feature));
                    return;
                }
                status = translate("tui.feature.actionUnavailable");
                deps.redraw();
                return;
            case "action:scaffold":
                if (deps.onScaffold !== undefined) {
                    await run(() => deps.onScaffold(deps.feature));
                    return;
                }
                status = translate("tui.feature.actionUnavailable");
                deps.redraw();
                return;
            case "action:validate":
                if (deps.onValidate !== undefined) {
                    await run(() => deps.onValidate(deps.feature));
                    return;
                }
                status = translate("tui.feature.actionUnavailable");
                deps.redraw();
                return;
            case "action:forget":
                if (deps.onForget !== undefined) {
                    await run(() => deps.onForget(deps.feature));
                    return;
                }
                status = translate("tui.feature.actionUnavailable");
                deps.redraw();
                return;
            case "action:back":
                deps.onBack();
                return;
        }
    }
    async function run(task) {
        busy = true;
        status = undefined;
        deps.redraw();
        try {
            await task();
        }
        catch (error) {
            status = translate("tui.feature.actionFailed", { message: error instanceof Error ? error.message : String(error) });
        }
        finally {
            busy = false;
            deps.redraw();
        }
    }
    return {
        onKey(event) {
            if (busy)
                return "consumed";
            if (event.kind === "help") {
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
            const result = menu.onKey(event);
            if (event.kind === "enter")
                return "consumed";
            if (event.kind === "escape") {
                deps.onBack();
                return "consumed";
            }
            return result;
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                for (const rendered of renderFeatureDetail(theme)) {
                    line(rendered);
                }
            });
        },
    };
    function renderFeatureDetail(theme) {
        if (helpVisible) {
            return renderGuidance({
                title: translate("tui.feature.help.title"),
                purpose: cockpit.workflowBadge === "FASTDEV"
                    ? translate("tui.feature.help.fastdev")
                    : translate("tui.feature.help.pipeline"),
                steps: [
                    translate("tui.feature.help.step1"),
                    translate("tui.feature.help.step2"),
                    translate("tui.feature.help.step3"),
                    translate("tui.feature.help.step4"),
                ],
                shortcuts: guidedShortcuts(),
            }, theme);
        }
        const lines = [
            `  ${cockpit.workflowBadge === undefined ? "" : `${theme.arkaRed(`[${cockpit.workflowBadge}]`)} `}${theme.bold(deps.feature.name)}`,
            `  ${theme.gray(deps.feature.root)}`,
            `  ${translate("tui.feature.status", { status: theme.arkaAccent(cockpit.overallStatus), progress: cockpit.progress })}`,
            `  ${translate("tui.feature.author", { agent: deps.currentAgentId ?? translate("tui.feature.noAuthor") })}`,
            `  ${translate("tui.feature.session", { session: deps.sessionId ?? "main" })}`,
            `  ${translate("tui.feature.nextAction", { action: cockpit.nextAction })}`,
            `  ${translate("tui.feature.reason", { reason: cockpit.nextReason })}`,
            `  ${translate("tui.feature.runs", {
                development: formatNumber(cockpit.developmentRuns),
                qa: formatNumber(cockpit.qaRuns),
                failures: formatNumber(cockpit.qaFailures),
                debts: formatNumber(cockpit.debtDocuments),
                handoffs: formatNumber(cockpit.handoffSignals),
            })}`,
            ...(cockpit.workflowBadge === "FASTDEV" ? [
                `  ${translate("tui.feature.iteration", { iteration: formatNumber(cockpit.iteration), open: formatNumber(cockpit.openFindings), closed: formatNumber(cockpit.closedCorrections) })}`,
                `  ${translate("tui.feature.audit", { commit: cockpit.latestAuditedCommit ?? translate("tui.feature.none"), validation: cockpit.validationState })}`,
            ] : []),
            "",
            `  ${theme.bold(translate("tui.feature.timeline"))}`,
            ...cockpit.timeline.map((step) => `    ${step}`),
            "",
        ];
        if (busy) {
            lines.push(`  ${theme.dim(translate("tui.project.loading"))}`);
            lines.push("");
        }
        else if (status !== undefined) {
            lines.push(`  ${theme.arkaAccent(status)}`);
            lines.push("");
        }
        if (menu.filterMode) {
            lines.push(...renderFlatItems(resolveVisibleItems(buildMenuItems(), theme.stripAnsi), menu.cursor, theme, "index"));
        }
        else {
            lines.push(...renderFlatItems(buildMenuItems().map((item, index) => ({ ...item, _origIndex: index })), menu.cursor, theme, "origin"));
        }
        lines.push("");
        lines.push(`  ${theme.dim(HORIZONTAL.repeat(44))}`);
        lines.push(`  ${theme.dim(translate("tui.feature.menu.hint"))}`);
        if (menu.filterMode) {
            lines.push(`  / ${menu.filterText}${theme.dim("_")}`);
        }
        return lines;
    }
    function renderFlatItems(items, cursor, theme, matchCursorOn) {
        if (items.length === 0) {
            return [`    ${theme.dim(translate("tui.feature.empty"))}`];
        }
        return items.map((item, index) => {
            const active = matchCursorOn === "index" ? index === cursor : item._origIndex === cursor;
            const marker = active ? theme.arkaRed(ANGLE_RIGHT) : " ";
            const label = active ? theme.bold(item.label) : item.label;
            const description = item.description === undefined ? "" : ` ${theme.gray(`${EM_DASH} ${item.description}`)}`;
            return `  ${marker} ${label}${description}`;
        });
    }
    function buildMenuItems() {
        return [
            { label: translate(deps.feature.pipelineId === "arka-norn-fastdev" ? "tui.feature.continue.rework" : "tui.feature.continue.feature"), value: "action:continue", description: translate("tui.feature.continue.description") },
            { label: translate("tui.feature.orchestrate.label"), value: "action:orchestrate", description: translate("tui.feature.orchestrate.description") },
            { label: translate("tui.feature.diagnostic.label"), value: "action:status", description: translate("tui.feature.diagnostic.description") },
            { label: translate("tui.feature.scaffold.label"), value: "action:scaffold", description: deps.currentAgentId === undefined ? translate("tui.feature.scaffold.blocked") : translate("tui.feature.scaffold.description", { agent: deps.currentAgentId }) },
            { label: translate("tui.feature.validate.label"), value: "action:validate", description: translate("tui.feature.validate.description") },
            { label: translate("tui.feature.forget.label"), value: "action:forget", description: translate("tui.feature.forget.description") },
            { label: `${LEFT_ARROW} ${translate("tui.project.back")}`, value: "action:back" },
        ];
    }
    function resolveVisibleItems(items, stripAnsi) {
        return menu.filterMode ? filterItems(items, menu.filterText, stripAnsi) : items.map((item, index) => ({ ...item, _origIndex: index }));
    }
}
//# sourceMappingURL=feature-detail-view.js.map