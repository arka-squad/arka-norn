import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
export function createAgentOrchestrationSceneController(app, orchestration) {
    return {
        async showProjectAdvice(project) {
            const advice = await orchestration.advise({ projectId: project.id });
            app.push(adviceView(advice));
        },
        async openFeatureOrchestration(feature) {
            const advice = await orchestration.advise({ projectId: feature.projectId, featureId: feature.id });
            const items = [
                { label: "Voir le conseil Product", value: "advice", description: `${advice.phase} · ${advice.productNextAction}` },
                ...advice.recommendations.map((item, index) => ({
                    label: `${item.mode === "execute" ? "Lancer maintenant" : "Préparer en parallèle"} — ${item.role}`,
                    value: `prompt:${index}`,
                    description: `session ${item.sessionId} · ${item.canWrite ? "écriture bornée" : "lecture seule"}`,
                })),
                { label: "Préparer la reprise du Product principal", value: "handoff", description: "prompt autonome pour un nouveau contexte" },
                { label: "← Retour", value: "back" },
            ];
            app.push(createMenuScene(items, {
                title: "Organisation Product et Agents",
                hint: "Entrée ouvrir · Échap retour",
                onSelect(value) {
                    void select(value);
                },
            }));
            async function select(value) {
                if (value === "back") {
                    app.pop();
                    return;
                }
                if (value === "advice") {
                    app.push(adviceView(advice));
                    return;
                }
                if (value === "handoff") {
                    try {
                        const result = await orchestration.productHandoffPrompt({ projectId: feature.projectId, featureId: feature.id });
                        app.push(promptView("Reprise du Product principal", result.prompt));
                    }
                    catch (error) {
                        app.push(errorView("Reprise Product impossible", error));
                    }
                    return;
                }
                const recommendation = advice.recommendations[Number(value.slice("prompt:".length))];
                if (recommendation === undefined)
                    return;
                app.push(createTextInputScene({
                    title: `Provider de l'Agent ${recommendation.role}`,
                    hint: "Exemples : Claude Code, Codex CLI, Antigravity. Ce nom entre dans l'identité humaine de l'Agent.",
                    onSubmit(provider) {
                        app.pop();
                        void openPrompt(recommendation, provider.trim());
                    },
                }));
            }
            async function openPrompt(recommendation, provider) {
                try {
                    const result = await orchestration.initializationPrompt({
                        projectId: feature.projectId,
                        featureId: feature.id,
                        role: recommendation.role,
                        mode: recommendation.mode,
                        provider,
                    });
                    app.push(promptView(`Prompt Agent ${recommendation.role}`, result.prompt, result.preflightCommand));
                }
                catch (error) {
                    app.push(errorView("Prompt Agent impossible", error));
                }
            }
        },
    };
}
function adviceView(advice) {
    const recommendations = advice.recommendations.length === 0
        ? ["- Aucun profil secondaire à lancer maintenant."]
        : advice.recommendations.map((item) => `- ${item.mode === "execute" ? "MAINTENANT" : "PRÉPARATION"} · ${item.role} · session ${item.sessionId}\n  ${item.reason}\n  ${item.command}`);
    return createResultView({
        title: "Conseil du Product principal",
        code: advice.productPrincipal.status === "conflict" ? 3 : 0,
        output: [
            `Phase : ${advice.phase}`,
            `Prochaine étape : ${advice.nextStepId ?? "choisir une Feature"}`,
            `Product principal : ${advice.productPrincipal.status} · ${advice.productPrincipal.agentId ?? "non lié"} · session main`,
            `Conseil : ${advice.productNextAction}`,
            "",
            "Agents proposés :",
            ...recommendations,
            "",
            `Reprise Product : ${advice.handoffPromptCommand}`,
            ...advice.warnings.map((warning) => `AVERTISSEMENT — ${warning}`),
        ].join("\n") + "\n",
        onBack: () => { },
        nextStep: advice.recommendations[0]?.command ?? advice.handoffPromptCommand,
    });
}
function promptView(title, prompt, preflightCommand) {
    return createResultView({
        title,
        code: 0,
        output: `${preflightCommand === undefined ? "" : `PRÉREQUIS PRODUCT AVANT LA NOUVELLE SESSION\n${preflightCommand}\n\n`}${prompt}\n`,
        onBack: () => { },
        nextStep: "copiez ce prompt dans une nouvelle session Agent ; la session vérifiera elle-même chaque identifiant",
    });
}
function errorView(title, error) {
    return createResultView({ title, code: 3, output: `${error instanceof Error ? error.message : String(error)}\n`, onBack: () => { } });
}
//# sourceMappingURL=agent-orchestration-scene-controller.js.map