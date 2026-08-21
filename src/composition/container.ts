/**
 * Composition root -- câble domaine/ports/use-cases/adapters/TUI. Port TS
 * très simplifié de arka-cc-management (composition/container.ts) : pas de
 * bundles/catalogue/préférences/agent/gouvernance/mémoire/chat (aucun de
 * ces sous-systèmes n'existent dans arka-norn). Pipeline, gestion et skills
 * sont appelés directement par leurs ports : aucun sous-processus CLI dans
 * la boucle de rendu.
 *
 * Navigation à 3 niveaux : Home (Projects) -> ProjectDetail (Features du
 * Project) -> FeatureDetail (actions pipeline). La relation est portée par
 * `Feature.projectId` et non déduite d'un préfixe de chemin.
 *
 * Toute la navigation multi-écrans (home -> detail, detail -> saisie ->
 * résultat) est orchestrée ICI, jamais dans les vues elles-mêmes : les
 * vues n'ont qu'des callbacks (`onOpenFeature`, `onShowStatus`, ...), le
 * container seul détient `app` et sait pousser/dépiler des Scenes.
 */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderArkaHeader, type ContextInfo } from "../adapters/inbound/tui/components/banner.js";
import { createInputSource, type InputSource } from "../adapters/inbound/tui/runtime/input.js";
import { createRenderer, type Renderer } from "../adapters/inbound/tui/runtime/render.js";
import { createTheme, type Theme } from "../adapters/inbound/tui/runtime/theme.js";
import { createTuiApp, type TuiApp } from "../adapters/inbound/tui/runtime/tui-app.js";
import { createProjectDetailView } from "../adapters/inbound/tui/views/project-detail-view.js";
import { createFeatureDetailView } from "../adapters/inbound/tui/views/feature-detail-view.js";
import { createOrchestrationView } from "../adapters/inbound/tui/views/orchestration-view.js";
import { createHomeView, type HomeView } from "../adapters/inbound/tui/views/home-view.js";
import { createResultView } from "../adapters/inbound/tui/views/result-view.js";
import { FsFilesystem } from "../adapters/outbound/filesystem/fs-filesystem.js";
import { DirectSkillManager } from "../adapters/outbound/skills/direct-skill-manager.js";
import type { Project } from "../domain/project/project.js";
import type { Feature } from "../domain/feature/feature.js";
import type { AgentRegistration } from "../domain/agent/agent.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type { ForScan } from "../ports/inbound/for-scan.js";
import type { ForScanProjects } from "../ports/inbound/for-scan-projects.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import type { Env } from "./env.js";
import { createManagementRuntime } from "./management-runtime.js";
import { createPipelineRuntime } from "./pipeline-runtime.js";
import { loadVerifiedFeatureContext } from "./verified-feature-context.js";
import { createDoctorRuntime } from "./doctor-runtime.js";
import { createPipelineSceneController } from "./tui/pipeline-scene-controller.js";
import { loadProjectMetrics, metricsFromReport, type AuthorRegistryForFeature } from "./tui/project-dashboard.js";
import { createResourceConfirmationController } from "./tui/resource-confirmation-controller.js";
import { showHealthReport, showSkillInstallation } from "./tui/skill-scene-controller.js";
import { createAgentSceneController } from "./tui/agent-scene-controller.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
import { createOrchestrationRuntime } from "./orchestration-runtime.js";
import { createAgentOrchestrationSceneController } from "./tui/agent-orchestration-scene-controller.js";

export interface Container {
  readonly env: Env;
  readonly app: TuiApp & { run(opts?: { registerProcessHandlers?: boolean }): Promise<void> };
  readonly projects: ForProjects;
  readonly scanProjects: ForScanProjects;
  readonly features: ForFeatures;
  readonly scan: ForScan;
  readonly pipeline: ForPipeline;
  setContextRoot(root: string): void;
  setContextProject(project: Project | undefined): void;
  setContextFeature(feature: Feature | undefined): void;
  createHomeView(): Promise<HomeView>;
}

export interface ContainerUiOptions {
  readonly input?: InputSource;
  readonly renderer?: Renderer;
  readonly theme?: Theme;
  readonly viewport?: () => { readonly columns?: number; readonly rows?: number };
}

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/composition/container.js -> remonte de 2 niveaux vers la racine du framework.
const FRAMEWORK_ROOT = resolve(__dirname, "..", "..");

