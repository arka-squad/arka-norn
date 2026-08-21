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

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import type { InputSource, KeyEvent, KeyListener } from "../../src/adapters/inbound/tui/runtime/input.ts";
import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { createHomeView } from "../../src/adapters/inbound/tui/views/home-view.ts";
import { createOrchestrationView } from "../../src/adapters/inbound/tui/views/orchestration-view.ts";
import { createProjectDetailView } from "../../src/adapters/inbound/tui/views/project-detail-view.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { ExecutionRecord } from "../../src/domain/orchestration/execution-record.ts";
import { MissionOrder } from "../../src/domain/orchestration/mission-order.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { createContainer } from "../../src/composition/container.ts";
import { createManagementRuntime } from "../../src/composition/management-runtime.ts";
import { readEnv } from "../../src/composition/env.ts";
import type { ForOrchestration, OrchestrationStatus } from "../../src/ports/inbound/for-orchestration.ts";

test("l’accueil crée un Project lorsque la racine ne contient aucun marker", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-create-project-"));
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const home = createHomeView({
    initialProjects: [],
    projects: management.projects,
    scan: management.scanProjects,
    cwd: projectRoot,
    contextRoot: projectRoot,
    redraw() {},
  });

  home.onKey({ kind: "enter" });
  home.onKey({ kind: "enter" });
  await waitForOrchestrationMode(home);
  home.onKey({ kind: "enter" });

  const marker = resolve(projectRoot, ".arka-norn", "project.json");
  await waitUntil(async () => (await management.projects.list()).length === 1, "indexation du Project créé");
  const [project] = await management.projects.list();
  assert.equal(existsSync(marker), true);
  assert.equal(project?.root, realpathSync.native(projectRoot));
  assert.equal(project?.name, "product");
  assert.equal(project?.orchestrationMode, "manual");
});

test("l’accueil TUI demande puis enregistre le mode d’orchestration pour un nouveau Project", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-orchestration-mode-"));
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const home = createHomeView({
    initialProjects: [],
    projects: management.projects,
    scan: management.scanProjects,
    cwd: projectRoot,
    contextRoot: projectRoot,
    redraw() {},
  });

  home.onKey({ kind: "enter" });
  home.onKey({ kind: "enter" });
  await waitForOrchestrationMode(home);
  home.onKey({ kind: "down" });
  home.onKey({ kind: "enter" });

  await waitUntil(async () => (await management.projects.list()).length === 1, "indexation du Project automatique");
  const [project] = await management.projects.list();
  assert.equal(project?.orchestrationMode, "automatic");
});

test("le détail TUI permet de basculer explicitement le mode Project", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-project-mode-change-"));
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });
  const view = createProjectDetailView({
    project,
    initialFeatures: [],
    projects: management.projects,
    features: management.features,
    scan: management.scanFeatures,
    redraw() {},
    onBack() {},
  });

  for (let index = 0; index < 5; index += 1) view.onKey({ kind: "down" });
  view.onKey({ kind: "enter" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "enter" });

  await waitUntil(async () => (await management.projects.show(ProjectId.of("project"))).orchestrationMode === "automatic", "bascule du mode Project");
  const updated = await management.projects.show(ProjectId.of("project"));
  assert.equal(updated.orchestrationMode, "automatic");
});

