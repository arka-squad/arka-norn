import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
export function createResourceConfirmationController(deps) {
    return {
        forgetFeature(feature) {
            confirm({
                title: `Retirer "${feature.name}" ?`,
                confirmLabel: `Oui, retirer "${feature.name}" de l'index`,
                run: () => deps.features.forget(feature.id),
                onSuccess: deps.onFeatureForgotten,
            });
        },
        forgetProject(project) {
            confirm({
                title: `Retirer "${project.name}" ?`,
                confirmLabel: `Oui, retirer "${project.name}" de l'index`,
                run: () => deps.projects.forget(project.id),
                onSuccess: deps.onProjectForgotten,
            });
        },
    };
    function confirm(input) {
        deps.app.push(createMenuScene([
            { label: input.confirmLabel, value: "confirm" },
            { label: "Annuler", value: "cancel" },
        ], {
            title: input.title,
            hint: "Les fichiers métier restent sur disque ; seule l'entrée d'index est retirée.",
            onSelect: (choice) => {
                deps.app.pop();
                if (choice === "cancel")
                    return;
                void input.run().then(input.onSuccess, (error) => deps.app.push(createResultView({ title: "Retrait impossible", code: 1, output: error instanceof Error ? error.message : String(error), onBack: () => { } })));
            },
            onCancel: () => { },
        }));
    }
}
//# sourceMappingURL=resource-confirmation-controller.js.map