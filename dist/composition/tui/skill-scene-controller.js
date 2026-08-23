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
import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import { formatNumber, translate } from "../../application/localization/locale.js";
export function showHealthReport(app, report, projectSkills, globalSkills) {
    const checks = report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
    const projectSummary = healthSummary(translate("tui.skills.health.project"), projectSkills);
    const globalSummary = healthSummary("Global Claude/Codex", globalSkills);
    const globalHealthy = globalSkills.missing === 0 && globalSkills.divergent === 0;
    app.push(createResultView({
        title: translate("tui.skills.health.title"),
        code: report.ok && globalHealthy ? 0 : 3,
        output: [translate("tui.skills.health.summary", { pass: formatNumber(report.summary.pass), warn: formatNumber(report.summary.warn), fail: formatNumber(report.summary.fail) }), projectSummary, globalSummary, "", ...checks].join("\n"),
        maxVisibleLines: 20,
        nextStep: globalHealthy === false
            ? translate("tui.skills.health.next.globalMissing")
            : projectSkills.divergent > 0
                ? translate("tui.skills.health.next.divergent")
                : projectSkills.missing > 0
                    ? translate("tui.skills.health.next.missing")
                    : translate("tui.skills.health.next.failure"),
        onBack: () => { },
    }));
}
export async function showSkillInstallation(app, skillManager, target, onHealthChanged) {
    const [projectHealth, globalHealth] = await Promise.all([
        skillManager.inspect(target),
        skillManager.inspectGlobal(),
    ]);
    async function refreshHealth() {
        try {
            await onHealthChanged?.();
            return undefined;
        }
        catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }
    function install(input) {
        void skillManager.install({ target, ...input }).then(async (result) => {
            const refreshError = await refreshHealth();
            app.push(createResultView({
                title: translate("tui.skills.install.title"),
                code: result.code,
                output: refreshError === undefined ? result.output : `${result.output}\n\n${translate("tui.skills.health.notRefreshed", { error: refreshError })}`,
                onBack: () => { },
                nextStep: result.code === 0
                    ? refreshError === undefined
                        ? input.global
                            ? translate("tui.skills.install.globalDone")
                            : globalHealth.missing > 0 || globalHealth.divergent > 0
                                ? translate("tui.skills.install.projectOnly")
                                : translate("tui.skills.install.done")
                        : translate("tui.skills.install.refresh")
                    : translate("tui.skills.install.review"),
            }));
        }, async (error) => {
            const refreshError = await refreshHealth();
            const message = error instanceof Error ? error.message : String(error);
            app.push(createResultView({
                title: translate("tui.skills.install.failure"),
                code: 70,
                output: refreshError === undefined ? message : `${message}\n\n${translate("tui.skills.health.notRefreshed", { error: refreshError })}`,
                onBack: () => { },
            }));
        });
    }
    function confirmGlobalRepair() {
        const force = projectHealth.divergent > 0 || globalHealth.divergent > 0;
        const confirmationLabel = force
            ? translate("tui.skills.confirm.all")
            : translate("tui.skills.install.globalLabel");
        app.push(createMenuScene([
            {
                label: confirmationLabel,
                value: "confirm",
                description: translate("tui.skills.confirm.description", { project: healthSummary("", projectHealth), global: healthSummary("", globalHealth) }),
            },
            { label: translate("tui.skills.cancel"), value: "cancel" },
        ], {
            title: translate("tui.skills.confirm.globalTitle"),
            hint: force
                ? translate("tui.skills.confirm.globalReplace")
                : translate("tui.skills.confirm.globalMissing"),
            onSelect: (choice) => {
                app.pop();
                if (choice === "confirm")
                    install({ global: true, force });
            },
            onCancel: () => { },
        }));
    }
    app.push(createMenuScene([
        { label: translate("tui.skills.install.missing"), value: "repo", description: translate("tui.skills.install.missingDescription", { count: formatNumber(projectHealth.missing) }) },
        { label: translate("tui.skills.install.repair"), value: "repair", description: translate("tui.skills.install.repairDescription", { count: formatNumber(projectHealth.divergent) }) },
        { label: translate("tui.skills.install.global"), value: "global", description: translate("tui.skills.install.globalDescription", { health: healthSummary("Claude/Codex", globalHealth) }) },
        { label: translate("tui.skills.cancel"), value: "cancel" },
    ], {
        title: translate("tui.skills.install.menuTitle"),
        onSelect: (choice) => {
            app.pop();
            if (choice === "cancel")
                return;
            if (choice === "global") {
                confirmGlobalRepair();
                return;
            }
            install({ global: false, force: choice === "repair" });
        },
        onCancel: () => { },
    }));
}
function healthSummary(scope, health) {
    const prefix = scope.length === 0 ? "" : `${scope} `;
    return translate("tui.skills.health.detail", {
        scope: prefix,
        healthy: formatNumber(health.healthy),
        total: formatNumber(health.total),
        missing: formatNumber(health.missing),
        divergent: formatNumber(health.divergent),
    });
}
//# sourceMappingURL=skill-scene-controller.js.map