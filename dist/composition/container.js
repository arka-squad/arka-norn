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
import { renderArkaHeader } from "../adapters/inbound/tui/components/banner.js";
import { createInputSource } from "../adapters/inbound/tui/runtime/input.js";
import { createRenderer } from "../adapters/inbound/tui/runtime/render.js";
import { createTheme } from "../adapters/inbound/tui/runtime/theme.js";
import { createTuiApp } from "../adapters/inbound/tui/runtime/tui-app.js";
import { createProjectDetailView } from "../adapters/inbound/tui/views/project-detail-view.js";
import { createFeatureDetailView } from "../adapters/inbound/tui/views/feature-detail-view.js";
import { createHomeView } from "../adapters/inbound/tui/views/home-view.js";
import { FsFilesystem } from "../adapters/outbound/filesystem/fs-filesystem.js";
import { DirectSkillManager } from "../adapters/outbound/skills/direct-skill-manager.js";
import { createManagementRuntime } from "./management-runtime.js";
import { createPipelineRuntime } from "./pipeline-runtime.js";
import { createDoctorRuntime } from "./doctor-runtime.js";
import { createPipelineSceneController } from "./tui/pipeline-scene-controller.js";
import { loadProjectMetrics, metricsFromReport } from "./tui/project-dashboard.js";
import { createResourceConfirmationController } from "./tui/resource-confirmation-controller.js";
import { showHealthReport, showSkillInstallation } from "./tui/skill-scene-controller.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/composition/container.js -> remonte de 2 niveaux vers la racine du framework.
const FRAMEWORK_ROOT = resolve(__dirname, "..", "..");
export function createContainer(env, ui = {}) {
    const filesystem = new FsFilesystem();
    const homeDir = env.homeDir ?? filesystem.homeDir();
    const management = createManagementRuntime({ homeDir, logLevel: env.logLevel });
    const projects = management.projects;
    const scanProjects = management.scanProjects;
    const features = management.features;
    const scan = management.scanFeatures;
    const pipeline = createPipelineRuntime(FRAMEWORK_ROOT);
    const skillManager = new DirectSkillManager(FRAMEWORK_ROOT);
    const uiState = {
        contextRoot: env.cwd,
        currentProject: undefined,
        currentFeature: undefined,
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
            }),
        },
    });
    const pipelineScenes = createPipelineSceneController(app, pipeline);
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
        const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
        app.push(createFeatureDetailView({
            feature,
            report,
            redraw: () => app.redraw(),
            onBack: () => app.pop(),
            onShowStatus: (selected) => pipelineScenes.showStatus(selected),
            onScaffold: (selected) => pipelineScenes.scaffold(selected),
            onValidate: (selected) => pipelineScenes.validate(selected),
            onForget: (selected) => confirmations.forgetFeature(selected),
        }));
    }
    async function openProjectDetail(project) {
        uiState.currentProject = project;
        const initialFeatures = (await features.list()).filter((feature) => feature.belongsTo(project.id));
        const initialMetrics = await loadProjectMetrics(initialFeatures, pipeline);
        const initialStatuses = new Map([...initialMetrics].map(([id, metrics]) => [id, metrics.status]));
        app.push(createProjectDetailView({
            project,
            initialFeatures,
            initialStatuses,
            initialMetrics,
            features,
            scan,
            redraw: () => app.redraw(),
            onBack: () => app.pop(),
            onFeatureFocused: (feature) => {
                uiState.currentFeature = feature;
            },
            onOpenFeature: (feature) => openFeatureDetail(feature),
            metricsForFeature: async (feature) => metricsFromReport(await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value })),
            onForget: (selected) => confirmations.forgetProject(selected),
        }));
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
            const initialProjects = await projects.list();
            const [skillHealth, systemHealth] = await Promise.all([
                skillManager.inspect(env.cwd),
                createDoctorRuntime(homeDir, env.cwd).run(),
            ]);
            return createHomeView({
                initialProjects,
                projects,
                scan: scanProjects,
                cwd: env.cwd,
                contextRoot: uiState.contextRoot,
                skillHealth: `${skillHealth.healthy}/${skillHealth.total} sains · ${skillHealth.missing} absents · ${skillHealth.divergent} divergents`,
                systemHealth: `${systemHealth.summary.pass} PASS · ${systemHealth.summary.warn} WARN · ${systemHealth.summary.fail} FAIL`,
                redraw: () => app.redraw(),
                onProjectFocused: (project) => {
                    uiState.currentProject = project;
                },
                onOpenProject: (project) => openProjectDetail(project),
                onShowHealth: () => {
                    showHealthReport(app, systemHealth, skillHealth);
                },
                onInstallSkills: () => {
                    showSkillInstallation(app, skillManager, env.cwd);
                },
            });
        },
    };
}
//# sourceMappingURL=container.js.map