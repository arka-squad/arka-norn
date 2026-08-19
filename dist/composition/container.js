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
import { createMenuScene } from "../adapters/inbound/tui/components/menu.js";
import { createTextInputScene } from "../adapters/inbound/tui/components/text-input.js";
import { createInputSource } from "../adapters/inbound/tui/runtime/input.js";
import { createRenderer } from "../adapters/inbound/tui/runtime/render.js";
import { createTheme } from "../adapters/inbound/tui/runtime/theme.js";
import { createTuiApp } from "../adapters/inbound/tui/runtime/tui-app.js";
import { createProjectDetailView } from "../adapters/inbound/tui/views/project-detail-view.js";
import { createFeatureDetailView } from "../adapters/inbound/tui/views/feature-detail-view.js";
import { createHomeView } from "../adapters/inbound/tui/views/home-view.js";
import { createResultView } from "../adapters/inbound/tui/views/result-view.js";
import { pipelineExitCode, presentPipelineReport } from "../adapters/inbound/cli/presenters/pipeline-report-presenter.js";
import { FsFilesystem } from "../adapters/outbound/filesystem/fs-filesystem.js";
import { DirectSkillManager } from "../adapters/outbound/skills/direct-skill-manager.js";
import { mapConcurrent } from "../application/shared/map-concurrent.js";
import { createManagementRuntime } from "./management-runtime.js";
import { createPipelineRuntime } from "./pipeline-runtime.js";
import { createDoctorRuntime } from "./doctor-runtime.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/composition/container.js -> remonte de 2 niveaux vers la racine du framework.
const FRAMEWORK_ROOT = resolve(__dirname, "..", "..");
export function createContainer(env) {
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
    const appTheme = createTheme(process.env, process.stdout.isTTY);
    const app = createTuiApp({
        input: createInputSource(process.stdin),
        renderer: createRenderer(process.stdout),
        theme: appTheme,
        viewport: () => ({ columns: process.stdout.columns, rows: process.stdout.rows }),
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
    async function showPipelineStatus(feature) {
        const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
        app.push(createResultView({
            title: "Statut du pipeline",
            code: pipelineExitCode(report),
            output: presentPipelineReport(report),
            onBack: () => { },
        }));
    }
    async function runScaffoldFlow(feature) {
        const steps = await pipeline.listSteps();
        app.push(createMenuScene(steps.map((step) => ({ label: step.id, value: step.id, description: step.required ? "obligatoire" : step.transversal ? "transversale" : "optionnelle" })), {
            title: "Quelle étape générer ?",
            onSelect: (stepId) => {
                app.pop();
                app.push(createTextInputScene({
                    title: `Squelette — ${stepId}`,
                    hint: "Chemin du fichier de sortie",
                    initialValue: `${feature.root}/${stepId}.json`,
                    onSubmit: (fichier) => {
                        app.pop();
                        void pipeline.scaffold({ stepId, outputPath: fichier, allowedRoot: feature.root }).then((result) => app.push(createResultView({
                            title: `Squelette — ${stepId}`,
                            code: 0,
                            output: `Squelette écrit : ${result.outputPath}\nValeurs à remplacer : ${result.sentinelPaths.length}\n`,
                            onBack: () => { },
                        })), (error) => app.push(createResultView({
                            title: `Squelette — ${stepId}`,
                            code: error instanceof Error && "code" in error && error.code === "EEXIST" ? 5 : 70,
                            output: error instanceof Error ? error.message : String(error),
                            onBack: () => { },
                        })));
                    },
                    onCancel: () => { },
                }));
            },
            onCancel: () => { },
        }));
    }
    function runValidateFlow(feature) {
        app.push(createTextInputScene({
            title: "Valider un document",
            hint: "Chemin du fichier JSON à valider",
            initialValue: `${feature.root}/`,
            onSubmit: (fichier) => {
                app.pop();
                void pipeline.validate({ filePath: fichier }).then((result) => {
                    app.push(createResultView({
                        title: "Validation",
                        code: result.valid ? 0 : 3,
                        output: result.valid ? `VALIDE — ${fichier}\n` : `INVALIDE — ${fichier}\n${result.errors.map((error) => `- ${error}`).join("\n")}\n`,
                        onBack: () => { },
                    }));
                });
            },
            onCancel: () => { },
        }));
    }
    function runInstallFlow() {
        app.push(createMenuScene([
            { label: "Projet courant seulement", value: "repo" },
            { label: "Projet courant + scope global (~/.claude/skills)", value: "global" },
            { label: "Annuler", value: "cancel" },
        ], {
            title: "Installer les skills arka-framework-*",
            onSelect: (choice) => {
                app.pop();
                if (choice === "cancel")
                    return;
                void skillManager.install({ target: env.cwd, global: choice === "global" }).then((result) => {
                    app.push(createResultView({ title: "Installation des skills", code: result.code, output: result.output, onBack: () => { } }));
                });
            },
            onCancel: () => { },
        }));
    }
    function confirmForgetFeature(feature) {
        app.push(createMenuScene([
            { label: `Oui, retirer "${feature.name}" de l'index`, value: "confirm" },
            { label: "Annuler", value: "cancel" },
        ], {
            title: `Retirer "${feature.name}" ?`,
            hint: "Le dossier et ses fichiers JSON ne sont PAS supprimés, seule l'entrée d'index l'est.",
            onSelect: (choice) => {
                app.pop();
                if (choice === "cancel")
                    return;
                void features.forget(feature.id).then(() => {
                    uiState.currentFeature = undefined;
                    // Pop la vue de détail -> retour au Project.
                    app.pop();
                }, (err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    app.push(createResultView({ title: "Retrait impossible", code: 1, output: message, onBack: () => { } }));
                });
            },
            onCancel: () => { },
        }));
    }
    function confirmForgetProject(project) {
        app.push(createMenuScene([
            { label: `Oui, retirer "${project.name}" de l'index`, value: "confirm" },
            { label: "Annuler", value: "cancel" },
        ], {
            title: `Retirer "${project.name}" ?`,
            hint: "Le dossier et ses features ne sont PAS supprimés, seule l'entrée d'index l'est.",
            onSelect: (choice) => {
                app.pop();
                if (choice === "cancel")
                    return;
                void projects.forget(project.id).then(() => {
                    uiState.currentProject = undefined;
                    // Pop la vue de détail -> retour à l'accueil.
                    app.pop();
                }, (err) => {
                    const message = err instanceof Error ? err.message : String(err);
                    app.push(createResultView({ title: "Retrait impossible", code: 1, output: message, onBack: () => { } }));
                });
            },
            onCancel: () => { },
        }));
    }
    async function openFeatureDetail(feature) {
        uiState.currentFeature = feature;
        const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
        app.push(createFeatureDetailView({
            feature,
            report,
            redraw: () => app.redraw(),
            onBack: () => app.pop(),
            onShowStatus: (f) => showPipelineStatus(f),
            onScaffold: (f) => runScaffoldFlow(f),
            onValidate: (f) => runValidateFlow(f),
            onForget: (f) => {
                confirmForgetFeature(f);
            },
        }));
    }
    async function openProjectDetail(project) {
        uiState.currentProject = project;
        const initialFeatures = (await features.list()).filter((feature) => feature.belongsTo(project.id));
        const initialMetrics = new Map(await mapConcurrent(initialFeatures, 4, async (feature) => {
            const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
            return [feature.id.value, metricsFromReport(report)];
        }));
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
            onForget: (selectedProject) => {
                confirmForgetProject(selectedProject);
            },
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
                onInstallSkills: () => {
                    runInstallFlow();
                },
            });
        },
    };
}
function metricsFromReport(report) {
    const debts = report.steps.find((step) => step.id === "registre_dettes");
    const qa = report.steps.find((step) => step.id === "recette_qa");
    return {
        status: report.overallStatus,
        debtDocuments: debts?.documents.length ?? 0,
        qaFailures: qa?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
        handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
        invalidDocuments: report.steps.reduce((count, step) => count + step.documents.filter((document) => !document.valid).length, 0),
    };
}
//# sourceMappingURL=container.js.map