test("le Pilote assisté confirme une prévisualisation puis actualise le détail Project", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-orchestration-refresh-"));
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });
  const at = new Date("2026-08-21T10:00:00.000Z");
  const feature = Feature.create({
    id: FeatureId.of("feature"),
    projectId: project.id,
    name: "Feature préparée",
    root: resolve(projectRoot, "feature"),
    pipelineId: "arka-norn-default",
    schemaVersion: 3,
    createdAt: at,
    updatedAt: at,
  });
  const target = { provider: "claude", adapter: "claude-sdk", model: "claude-test", source: "user" } as const;
  const order = MissionOrder.create({
    id: "mission",
    scope: { projectId: project.id, featureId: feature.id, paths: ["feature"] },
    preconditions: { pipelineId: "arka-norn-default", nextStepId: "concept" },
    requiredCapabilities: ["inspect_workspace"],
    requiredPermissions: ["read_workspace"],
    summary: "Mission de test TUI.",
    issuedAt: at,
  });
  const execution = ExecutionRecord.planned("execution", order, target, at);
  let status: OrchestrationStatus = {
    schemaVersion: 1,
    projectId: project.id.value,
    orchestrationMode: "automatic",
    policy: undefined,
    executions: [],
    activeExecution: undefined,
    latestExecution: undefined,
    actionRequired: undefined,
  };
  let started: Parameters<ForOrchestration["start"]>[0] | undefined;
  const orchestration: ForOrchestration = {
    async start(input) {
      started = input;
      const armed = await management.projects.setOrchestrationMode({ id: input.projectId, orchestrationMode: "automatic" });
      status = {
        ...status,
        orchestrationMode: armed.orchestrationMode,
        executions: [execution],
        activeExecution: execution,
        latestExecution: execution,
      };
      return execution;
    },
    async configure() { throw new Error("not used"); },
    async preview() {
      return {
        schemaVersion: 1,
        projectId: project.id.value,
        featureId: feature.id.value,
        featureName: feature.name,
        stepId: "concept",
        role: "product",
        summary: "Préparer le cadrage de cette Feature.",
        scopePaths: ["feature"],
        requiredCapabilities: ["inspect_workspace"],
        requiredPermissions: ["read_workspace"],
        candidates: [{ target, eligible: true, reasons: [], recommended: true }],
        fingerprint: "preview-test",
      };
    },
    status: async () => status,
    cancel: async () => execution,
    approve: async () => execution,
    retry: async () => execution,
  };
  let dashboard: ReturnType<typeof createOrchestrationView> | undefined;
  let refreshes = 0;
  let synchronizedMode: "manual" | "automatic" | undefined;
  const detail = createProjectDetailView({
    project,
    initialFeatures: [feature],
    projects: management.projects,
    features: management.features,
    scan: management.scanFeatures,
    redraw() {},
    onBack() {},
    onOpenOrchestration: async (selected) => {
      dashboard = createOrchestrationView({
        project: selected,
        initialStatus: await orchestration.status({ projectId: selected.id }),
        initialFeatures: [feature],
        orchestration,
        refreshProject: async () => {
          refreshes += 1;
          const refreshed = await management.projects.show(selected.id);
          detail.setProject(refreshed);
          synchronizedMode = refreshed.orchestrationMode;
          return refreshed;
        },
        redraw() {},
        onBack() {},
      });
    },
  });

  for (let index = 0; index < 7; index += 1) detail.onKey({ kind: "down" });
  detail.onKey({ kind: "enter" });
  await waitUntil(() => dashboard !== undefined, "ouverture du cockpit d’orchestration");
  dashboard?.onKey({ kind: "enter" });
  await waitUntil(() => {
    let output = "";
    dashboard?.render(createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 }), createTheme({ NO_COLOR: "1" }, false));
    return output.includes("Choisissez l’assistant et le modèle à confirmer") && !output.includes("Préparation en cours");
  }, "choix explicite de l’assistant");
  dashboard?.onKey({ kind: "enter" });
  await waitUntil(() => {
    let output = "";
    dashboard?.render(createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 }), createTheme({ NO_COLOR: "1" }, false));
    return output.includes("Préparation terminée");
  }, "prévisualisation de la mission");
  dashboard?.onKey({ kind: "enter" });
  await waitUntil(async () => (await management.projects.show(project.id)).orchestrationMode === "automatic", "armement du Project par le cockpit");
  await waitUntil(() => synchronizedMode === "automatic", "synchronisation du Project après start");
  assert.equal(refreshes, 1);
  assert.deepEqual(started?.selection, { provider: "claude", model: "claude-test" });
  assert.equal(started?.featureId.value, feature.id.value);
  assert.equal(started?.previewFingerprint, "preview-test");

  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  detail.render(renderer, createTheme({ NO_COLOR: "1" }, false));
  assert.match(output, /Pilote assisté : activé/);
});

