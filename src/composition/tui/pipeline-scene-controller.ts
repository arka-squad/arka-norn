import { pipelineExitCode, presentPipelineReport } from "../../adapters/inbound/cli/presenters/pipeline-report-presenter.js";
import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import type { TuiApp } from "../../adapters/inbound/tui/runtime/tui-app.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { AgentRegistration } from "../../domain/agent/agent.js";
import { AgentScopeViolationError } from "../../domain/errors.js";
import { relative } from "node:path";
import type { ForPipeline } from "../../ports/inbound/for-pipeline.js";

export interface PipelineSceneController {
  showStatus(feature: Feature): Promise<void>;
  scaffold(feature: Feature, author: AgentRegistration, projectRoot: string): Promise<void>;
  validate(feature: Feature): void;
}

export function createPipelineSceneController(app: TuiApp, pipeline: ForPipeline): PipelineSceneController {
  return {
    async showStatus(feature): Promise<void> {
      const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
      app.push(createResultView({
        title: "Statut du pipeline", code: pipelineExitCode(report), output: presentPipelineReport(report), onBack: () => {},
        nextStep: report.nextActions[0] === undefined ? "le Pipeline est complet ; vérifiez le handoff ou clôturez la Feature" : `${report.nextActions[0].kind} → ${report.nextActions[0].stepId} : ${report.nextActions[0].reason}`,
      }));
    },
    async scaffold(feature, author, projectRoot): Promise<void> {
      if (!author.coversFeature(feature.id)) throw new AgentScopeViolationError(author.id.value, `feature:${feature.id.value}`);
      const authorAgentId = author.id.value;
      const [steps, report] = await Promise.all([
        pipeline.listSteps(),
        pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value }),
      ]);
      const recommended = report.nextActions[0]?.stepId;
      const orderedSteps = [...steps].sort((left, right) => Number(right.id === recommended) - Number(left.id === recommended));
      app.push(createMenuScene(
        orderedSteps.map((step) => ({
          label: `${step.id === recommended ? "★ Recommandé — " : ""}${step.id}`,
          value: step.id,
          description: step.id === recommended
            ? report.nextActions[0]?.reason ?? "prochaine étape calculée"
            : step.required ? "obligatoire, mais pas l’action prioritaire actuelle" : step.transversal ? "document transversal" : "optionnelle",
        })),
        {
          title: `Document à générer · auteur ${authorAgentId}`,
          hint: "★ suit le statut réel · ↑/↓ choisir · Entrée continuer · Échap annuler",
          onSelect: (stepId) => {
            app.pop();
            app.push(createTextInputScene({
              title: `Squelette — ${stepId}`,
              hint: `Document v3 signé ${authorAgentId}. Confirmez le chemin dans la racine de la Feature.`,
              initialValue: `${feature.root}/${stepId}.json`,
              onSubmit: (outputPath) => {
                app.pop();
                const projectRelativeOutput = relative(projectRoot, outputPath);
                if (!author.coversProjectPath(projectRelativeOutput)) {
                  app.push(errorView(`Squelette — ${stepId}`, new AgentScopeViolationError(author.id.value, `path:${projectRelativeOutput}`)));
                  return;
                }
                void pipeline.scaffold({ stepId, outputPath, allowedRoot: feature.root, authorAgentId, featureId: feature.id.value }).then(
                  (result) => app.push(createResultView({
                    title: `Squelette — ${stepId}`,
                    code: 0,
                    output: `Squelette écrit : ${result.outputPath}\nValeurs à remplacer : ${result.sentinelPaths.length}\n`,
                    onBack: () => {},
                    nextStep: "remplacez toutes les sentinelles À_REMPLIR, puis utilisez « Valider un document rempli »",
                  })),
                  (error: unknown) => app.push(errorView(`Squelette — ${stepId}`, error)),
                );
              },
              onCancel: () => {},
            }));
          },
          onCancel: () => {},
        },
      ));
    },
    validate(feature): void {
      app.push(createTextInputScene({
        title: "Valider un document",
        hint: "Chemin du fichier JSON à valider",
        initialValue: `${feature.root}/`,
        onSubmit: (filePath) => {
          app.pop();
          void pipeline.validate({ filePath }).then(
            (result) => app.push(createResultView({
              title: "Validation",
              code: result.valid ? 0 : 3,
              output: result.valid ? `VALIDE — ${filePath}\n` : `INVALIDE — ${filePath}\n${result.errors.map((error) => `- ${error}`).join("\n")}\n`,
              onBack: () => {},
              nextStep: result.valid ? "revenez au cockpit et relancez le statut du Pipeline" : "corrigez la première erreur affichée puis validez à nouveau",
            })),
            (error: unknown) => app.push(errorView("Validation impossible", error)),
          );
        },
        onCancel: () => {},
      }));
    },
  };
}

function errorView(title: string, error: unknown) {
  const conflict = error instanceof Error && "code" in error && error.code === "EEXIST";
  return createResultView({ title, code: conflict ? 5 : 70, output: error instanceof Error ? error.message : String(error), onBack: () => {} });
}
