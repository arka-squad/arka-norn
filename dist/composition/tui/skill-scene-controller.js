import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
export function showHealthReport(app, report, skills) {
    const checks = report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
    const skillSummary = `SKILLS ${skills.healthy}/${skills.total} sains · ${skills.missing} absents · ${skills.divergent} divergents`;
    app.push(createResultView({
        title: "Santé arka-norn",
        code: report.ok && skills.missing === 0 && skills.divergent === 0 ? 0 : 3,
        output: [`Résumé : ${report.summary.pass} PASS · ${report.summary.warn} WARN · ${report.summary.fail} FAIL`, skillSummary, "", ...checks].join("\n"),
        maxVisibleLines: 20,
        onBack: () => { },
    }));
}
export function showSkillInstallation(app, skillManager, target) {
    app.push(createMenuScene([
        { label: "Projet courant seulement", value: "repo" },
        { label: "Projet courant + scope global (~/.claude/skills)", value: "global" },
        { label: "Annuler", value: "cancel" },
    ], {
        title: "Installer les skills arka-framework-*",
        onSelect: (choice) => {
            app.pop();
            if (choice === "cancel")
                return;
            void skillManager.install({ target, global: choice === "global" }).then((result) => app.push(createResultView({ title: "Installation des skills", code: result.code, output: result.output, onBack: () => { } })), (error) => app.push(createResultView({ title: "Installation impossible", code: 70, output: error instanceof Error ? error.message : String(error), onBack: () => { } })));
        },
        onCancel: () => { },
    }));
}
//# sourceMappingURL=skill-scene-controller.js.map