test("le détail Project refuse de confirmer une sélection manuelle devenue obsolète", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-orchestration-stale-mode-"));
  const projectRoot = resolve(sandbox, "product");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot, orchestrationMode: "manual" });
  const detail = createProjectDetailView({
    project,
    initialFeatures: [],
    projects: management.projects,
    features: management.features,
    scan: management.scanFeatures,
    redraw() {},
    onBack() {},
  });
  await management.projects.setOrchestrationMode({ id: project.id, orchestrationMode: "automatic" });

  // This scene still holds its initial manual Project. Confirming the default
  // selection must refresh it instead of persisting manual over automatic.
  for (let index = 0; index < 5; index += 1) detail.onKey({ kind: "down" });
  detail.onKey({ kind: "enter" });
  detail.onKey({ kind: "enter" });
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  const theme = createTheme({ NO_COLOR: "1" }, false);
  await waitUntil(() => {
    output = "";
    detail.render(renderer, theme);
    return output.includes("Pilote assisté actualisé : activé.");
  }, "actualisation de la sélection obsolète");
  assert.equal((await management.projects.show(project.id)).orchestrationMode, "automatic");
});

test("l’accueil TUI actualise Santé après l’installation des skills", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-health-refresh-"));
  const target = resolve(sandbox, "project");
  mkdirSync(target, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  let output = "";
  const theme = createTheme({ NO_COLOR: "1" }, false);
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  const container = createContainer(readEnv({ ARKA_NORN_HOME: sandbox }, target), {
    renderer,
    theme,
    viewport: () => ({ columns: 120, rows: 50 }),
  });
  const home = await container.createHomeView();
  container.app.push(home);

  home.onKey({ kind: "down" });
  home.onKey({ kind: "down" });
  home.onKey({ kind: "down" });
  home.onKey({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== home, "menu d’installation des skills");
  const installMenu = container.app.topScene();
  assert.ok(installMenu);
  installMenu.onKey({ kind: "enter" });
  await waitUntil(() => {
    const top = container.app.topScene();
    return top !== undefined && top !== home && top !== installMenu;
  }, "résultat d’installation des skills");

  container.app.topScene()?.render(renderer, theme);
  assert.match(output, /Project installé : les entrées globales restent à diagnostiquer puis confirmer séparément/);

  container.app.pop();
  output = "";
  home.render(renderer, theme);
  assert.match(output, /Santé\s+: .*0 FAIL/);
  assert.match(output, /Projet 18\/18 · Global 0\/18/);
});

test("la composition TUI pilote Home → Project → Feature → scaffold réel", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-navigation-"));
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(projectRoot, "feature");
  mkdirSync(featureRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox, sessionId: AgentSessionId.of("dev-feature") });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot });
  await management.features.create({ id: FeatureId.of("feature"), projectId: project.id, name: "Feature", root: featureRoot });
  const author = await management.agents.register({ project, provider: "Codex", role: "dev", featureIds: [FeatureId.of("feature")] });

  const input = controlledInput();
  const renderer = createRenderer({ write: () => true, isTTY: false });
  const env = readEnv({ ARKA_NORN_HOME: sandbox, ARKA_NORN_SESSION: "dev-feature" }, projectRoot);
  const container = createContainer(env, {
    input: input.source,
    renderer,
    theme: createTheme({}, false),
    viewport: () => ({ columns: 120, rows: 50 }),
  });
  const home = await container.createHomeView();
  container.app.push(home);
  const running = container.app.run({ registerProcessHandlers: false });

  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== home, "ouverture Project");
  const projectScene = container.app.topScene();
  assert.ok(projectScene);

  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== projectScene, "ouverture Feature");
  const featureScene = container.app.topScene();
  assert.ok(featureScene);

  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== featureScene, "menu scaffold");
  const stepMenu = container.app.topScene();
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== stepMenu, "saisie scaffold");
  const inputScene = container.app.topScene();
  input.send({ kind: "enter" });
  const conceptPath = resolve(featureRoot, "concept.json");
  await waitUntil(() => existsSync(conceptPath), "écriture scaffold");
  await waitUntil(() => container.app.topScene() !== inputScene && container.app.topScene() !== featureScene, "résultat scaffold");

  const document = JSON.parse(readFileSync(conceptPath, "utf8")) as { readonly type: string; readonly feature_id: string; readonly author_agent_id: string };
  assert.equal(document.type, "concept");
  assert.equal(document.feature_id, "feature");
  assert.equal(document.author_agent_id, author.id.value);

  input.send({ kind: "interrupt" });
  await running;
});

