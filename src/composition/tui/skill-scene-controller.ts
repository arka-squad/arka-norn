import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import type { TuiApp } from "../../adapters/inbound/tui/runtime/tui-app.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import type { DoctorReport } from "../../ports/inbound/for-doctor.js";
import type { SkillHealth } from "../../ports/outbound/skill-manager.js";
import type { SkillManager } from "../../ports/outbound/skill-manager.js";

export function showHealthReport(app: TuiApp, report: DoctorReport, skills: SkillHealth): void {
  const checks = report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
  const skillSummary = `SKILLS ${skills.healthy}/${skills.total} sains · ${skills.missing} absents · ${skills.divergent} divergents`;
  app.push(createResultView({
    title: "Santé arka-norn",
    code: report.ok && skills.missing === 0 && skills.divergent === 0 ? 0 : 3,
    output: [`Résumé : ${report.summary.pass} PASS · ${report.summary.warn} WARN · ${report.summary.fail} FAIL`, skillSummary, "", ...checks].join("\n"),
    maxVisibleLines: 20,
    onBack: () => {},
  }));
}

export function showSkillInstallation(app: TuiApp, skillManager: SkillManager, target: string): void {
  app.push(createMenuScene(
    [
      { label: "Projet courant seulement", value: "repo" as const },
      { label: "Projet courant + scope global (~/.claude/skills)", value: "global" as const },
      { label: "Annuler", value: "cancel" as const },
    ],
    {
      title: "Installer les skills arka-framework-*",
      onSelect: (choice) => {
        app.pop();
        if (choice === "cancel") return;
        void skillManager.install({ target, global: choice === "global" }).then(
          (result) => app.push(createResultView({ title: "Installation des skills", code: result.code, output: result.output, onBack: () => {} })),
          (error: unknown) => app.push(createResultView({ title: "Installation impossible", code: 70, output: error instanceof Error ? error.message : String(error), onBack: () => {} })),
        );
      },
      onCancel: () => {},
    },
  ));
}
