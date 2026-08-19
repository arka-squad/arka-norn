import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import { createAgentDetailView } from "../../adapters/inbound/tui/views/agent-detail-view.js";
import { createAgentRegistryView } from "../../adapters/inbound/tui/views/agent-registry-view.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
export function createAgentSceneController(app, agentsPort) {
    return {
        async open(project, onChanged) {
            await pushRegistry(project, onChanged);
        },
    };
    async function pushRegistry(project, onChanged) {
        const [agents, current] = await Promise.all([agentsPort.list(project), agentsPort.current(project)]);
        onChanged(agents, current);
        app.push(createAgentRegistryView({
            project,
            agents,
            ...(current === undefined ? {} : { currentAgentId: current.id.value }),
            onBack: () => app.pop(),
            onRegister: () => registerFlow(project, onChanged),
            onOpenAgent: (agent) => openDetail(project, agent, current?.id.value === agent.id.value, onChanged),
        }));
    }
    function registerFlow(project, onChanged) {
        prompt("Nouvel agent — provider", "Exemple : Codex CLI, Claude Code, Antigravity", "", true, (provider) => {
            prompt("Nouvel agent — rôle", "Exemple : dev, qa, audit, architecte", "dev", true, (role) => {
                prompt("Périmètre — Features", "IDs séparés par des virgules ; vide = toutes les Features du Project", "", false, (features) => {
                    prompt("Périmètre — chemins", "Chemins relatifs séparés par des virgules ; vide = tout le Project", "", false, (paths) => {
                        prompt("Périmètre — responsabilités", "Responsabilités séparées par des points-virgules ; vide = non précisées", "", false, (responsibilities) => {
                            void runMutation(project, false, () => agentsPort.register({
                                project,
                                provider,
                                role,
                                ...(features.trim() === "" ? {} : { featureIds: split(features, ",").map((value) => FeatureId.of(value)) }),
                                ...(paths.trim() === "" ? {} : { paths: split(paths, ",") }),
                                ...(responsibilities.trim() === "" ? {} : { responsibilities: split(responsibilities, ";") }),
                            }), "Identité enregistrée", onChanged);
                        });
                    });
                });
            });
        });
    }
    function openDetail(project, agent, current, onChanged) {
        app.push(createAgentDetailView({
            agent,
            current,
            onBack: () => app.pop(),
            onSelect: () => runMutation(project, true, () => agentsPort.select(project, agent.id), "Identité sélectionnée", onChanged),
            onReplace: () => replaceFlow(project, agent, onChanged),
            onDeactivate: () => confirmDeactivate(project, agent, onChanged),
        }));
    }
    function replaceFlow(project, replaced, onChanged) {
        prompt("Remplacement — provider", "Provider du nouvel agent", "", true, (provider) => {
            prompt("Remplacement — rôle", "Le périmètre existant sera conservé", replaced.role, true, (role) => {
                void runMutation(project, true, () => agentsPort.replace({ project, replacedAgentId: replaced.id, provider, role }), "Agent remplacé", onChanged);
            });
        });
    }
    function confirmDeactivate(project, agent, onChanged) {
        app.push(createMenuScene([
            { label: `Oui, désactiver ${agent.id.value}`, value: "confirm", description: "irréversible ; l’historique est conservé" },
            { label: "Non, revenir", value: "cancel" },
        ], {
            title: "Confirmer la désactivation",
            hint: "Entrée confirmer · Échap annuler",
            onSelect(value) {
                app.pop();
                if (value === "confirm")
                    void runMutation(project, true, () => agentsPort.deactivate(project, agent.id), "Agent désactivé", onChanged);
            },
        }));
    }
    function prompt(title, hint, initialValue, required, next) {
        app.push(createTextInputScene({
            title,
            hint,
            initialValue,
            required,
            onCancel: () => { },
            onSubmit(value) {
                app.pop();
                next(value.trim());
            },
        }));
    }
    async function runMutation(project, fromDetail, operation, title, onChanged) {
        try {
            const result = await operation();
            if (fromDetail)
                app.pop();
            app.pop();
            await pushRegistry(project, onChanged);
            app.push(createResultView({
                title,
                code: 0,
                output: `${result.id.value}\nÉtat : ${result.active ? "actif" : "inactif"}\nProchaine étape : vérifiez le périmètre puis revenez à la Feature.\n`,
                onBack: () => { },
            }));
        }
        catch (error) {
            app.push(createResultView({
                title: `${title} — échec`,
                code: 3,
                output: `${error instanceof Error ? error.message : String(error)}\nAucune transition n’a été confirmée.\n`,
                onBack: () => { },
            }));
        }
    }
}
function split(value, separator) {
    return value.split(separator).map((item) => item.trim()).filter(Boolean);
}
//# sourceMappingURL=agent-scene-controller.js.map