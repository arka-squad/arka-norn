import { pipelineExitCode, presentPipelineReport } from "../../adapters/inbound/cli/presenters/pipeline-report-presenter.js";
import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
export function createPipelineSceneController(app, pipeline) {
    return {
        async showStatus(feature) {
            const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
            app.push(createResultView({ title: "Statut du pipeline", code: pipelineExitCode(report), output: presentPipelineReport(report), onBack: () => { } }));
        },
        async scaffold(feature) {
            const steps = await pipeline.listSteps();
            app.push(createMenuScene(steps.map((step) => ({ label: step.id, value: step.id, description: step.required ? "obligatoire" : step.transversal ? "transversale" : "optionnelle" })), {
                title: "Quelle étape générer ?",
                onSelect: (stepId) => {
                    app.pop();
                    app.push(createTextInputScene({
                        title: `Squelette — ${stepId}`,
                        hint: "Chemin du fichier de sortie",
                        initialValue: `${feature.root}/${stepId}.json`,
                        onSubmit: (outputPath) => {
                            app.pop();
                            void pipeline.scaffold({ stepId, outputPath, allowedRoot: feature.root }).then((result) => app.push(createResultView({
                                title: `Squelette — ${stepId}`,
                                code: 0,
                                output: `Squelette écrit : ${result.outputPath}\nValeurs à remplacer : ${result.sentinelPaths.length}\n`,
                                onBack: () => { },
                            })), (error) => app.push(errorView(`Squelette — ${stepId}`, error)));
                        },
                        onCancel: () => { },
                    }));
                },
                onCancel: () => { },
            }));
        },
        validate(feature) {
            app.push(createTextInputScene({
                title: "Valider un document",
                hint: "Chemin du fichier JSON à valider",
                initialValue: `${feature.root}/`,
                onSubmit: (filePath) => {
                    app.pop();
                    void pipeline.validate({ filePath }).then((result) => app.push(createResultView({
                        title: "Validation",
                        code: result.valid ? 0 : 3,
                        output: result.valid ? `VALIDE — ${filePath}\n` : `INVALIDE — ${filePath}\n${result.errors.map((error) => `- ${error}`).join("\n")}\n`,
                        onBack: () => { },
                    })), (error) => app.push(errorView("Validation impossible", error)));
                },
                onCancel: () => { },
            }));
        },
    };
}
function errorView(title, error) {
    const conflict = error instanceof Error && "code" in error && error.code === "EEXIST";
    return createResultView({ title, code: conflict ? 5 : 70, output: error instanceof Error ? error.message : String(error), onBack: () => { } });
}
//# sourceMappingURL=pipeline-scene-controller.js.map