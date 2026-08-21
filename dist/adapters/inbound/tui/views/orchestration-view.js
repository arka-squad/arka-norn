import { titledBox } from "../components/box.js";
import { createMenuScene } from "../components/menu.js";
/**
 * Presentation only: it reads the control-plane registry and exposes only
 * explicit user actions. It never invokes a shell or a provider directly.
 */
export function createOrchestrationView(deps) {
    let project = deps.project;
    let status = deps.initialStatus;
    let busy = false;
    let message;
    let menu = buildMenu();
    function buildMenu() {
        return createMenuScene(items(), {
            hint: "↑/↓ naviguer · Entrée agir · Échap retour",
            maxVisible: 8,
            onSelect: (action) => void select(action),
        });
    }
    function items() {
        const active = status.activeExecution;
        return [
            {
                label: status.orchestrationMode === "automatic" ? "Lancer la prochaine mission validée" : "Armer puis lancer la prochaine mission validée",
                value: "start",
                description: "Arka vérifie l’étape et le scope avant de confier l’ordre au worker local",
            },
            { label: "Actualiser le suivi", value: "refresh", description: "relit le registre persistant ; aucun processus n’est exposé" },
            ...(active !== undefined && (active.status === "planned" || active.status === "running" || active.status === "awaiting_approval")
                ? [{ label: `Annuler ${active.id}`, value: "cancel", description: "annulation explicite, tracée dans le registre" }]
                : []),
            ...(active?.status === "awaiting_approval"
                ? [{ label: `Approuver ${active.id}`, value: "approve", description: "relance après contrôle des préconditions actuelles" }]
                : []),
            ...(active !== undefined && (active.status === "failed" || active.status === "cancelled" || active.status === "interrupted")
                ? [{ label: `Relancer ${active.id}`, value: "retry", description: "nouvelle tentative avec le même provider, jamais un fallback caché" }]
                : []),
            { label: "← Retour au Project", value: "back" },
        ];
    }
    async function select(action) {
        if (busy)
            return;
        if (action === "back") {
            deps.onBack();
            return;
        }
        await run(async () => {
            try {
                if (action === "start") {
                    const execution = await deps.orchestration.start({ projectId: project.id });
                    message = `Mission ${execution.id} planifiée avec ${execution.provider}.`;
                }
                else if (action === "cancel") {
                    const active = requireActiveExecution(status);
                    const execution = await deps.orchestration.cancel({ projectId: project.id, executionId: active.id });
                    message = `Mission ${execution.id} annulée.`;
                }
                else if (action === "approve") {
                    const active = requireActiveExecution(status);
                    const execution = await deps.orchestration.approve({ projectId: project.id, executionId: active.id });
                    message = `Approbation enregistrée pour ${execution.id}.`;
                }
                else if (action === "retry") {
                    const active = requireActiveExecution(status);
                    const execution = await deps.orchestration.retry({ projectId: project.id, executionId: active.id });
                    message = `Nouvelle tentative planifiée pour ${execution.id} avec ${execution.provider}.`;
                }
            }
            finally {
                await refreshStatusAndProject();
            }
        });
    }
    async function refreshStatusAndProject() {
        const refreshedStatus = await deps.orchestration.status({ projectId: project.id });
        if (deps.refreshProject !== undefined && refreshedStatus.orchestrationMode !== project.orchestrationMode) {
            project = await deps.refreshProject();
        }
        status = refreshedStatus;
        menu = buildMenu();
    }
    async function run(task) {
        busy = true;
        deps.redraw();
        try {
            await task();
        }
        catch (error) {
            message = error instanceof Error ? error.message : String(error);
        }
        finally {
            busy = false;
            deps.redraw();
        }
    }
    return {
        chrome: { contextBanner: false },
        onKey(event) {
            if (event.kind === "escape") {
                deps.onBack();
                return "consumed";
            }
            return menu.onKey(event);
        },
        render(renderer, theme) {
            renderer.redraw((line) => {
                const active = status.activeExecution;
                const requested = status.actionRequired;
                for (const value of titledBox("Orchestration automatique", [
                    `Project : ${project.name}`,
                    `Mode : ${status.orchestrationMode === "automatic" ? "automatique" : "manuel"}`,
                    `Mission active : ${active === undefined ? "aucune" : `${active.id} · ${active.status} · ${active.provider}`}`,
                    `Action attendue : ${requested === undefined ? "aucune" : `${requested.kind} · ${requested.reason}`}`,
                    `Politique : ${status.policy === undefined ? "non initialisée" : status.policy.providers.map((provider) => `${provider.provider}${provider.enabled ? "" : " (désactivé)"}`).join(", ")}`,
                ], theme, { border: active?.status === "awaiting_approval" ? theme.arkaAccent : theme.arkaRed }).split("\n"))
                    line(value);
                line("");
                for (const value of renderExecutionDetails(active, theme))
                    line(value);
                if (busy)
                    line(`  ${theme.dim("Chargement…")}`);
                if (message !== undefined)
                    line(`  ${theme.arkaAccent(message)}`);
                for (const value of menu.renderLines(theme))
                    line(value);
            });
        },
    };
}
function requireActiveExecution(status) {
    if (status.activeExecution === undefined)
        throw new Error("Aucune mission active à modifier.");
    return status.activeExecution;
}
function renderExecutionDetails(execution, theme) {
    if (execution === undefined)
        return [theme.dim("  Le registre ne contient aucune mission active.")];
    const events = execution.events.slice(-4).map((event) => `  ${event.at.toISOString()} · ${event.type} · ${event.detail}`);
    const reasons = execution.suspensionReason === undefined
        ? []
        : [`  Suspension : ${execution.suspensionReason.code} · ${execution.suspensionReason.detail}`];
    const proofs = execution.proofReferences.length === 0
        ? []
        : [`  Preuves : ${execution.proofReferences.join(", ")}`];
    return [
        `  Provider : ${execution.provider}${execution.providerSessionId === undefined ? "" : ` · session ${execution.providerSessionId}`}`,
        `  Tentatives : ${execution.attempts.length} · événements affichés : ${execution.events.length}${execution.truncatedEventCount === 0 ? "" : ` (+${execution.truncatedEventCount} tronqués)`}`,
        ...reasons,
        ...proofs,
        ...events,
    ];
}
//# sourceMappingURL=orchestration-view.js.map