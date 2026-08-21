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
import type { TuiApp } from "../../adapters/inbound/tui/runtime/tui-app.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import type { DoctorReport } from "../../ports/inbound/for-doctor.js";
import type { SkillHealth } from "../../ports/outbound/skill-manager.js";
import type { SkillManager } from "../../ports/outbound/skill-manager.js";

export function showHealthReport(app: TuiApp, report: DoctorReport, projectSkills: SkillHealth, globalSkills: SkillHealth): void {
  const checks = report.checks.map((check) => `${check.status.toUpperCase().padEnd(4)} ${check.id} — ${check.message}`);
  const projectSummary = healthSummary("Projet", projectSkills);
  const globalSummary = healthSummary("Global Claude/Codex", globalSkills);
  const globalHealthy = globalSkills.missing === 0 && globalSkills.divergent === 0;
  app.push(createResultView({
    title: "Santé arka-norn",
    code: report.ok && globalHealthy ? 0 : 3,
    output: [`Résumé : ${report.summary.pass} PASS · ${report.summary.warn} WARN · ${report.summary.fail} FAIL`, projectSummary, globalSummary, "", ...checks].join("\n"),
    maxVisibleLines: 20,
    nextStep: globalHealthy === false
      ? "revenez puis choisissez « Installer / réparer les skills » ; le diagnostic global sera affiché avant toute réparation"
      : projectSkills.divergent > 0
        ? "revenez puis choisissez « Installer / réparer les skills » ; les divergences du Project seront sauvegardées avant remplacement"
        : projectSkills.missing > 0
          ? "installez les skills manquantes depuis l’accueil"
          : "traitez le premier contrôle FAIL, puis relancez Santé",
    onBack: () => {},
  }));
}

export async function showSkillInstallation(
  app: TuiApp,
  skillManager: SkillManager,
  target: string,
  onHealthChanged?: () => Promise<void> | void,
): Promise<void> {
  const [projectHealth, globalHealth] = await Promise.all([
    skillManager.inspect(target),
    skillManager.inspectGlobal(),
  ]);

  async function refreshHealth(): Promise<string | undefined> {
    try {
      await onHealthChanged?.();
      return undefined;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }

  function install(input: { readonly global: boolean; readonly force: boolean }): void {
    void skillManager.install({ target, ...input }).then(
      async (result) => {
        const refreshError = await refreshHealth();
        app.push(createResultView({
          title: "Installation des skills",
          code: result.code,
          output: refreshError === undefined ? result.output : `${result.output}\n\nSanté non actualisée : ${refreshError}`,
          onBack: () => {},
          nextStep: result.code === 0
            ? refreshError === undefined
              ? input.global
                ? "installation globale terminée : les résumés Project et global ont été actualisés"
                : globalHealth.missing > 0 || globalHealth.divergent > 0
                  ? "Project installé : les entrées globales restent à diagnostiquer puis confirmer séparément"
                  : "installation terminée : les résumés Project et global ont été actualisés"
              : "installation terminée ; revenez à l’accueil puis relancez Santé pour actualiser les résumés"
            : "consultez le diagnostic puis confirmez la réparation avec sauvegarde si des divergences sont signalées",
        }));
      },
      async (error: unknown) => {
        const refreshError = await refreshHealth();
        const message = error instanceof Error ? error.message : String(error);
        app.push(createResultView({
          title: "Installation impossible",
          code: 70,
          output: refreshError === undefined ? message : `${message}\n\nSanté non actualisée : ${refreshError}`,
          onBack: () => {},
        }));
      },
    );
  }

  function confirmGlobalRepair(): void {
    const force = projectHealth.divergent > 0 || globalHealth.divergent > 0;
    const confirmationLabel = force
      ? "Oui, sauvegarder puis réparer Project et global"
      : "Oui, installer les skills globales";
    app.push(createMenuScene(
      [
        {
          label: confirmationLabel,
          value: "confirm" as const,
          description: `Projet ${healthSummary("", projectHealth)} · Global ${healthSummary("", globalHealth)}`,
        },
        { label: "Annuler", value: "cancel" as const },
      ],
      {
        title: "Confirmer la réparation globale (2/2)",
        hint: force
          ? "Cette seconde confirmation autorise uniquement les remplacements sauvegardés signalés par le diagnostic."
          : "Cette seconde confirmation installe les entrées globales manquantes sans remplacer de copie existante.",
        onSelect: (choice) => {
          app.pop();
          if (choice === "confirm") install({ global: true, force });
        },
        onCancel: () => {},
      },
    ));
  }

  app.push(createMenuScene(
    [
      { label: "Installer les skills manquantes", value: "repo" as const, description: `${projectHealth.missing} absente(s) dans le Project, conserve toute divergence` },
      { label: "Réparer le Project avec sauvegarde", value: "repair" as const, description: `${projectHealth.divergent} divergente(s), backup avant remplacement` },
      { label: "Diagnostiquer puis réparer le scope global", value: "global" as const, description: `${healthSummary("Claude/Codex", globalHealth)} · seconde confirmation requise` },
      { label: "Annuler", value: "cancel" as const },
    ],
    {
      title: "Installer les skills arka-norn",
      onSelect: (choice) => {
        app.pop();
        if (choice === "cancel") return;
        if (choice === "global") {
          confirmGlobalRepair();
          return;
        }
        install({ global: false, force: choice === "repair" });
      },
      onCancel: () => {},
    },
  ));
}

function healthSummary(scope: string, health: SkillHealth): string {
  const prefix = scope.length === 0 ? "" : `${scope} `;
  return `${prefix}${health.healthy}/${health.total} sains · ${health.missing} absents · ${health.divergent} divergents`;
}