test("la TUI refuse d'inspecter une Feature marquée sans registre Agent", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-registry-required-"));
  const projectRoot = resolve(sandbox, "project");
  const featureRoot = resolve(projectRoot, "feature");
  mkdirSync(featureRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot });
  await management.features.create({ id: FeatureId.of("feature"), projectId: project.id, name: "Feature", root: featureRoot });

  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  const container = createContainer(readEnv({ ARKA_NORN_HOME: sandbox }, projectRoot), {
    renderer,
    theme: createTheme({ NO_COLOR: "1" }, false),
    viewport: () => ({ columns: 120, rows: 50 }),
  });
  const home = await container.createHomeView();
  container.app.push(home);

  home.onKey({ kind: "down" });
  home.onKey({ kind: "enter" });
  await waitUntil(() => {
    output = "";
    home.render(renderer, createTheme({ NO_COLOR: "1" }, false));
    return output.includes("cannot verify document authors for a managed Feature");
  }, "refus du registre Agent absent");

  assert.equal(container.app.topScene(), home);
});

test("la TUI enregistre et sélectionne une identité Agent sans connaissance implicite", async (context) => {
  const sandbox = mkdtempSync(join(tmpdir(), "arka-norn-tui-agent-"));
  const projectRoot = resolve(sandbox, "project");
  mkdirSync(projectRoot, { recursive: true });
  context.after(() => rmSync(sandbox, { recursive: true, force: true }));

  const management = createManagementRuntime({ homeDir: sandbox });
  const project = await management.projects.create({ id: ProjectId.of("project"), name: "Project", root: projectRoot });
  const input = controlledInput();
  const renderer = createRenderer({ write: () => true, isTTY: false });
  const container = createContainer(readEnv({ ARKA_NORN_HOME: sandbox }, projectRoot), {
    input: input.source,
    renderer,
    theme: createTheme({}, false),
    viewport: () => ({ columns: 120, rows: 50 }),
  });
  const home = await container.createHomeView();
  container.app.push(home);
  const running = container.app.run({ registerProcessHandlers: false });

  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== home, "ouverture Project pour registre Agent");
  const projectScene = container.app.topScene();
  assert.ok(projectScene);
  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "down" });
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== projectScene, "ouverture registre Agent");
  const registryScene = container.app.topScene();
  assert.ok(registryScene);
  input.send({ kind: "enter" });
  await waitUntil(() => container.app.topScene() !== registryScene, "saisie provider Agent");

  sendText(input.send, "Codex CLI");
  input.send({ kind: "enter" });
  input.send({ kind: "enter" });

  await waitUntil(() => {
    const top = container.app.topScene();
    return top !== undefined && top !== registryScene && top !== projectScene;
  }, "résultat de l'inscription Agent");
  const agents = await management.agents.list(project);
  const current = await management.agents.current(project);
  assert.equal(agents.length, 1);
  assert.match(agents[0]!.id.value, /^Codex-CLI_product_\d{8}$/);
  assert.equal(current?.id.value, agents[0]!.id.value);
  assert.deepEqual(agents[0]!.scope.responsibilities, ["organisation produit", "priorisation", "coordination des Agents", "validation des décisions utilisateur"]);

  input.send({ kind: "interrupt" });
  await running;
});

function controlledInput(): { readonly source: InputSource; readonly send: (event: KeyEvent) => void } {
  const listeners = new Set<KeyListener>();
  return {
    source: {
      start() {},
      stop() {},
      on(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    send(event) {
      for (const listener of [...listeners]) listener(event);
    },
  };
}

function sendText(send: (event: KeyEvent) => void, value: string): void {
  for (const character of value) send({ kind: "char", value: character });
}

async function waitUntil(predicate: () => boolean | Promise<boolean>, label: string, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error(`Timeout TUI : ${label}`);
}

async function waitForOrchestrationMode(home: ReturnType<typeof createHomeView>): Promise<void> {
  let output = "";
  const renderer = createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 120 });
  const theme = createTheme({ NO_COLOR: "1" }, false);
  await waitUntil(() => {
    output = "";
    home.render(renderer, theme);
    return output.includes("Niveau de délégation");
  }, "choix du mode d’orchestration");
}
