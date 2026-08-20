import { createMenuScene } from "../../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../../adapters/inbound/tui/components/text-input.js";
import type { TuiApp } from "../../adapters/inbound/tui/runtime/tui-app.js";
import { createAgentDetailView } from "../../adapters/inbound/tui/views/agent-detail-view.js";
import { createAgentRegistryView } from "../../adapters/inbound/tui/views/agent-registry-view.js";
import { createResultView } from "../../adapters/inbound/tui/views/result-view.js";
import type { AgentRegistration } from "../../domain/agent/agent.js";
import { FeatureId } from "../../domain/feature/feature-id.js";
import type { Project } from "../../domain/project/project.js";
import type { ForAgents } from "../../ports/inbound/for-agents.js";

export interface AgentSceneController {
  open(project: Project, onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void): Promise<void>;
}

export function createAgentSceneController(app: TuiApp, agentsPort: ForAgents): AgentSceneController {
  return {
    async open(project, onChanged) {
      await pushRegistry(project, onChanged);
    },
  };

  async function pushRegistry(project: Project, onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void): Promise<void> {
    const [agents, current, sessions] = await Promise.all([agentsPort.list(project), agentsPort.current(project), agentsPort.sessions(project)]);
    onChanged(agents, current);
    app.push(createAgentRegistryView({
      project,
      agents,
      ...(current === undefined ? {} : { currentAgentId: current.id.value }),
      sessionId: agentsPort.sessionId.value,
      sessionBindings: sessions.map((binding) => ({ sessionId: binding.sessionId.value, agentId: binding.agent.id.value })),
      onBack: () => app.pop(),
      onRegister: () => registerFlow(project, onChanged),
      onOpenAgent: (agent) => openDetail(project, agent, current?.id.value === agent.id.value, onChanged),
    }));
  }

  function registerFlow(project: Project, onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void): void {
    prompt("Nouvel agent — provider", "Exemple : Codex CLI, Claude Code, Antigravity", "", true, (provider) => {
      if (agentsPort.sessionId.value === "main") {
        prompt(
          "Product principal — responsabilités",
          "La session main organise le Project et les autres Agents ; séparez par des points-virgules",
          "organisation produit;priorisation;coordination des Agents;validation des décisions utilisateur",
          true,
          (responsibilities) => {
            void runMutation(
              project,
              false,
              () => agentsPort.register({ project, provider, role: "product", responsibilities: split(responsibilities, ";") }),
              "Product principal enregistré",
              onChanged,
            );
          },
        );
        return;
      }
      prompt("Nouvel agent — rôle", "Exemple : dev, qa, audit, architecte", "dev", true, (role) => {
        prompt("Périmètre — Features", "IDs séparés par des virgules ; vide = toutes les Features du Project", "", false, (features) => {
          prompt("Périmètre — chemins", "Chemins relatifs séparés par des virgules ; vide = tout le Project", "", false, (paths) => {
            prompt("Périmètre — responsabilités", "Responsabilités séparées par des points-virgules ; vide = non précisées", "", false, (responsibilities) => {
              void runMutation(
                project,
                false,
                () => agentsPort.register({
                  project,
                  provider,
                  role,
                  ...(features.trim() === "" ? {} : { featureIds: split(features, ",").map((value) => FeatureId.of(value)) }),
                  ...(paths.trim() === "" ? {} : { paths: split(paths, ",") }),
                  ...(responsibilities.trim() === "" ? {} : { responsibilities: split(responsibilities, ";") }),
                }),
                "Identité enregistrée",
                onChanged,
              );
            });
          });
        });
      });
    });
  }

  function openDetail(
    project: Project,
    agent: AgentRegistration,
    current: boolean,
    onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void,
  ): void {
    app.push(createAgentDetailView({
      agent,
      current,
      onBack: () => app.pop(),
      onSelect: () => runMutation(project, true, () => agentsPort.select(project, agent.id), "Identité sélectionnée", onChanged),
      onReplace: () => replaceFlow(project, agent, onChanged),
      onDeactivate: () => confirmDeactivate(project, agent, onChanged),
    }));
  }

  function replaceFlow(
    project: Project,
    replaced: AgentRegistration,
    onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void,
  ): void {
    prompt("Remplacement — provider", "Provider du nouvel agent", "", true, (provider) => {
      prompt("Remplacement — rôle", "Le périmètre existant sera conservé", replaced.role, true, (role) => {
        void runMutation(
          project,
          true,
          () => agentsPort.replace({ project, replacedAgentId: replaced.id, provider, role }),
          "Agent remplacé",
          onChanged,
        );
      });
    });
  }

  function confirmDeactivate(
    project: Project,
    agent: AgentRegistration,
    onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void,
  ): void {
    app.push(createMenuScene([
      { label: `Oui, désactiver ${agent.id.value}`, value: "confirm", description: "irréversible ; l’historique est conservé" },
      { label: "Non, revenir", value: "cancel" },
    ], {
      title: "Confirmer la désactivation",
      hint: "Entrée confirmer · Échap annuler",
      onSelect(value) {
        app.pop();
        if (value === "confirm") void runMutation(project, true, () => agentsPort.deactivate(project, agent.id), "Agent désactivé", onChanged);
      },
    }));
  }

  function prompt(
    title: string,
    hint: string,
    initialValue: string,
    required: boolean,
    next: (value: string) => void,
  ): void {
    app.push(createTextInputScene({
      title,
      hint,
      initialValue,
      required,
      onCancel: () => {},
      onSubmit(value) {
        app.pop();
        next(value.trim());
      },
    }));
  }

  async function runMutation(
    project: Project,
    fromDetail: boolean,
    operation: () => Promise<AgentRegistration>,
    title: string,
    onChanged: (agents: readonly AgentRegistration[], current: AgentRegistration | undefined) => void,
  ): Promise<void> {
    try {
      const result = await operation();
      if (fromDetail) app.pop();
      app.pop();
      await pushRegistry(project, onChanged);
      app.push(createResultView({
        title,
        code: 0,
        output: `${result.id.value}\nÉtat : ${result.active ? "actif" : "inactif"}\nProchaine étape : vérifiez le périmètre puis revenez à la Feature.\n`,
        onBack: () => {},
      }));
    } catch (error) {
      app.push(createResultView({
        title: `${title} — échec`,
        code: 3,
        output: `${error instanceof Error ? error.message : String(error)}\nAucune transition n’a été confirmée.\n`,
        onBack: () => {},
      }));
    }
  }
}

function split(value: string, separator: string): readonly string[] {
  return value.split(separator).map((item) => item.trim()).filter(Boolean);
}