export function createContainer(env: Env, ui: ContainerUiOptions = {}): Container {
  const filesystem = new FsFilesystem();
  const homeDir = env.homeDir ?? filesystem.homeDir();
  const management = createManagementRuntime({ homeDir, logLevel: env.logLevel, sessionId: env.agentSessionId });
  const projects: ForProjects = management.projects;
  const scanProjects: ForScanProjects = management.scanProjects;
  const features: ForFeatures = management.features;
  const scan: ForScan = management.scanFeatures;

  const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir });
  const skillManager = new DirectSkillManager(FRAMEWORK_ROOT);

  const uiState: { contextRoot: string; currentProject: Project | undefined; currentFeature: Feature | undefined; currentAgent: AgentRegistration | undefined } = {
    contextRoot: env.cwd,
    currentProject: undefined,
    currentFeature: undefined,
    currentAgent: undefined,
  };

  const appTheme = ui.theme ?? createTheme(process.env, process.stdout.isTTY);
  const app = createTuiApp({
    input: ui.input ?? createInputSource(process.stdin),
    renderer: ui.renderer ?? createRenderer(process.stdout),
    theme: appTheme,
    viewport: ui.viewport ?? (() => ({ columns: process.stdout.columns, rows: process.stdout.rows })),
    banners: {
      header: () => renderArkaHeader(appTheme, { runtimeLabel: `Node ${process.version}` }),
      context: (): ContextInfo => ({
        runtime: `Node ${process.version}`,
        root: uiState.contextRoot,
        ...(uiState.currentProject !== undefined ? { project: { name: uiState.currentProject.name } } : {}),
        ...(uiState.currentFeature !== undefined ? { feature: { name: uiState.currentFeature.name } } : {}),
        ...(uiState.currentAgent !== undefined ? { agent: { id: uiState.currentAgent.id.value } } : {}),
      }),
    },
  });
  const authorRegistryForFeature: AuthorRegistryForFeature = async (feature) => {
    return (await loadVerifiedFeatureContext(feature, management)).authorRegistry;
  };
  const pipelineScenes = createPipelineSceneController(app, pipeline, authorRegistryForFeature);
  const agentScenes = createAgentSceneController(app, management.agents);
  const orchestration = createAgentOrchestrationRuntime({ ...management, pipeline });
  const orchestrationScenes = createAgentOrchestrationSceneController(app, orchestration);
  const automaticOrchestration = createOrchestrationRuntime({ ...management, pipeline, homeDir, frameworkRoot: FRAMEWORK_ROOT });
  const confirmations = createResourceConfirmationController({
    app,
    projects,
    features,
    onFeatureForgotten: () => {
      uiState.currentFeature = undefined;
      app.pop();
    },
    onProjectForgotten: () => {
      uiState.currentProject = undefined;
      app.pop();
    },
  });

  async function openFeatureDetail(feature: Feature): Promise<void> {
    uiState.currentFeature = feature;
    const project = await projects.show(feature.projectId);
    const currentAgent = await management.agents.current(project);
    uiState.currentAgent = currentAgent;
    const authorRegistry = await authorRegistryForFeature(feature);
    const report = await pipeline.inspect({
      featureRoot: feature.root,
      featureId: feature.id.value,
      pipelineId: feature.pipelineId,
      authorRegistry,
    });
    app.push(
      createFeatureDetailView({
        feature,
        report,
        ...(currentAgent === undefined ? {} : { currentAgentId: currentAgent.id.value }),
        sessionId: env.agentSessionId.value,
        redraw: () => app.redraw(),
        onBack: () => app.pop(),
        onShowStatus: (selected) => pipelineScenes.showStatus(selected),
        onContinue: (selected) => pipelineScenes.showGuidance(selected),
        onOrchestrate: (selected) => orchestrationScenes.openFeatureOrchestration(selected),
        onScaffold: async (selected) => {
          const project = await projects.show(selected.projectId);
          const agent = await management.agents.current(project);
          if (agent === undefined) {
            app.push(createResultView({
              title: "Identité agent requise",
              code: 64,
              output: "Aucun agent actif sélectionné pour ce projet. Revenez au Project, ouvrez le registre Agents, puis enregistrez ou sélectionnez votre identité avant de générer un document.\n",
              onBack: () => {},
            }));
            return;
          }
          await pipelineScenes.scaffold(selected, agent, project.root);
        },
        onValidate: (selected) => pipelineScenes.validate(selected),
        onForget: (selected) => confirmations.forgetFeature(selected),
      }),
    );
  }

  async function openProjectDetail(project: Project): Promise<void> {
    uiState.currentProject = project;
    const [initialAgents, currentAgent] = await Promise.all([management.agents.list(project), management.agents.current(project)]);
    const initialFeatures = (await features.list()).filter((feature) => feature.belongsTo(project.id));
    const initialMetrics = await loadProjectMetrics(initialFeatures, pipeline, authorRegistryForFeature);
    const initialStatuses = new Map([...initialMetrics].map(([id, metrics]) => [id, metrics.status] as const));
    uiState.currentAgent = currentAgent;
    const projectView = createProjectDetailView({
        project,
        initialFeatures,
        initialStatuses,
        initialMetrics,
        initialAgents,
        ...(currentAgent === undefined ? {} : { currentAgentId: currentAgent.id.value }),
        sessionId: env.agentSessionId.value,
        projects,
        features,
        scan,
        redraw: () => app.redraw(),
        onBack: () => app.pop(),
        onFeatureFocused: (feature) => {
          uiState.currentFeature = feature;
        },
        onOpenFeature: (feature) => openFeatureDetail(feature),
        metricsForFeature: async (feature) => metricsFromReport(await pipeline.inspect({
          featureRoot: feature.root,
          featureId: feature.id.value,
          pipelineId: feature.pipelineId,
          authorRegistry: await authorRegistryForFeature(feature),
        }), feature.pipelineId),
        onForget: (selected) => confirmations.forgetProject(selected),
        onManageAgents: (selected) => agentScenes.open(selected, (agents, current) => {
          uiState.currentAgent = current;
          projectView.setAgents(agents, current?.id.value);
        }),
        onShowProductAdvice: (selected) => orchestrationScenes.showProjectAdvice(selected),
        onOpenOrchestration: async (selected) => {
          const status = await automaticOrchestration.status({ projectId: selected.id });
          app.push(createOrchestrationView({
            project: selected,
            initialStatus: status,
            orchestration: automaticOrchestration,
            refreshProject: async () => {
              const refreshed = await projects.show(selected.id);
              uiState.currentProject = refreshed;
              projectView.setProject(refreshed);
              return refreshed;
            },
            redraw: () => app.redraw(),
            onBack: () => app.pop(),
          }));
        },
      });
    app.push(projectView);
  }

  return {
    env,
    app,
    projects,
    scanProjects,
    features,
    scan,
    pipeline,
    setContextRoot(root: string): void {
      uiState.contextRoot = root;
    },
    setContextProject(project: Project | undefined): void {
      uiState.currentProject = project;
    },
    setContextFeature(feature: Feature | undefined): void {
      uiState.currentFeature = feature;
    },
    async createHomeView(): Promise<HomeView> {
      const initialProjects = await projects.list();
      const doctor = createDoctorRuntime(homeDir, env.cwd);
      const inspectHealth = async () => {
        const [skills, report] = await Promise.all([
          skillManager.inspect(env.cwd),
          doctor.run(),
        ]);
        return { skills, report };
      };
      const formatSkills = (skills: Awaited<ReturnType<typeof skillManager.inspect>>) =>
        `${skills.healthy}/${skills.total} sains · ${skills.missing} absents · ${skills.divergent} divergents`;
      const formatSystem = (report: Awaited<ReturnType<typeof doctor.run>>) =>
        `${report.summary.pass} PASS · ${report.summary.warn} WARN · ${report.summary.fail} FAIL`;
      const initialHealth = await inspectHealth();
      const homeRef: { current: HomeView | undefined } = { current: undefined };
      const refreshHomeHealth = async () => {
        const health = await inspectHealth();
        homeRef.current?.setHealth({
          skillHealth: formatSkills(health.skills),
          systemHealth: formatSystem(health.report),
        });
        return health;
      };
      const home = createHomeView({
        initialProjects,
        projects,
        scan: scanProjects,
        cwd: env.cwd,
        contextRoot: uiState.contextRoot,
        skillHealth: formatSkills(initialHealth.skills),
        systemHealth: formatSystem(initialHealth.report),
        redraw: () => app.redraw(),
        onProjectFocused: (project) => {
          uiState.currentProject = project;
        },
        onOpenProject: (project) => openProjectDetail(project),
        onShowHealth: async () => {
          const health = await refreshHomeHealth();
          showHealthReport(app, health.report, health.skills);
        },
        onInstallSkills: () => showSkillInstallation(app, skillManager, env.cwd, async () => {
          await refreshHomeHealth();
        }),
      });
      homeRef.current = home;
      return home;
    },
  };
}
