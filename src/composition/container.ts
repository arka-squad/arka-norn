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

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { renderArkaHeader, type ContextInfo } from "../adapters/inbound/tui/components/banner.js";
import { createInputSource, type InputSource } from "../adapters/inbound/tui/runtime/input.js";
import { createRenderer, type Renderer } from "../adapters/inbound/tui/runtime/render.js";
import { createTheme, type Theme } from "../adapters/inbound/tui/runtime/theme.js";
import { createTuiApp, type TuiApp } from "../adapters/inbound/tui/runtime/tui-app.js";
import { createProjectDetailView } from "../adapters/inbound/tui/views/project-detail-view.js";
import { createFeatureDetailView } from "../adapters/inbound/tui/views/feature-detail-view.js";
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
import { createAgentOrchestrationSceneController } from "./tui/agent-orchestration-scene-controller.js";
import { createFramingRuntime } from "./framing-runtime.js";
import { FsLocalePreferenceStore } from "../adapters/outbound/filesystem/fs-locale-preference-store.js";
import { activeLocale, formatNumber, resolveLocale, setActiveLocale, translate } from "../application/localization/locale.js";

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
  const framing = createFramingRuntime({ homeDir, frameworkRoot: FRAMEWORK_ROOT });
  const skillManager = new DirectSkillManager(FRAMEWORK_ROOT, homeDir);
  const localePreferences = new FsLocalePreferenceStore(homeDir);

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
  const orchestration = createAgentOrchestrationRuntime({ ...management, pipeline, preferredSurface: async () => (await localePreferences.loadPreferences()).preferredSurface });
  const orchestrationScenes = createAgentOrchestrationSceneController(app, orchestration);
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
      documentContractVersion: feature.documentContractVersion,
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
              title: translate("tui.container.agentRequired.title"),
              code: 64,
              output: translate("tui.container.agentRequired.output"),
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
    const [initialAgents, currentAgent] = await Promise.all([
      management.agents.list(project),
      management.agents.current(project),
    ]);
    const initialFeatures = await features.list(project.id);
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
          documentContractVersion: feature.documentContractVersion,
          authorRegistry: await authorRegistryForFeature(feature),
        }), feature.pipelineId),
        onForget: (selected) => confirmations.forgetProject(selected),
        onManageAgents: (selected) => agentScenes.open(selected, (agents, current) => {
          uiState.currentAgent = current;
          projectView.setAgents(agents, current?.id.value);
        }),
        onShowProductAdvice: (selected) => orchestrationScenes.showProjectAdvice(selected),
        onStartFraming: async (selected, outcome) => {
          const entry = await framing.enter({
            path: selected.root,
            newFeatureTitle: outcome,
            contentLocale: activeLocale(),
          });
          app.push(createResultView({
            title: translate("tui.container.framing.title"),
            code: 0,
            output: translate(entry.resumed ? "tui.container.framing.resumed" : "tui.container.framing.created", {
              title: entry.plan.target.kind === "feature" ? entry.plan.target.workingTitle : entry.project.name,
              revision: formatNumber(entry.plan.revision),
            }),
            onBack: () => {},
            nextStep: translate("tui.container.framing.next"),
          }));
        },
        onOpenOrchestration: () => {
          app.push(createResultView({
            title: translate("tui.container.orchestration23.title"),
            code: 0,
            output: translate("tui.container.orchestration23.output"),
            onBack: () => {},
            nextStep: translate("tui.container.orchestration23.next"),
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
      const preferences = await localePreferences.loadPreferences();
      const doctor = createDoctorRuntime(homeDir, env.cwd);
      const inspectHealth = async () => {
        const [projectSkills, globalSkills, report] = await Promise.all([
          skillManager.inspect(env.cwd),
          skillManager.inspectGlobal(),
          doctor.run(),
        ]);
        return { projectSkills, globalSkills, report };
      };
      const formatSkills = (
        projectSkills: Awaited<ReturnType<typeof skillManager.inspect>>,
        globalSkills: Awaited<ReturnType<typeof skillManager.inspectGlobal>>,
      ) => translate("tui.container.skillsSummary", {
        projectHealthy: formatNumber(projectSkills.healthy),
        projectTotal: formatNumber(projectSkills.total),
        globalHealthy: formatNumber(globalSkills.healthy),
        globalTotal: formatNumber(globalSkills.total),
      });
      const formatSystem = (report: Awaited<ReturnType<typeof doctor.run>>) =>
        translate("tui.skills.health.summary", {
          pass: formatNumber(report.summary.pass),
          warn: formatNumber(report.summary.warn),
          fail: formatNumber(report.summary.fail),
        });
      const initialHealth = await inspectHealth();
      const homeRef: { current: HomeView | undefined } = { current: undefined };
      const refreshHomeHealth = async () => {
        const health = await inspectHealth();
        homeRef.current?.setHealth({
          skillHealth: formatSkills(health.projectSkills, health.globalSkills),
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
        skillHealth: formatSkills(initialHealth.projectSkills, initialHealth.globalSkills),
        systemHealth: formatSystem(initialHealth.report),
        localePreference: preferences.locale,
        preferredSurface: preferences.preferredSurface,
        onLocaleChange: async (preference) => {
          await localePreferences.save(preference);
          setActiveLocale(resolveLocale({ preference, environment: process.env }));
        },
        onPreferredSurfaceChange: (surface) => localePreferences.savePreferredSurface(surface),
        redraw: () => app.redraw(),
        onProjectFocused: (project) => {
          uiState.currentProject = project;
        },
        onOpenProject: (project) => openProjectDetail(project),
        onShowHealth: async () => {
          const health = await refreshHomeHealth();
          showHealthReport(app, health.report, health.projectSkills, health.globalSkills);
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
