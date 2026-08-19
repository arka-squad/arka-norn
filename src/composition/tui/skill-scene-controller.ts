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
    nextStep: skills.divergent > 0 ? "revenez puis choisissez « Installer / réparer les skills » ; les divergences seront sauvegardées avant remplacement" : skills.missing > 0 ? "installez les skills manquantes depuis l’accueil" : "traitez le premier contrôle FAIL, puis relancez Santé",
    onBack: () => {},
  }));
}

export async function showSkillInstallation(app: TuiApp, skillManager: SkillManager, target: string): Promise<void> {
  const health = await skillManager.inspect(target);
  app.push(createMenuScene(
    [
      { label: "Installer les skills manquantes", value: "repo" as const, description: `${health.missing} absente(s), conserve toute divergence locale` },
      { label: "Réparer le projet avec sauvegarde", value: "repair" as const, description: `${health.divergent} divergente(s), backup avant remplacement` },
      { label: "Réparer le projet + scope global", value: "global" as const, description: "inclut ~/.claude/skills" },
      { label: "Annuler", value: "cancel" as const },
    ],
    {
      title: "Installer les skills arka-framework-*",
      onSelect: (choice) => {
        app.pop();
        if (choice === "cancel") return;
        void skillManager.install({ target, global: choice === "global", force: choice === "repair" || choice === "global" }).then(
          (result) => app.push(createResultView({
            title: "Installation des skills", code: result.code, output: result.output, onBack: () => {},
            nextStep: result.code === 0 ? "revenez à l’accueil et relancez Santé pour confirmer 0 divergence" : "choisissez la réparation avec sauvegarde si des divergences sont signalées",
          })),
          (error: unknown) => app.push(createResultView({ title: "Installation impossible", code: 70, output: error instanceof Error ? error.message : String(error), onBack: () => {} })),
        );
      },
      onCancel: () => {},
    },
  ));
}
