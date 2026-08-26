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
import { renderArkaHeader } from "../adapters/inbound/tui/components/banner.js";
import { createInputSource } from "../adapters/inbound/tui/runtime/input.js";
import { createRenderer } from "../adapters/inbound/tui/runtime/render.js";
import { createTheme } from "../adapters/inbound/tui/runtime/theme.js";
import { createTuiApp } from "../adapters/inbound/tui/runtime/tui-app.js";
import { createProjectDetailView } from "../adapters/inbound/tui/views/project-detail-view.js";
import { createFeatureDetailView } from "../adapters/inbound/tui/views/feature-detail-view.js";
import { createHomeView } from "../adapters/inbound/tui/views/home-view.js";
import { createResultView } from "../adapters/inbound/tui/views/result-view.js";
import { FsFilesystem } from "../adapters/outbound/filesystem/fs-filesystem.js";
import { DirectSkillManager } from "../adapters/outbound/skills/direct-skill-manager.js";
import { createManagementRuntime } from "./management-runtime.js";
import { createPipelineRuntime } from "./pipeline-runtime.js";
import { loadVerifiedFeatureContext } from "./verified-feature-context.js";
import { createDoctorRuntime } from "./doctor-runtime.js";
import { createPipelineSceneController } from "./tui/pipeline-scene-controller.js";
import { loadProjectMetrics, metricsFromReport } from "./tui/project-dashboard.js";
import { createResourceConfirmationController } from "./tui/resource-confirmation-controller.js";
import { showHealthReport, showSkillInstallation } from "./tui/skill-scene-controller.js";
import { createAgentSceneController } from "./tui/agent-scene-controller.js";
import { createAgentOrchestrationRuntime } from "./agent-orchestration-runtime.js";
import { createAgentOrchestrationSceneController } from "./tui/agent-orchestration-scene-controller.js";
import { createFramingRuntime } from "./framing-runtime.js";
import { FsLocalePreferenceStore } from "../adapters/outbound/filesystem/fs-locale-preference-store.js";
import { activeLocale, formatNumber, resolveLocale, setActiveLocale, translate } from "../application/localization/locale.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/composition/container.js -> remonte de 2 niveaux vers la racine du framework.
const FRAMEWORK_ROOT = resolve(__dirname, "..", "..");
export function createContainer(env, ui = {}) {
    const filesystem = new FsFilesystem();
    const homeDir = env.homeDir ?? filesystem.homeDir();
    const management = createManagementRuntime({ homeDir, logLevel: env.logLevel, sessionId: env.agentSessionId });
    const projects = management.projects;
    const scanProjects = management.scanProjects;
    const features = management.features;
    const scan = management.scanFeatures;
    const pipeline = createPipelineRuntime(FRAMEWORK_ROOT, { homeDir });
    const framing = createFramingRuntime({ homeDir, frameworkRoot: FRAMEWORK_ROOT });
    const skillManager = new DirectSkillManager(FRAMEWORK_ROOT, homeDir);
    const localePreferences = new FsLocalePreferenceStore(homeDir);
    const uiState = {
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
            context: () => ({
                runtime: `Node ${process.version}`,
                root: uiState.contextRoot,
                ...(uiState.currentProject !== undefined ? { project: { name: uiState.currentProject.name } } : {}),
                ...(uiState.currentFeature !== undefined ? { feature: { name: uiState.currentFeature.name } } : {}),
                ...(uiState.currentAgent !== undefined ? { agent: { id: uiState.currentAgent.id.value } } : {}),
            }),
        },
    });
    const authorRegistryForFeature = async (feature) => {
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
    async function openFeatureDetail(feature) {
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
        app.push(createFeatureDetailView({
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
                        onBack: () => { },
                    }));
                    return;
                }
                await pipelineScenes.scaffold(selected, agent, project.root);
            },
            onValidate: (selected) => pipelineScenes.validate(selected),
            onForget: (selected) => confirmations.forgetFeature(selected),
        }));
    }
    async function openProjectDetail(project) {
        uiState.currentProject = project;
        const [initialAgents, currentAgent] = await Promise.all([
            management.agents.list(project),
            management.agents.current(project),
        ]);
        const initialFeatures = await features.list(project.id);
        const initialMetrics = await loadProjectMetrics(initialFeatures, pipeline, authorRegistryForFeature);
        const initialStatuses = new Map([...initialMetrics].map(([id, metrics]) => [id, metrics.status]));
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
                    onBack: () => { },
                    nextStep: translate("tui.container.framing.next"),
                }));
            },
            onOpenOrchestration: () => {
                app.push(createResultView({
                    title: translate("tui.container.orchestration23.title"),
                    code: 0,
                    output: translate("tui.container.orchestration23.output"),
                    onBack: () => { },
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
        setContextRoot(root) {
            uiState.contextRoot = root;
        },
        setContextProject(project) {
            uiState.currentProject = project;
        },
        setContextFeature(feature) {
            uiState.currentFeature = feature;
        },
        async createHomeView() {
            const [initialProjects, initialDrafts, preferences] = await Promise.all([
                projects.list(),
                framing.listProjectDrafts(),
                localePreferences.loadPreferences(),
            ]);
            const doctor = createDoctorRuntime(homeDir, env.cwd);
            const inspectHealth = async () => {
                const [projectSkills, globalSkills, report] = await Promise.all([
                    skillManager.inspect(env.cwd),
                    skillManager.inspectGlobal(),
                    doctor.run(),
                ]);
                return { projectSkills, globalSkills, report };
            };
            const formatSkills = (projectSkills, globalSkills) => translate("tui.container.skillsSummary", {
                projectHealthy: formatNumber(projectSkills.healthy),
                projectTotal: formatNumber(projectSkills.total),
                globalHealthy: formatNumber(globalSkills.healthy),
                globalTotal: formatNumber(globalSkills.total),
            });
            const formatSystem = (report) => translate("tui.skills.health.summary", {
                pass: formatNumber(report.summary.pass),
                warn: formatNumber(report.summary.warn),
                fail: formatNumber(report.summary.fail),
            });
            const initialHealth = await inspectHealth();
            const homeRef = { current: undefined };
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
                initialDrafts,
                projects,
                framing,
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
                onDraftFocused: () => {
                    uiState.currentProject = undefined;
                    uiState.currentFeature = undefined;
                    uiState.currentAgent = undefined;
                },
                onOpenProject: (project) => openProjectDetail(project),
                onOpenDraft: (draft, plan) => {
                    app.push(createResultView({
                        title: translate("tui.container.framing.title"),
                        code: draft.materialization === "recovery_required" ? 70 : 0,
                        output: translate("tui.container.framing.resumed", { title: draft.name, revision: formatNumber(plan.revision) }),
                        onBack: () => app.pop(),
                        nextStep: draft.materialization === "recovery_required"
                            ? translate("tui.home.draft.recovery_required")
                            : translate("tui.container.framing.next"),
                    }));
                },
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
//# sourceMappingURL=container.js.map