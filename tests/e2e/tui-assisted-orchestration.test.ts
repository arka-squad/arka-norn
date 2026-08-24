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
import { test } from "node:test";

import { createRenderer } from "../../src/adapters/inbound/tui/runtime/render.ts";
import { createTheme } from "../../src/adapters/inbound/tui/runtime/theme.ts";
import { createOrchestrationView } from "../../src/adapters/inbound/tui/views/orchestration-view.ts";
import { setActiveLocale } from "../../src/application/localization/locale.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import { ExecutionPolicy } from "../../src/domain/orchestration/execution-policy.ts";
import { ExecutionRecord } from "../../src/domain/orchestration/execution-record.ts";
import { MissionOrder } from "../../src/domain/orchestration/mission-order.ts";
import { userExecutionTarget } from "../../src/domain/orchestration/types.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

import type {
  ForOrchestration,
  OrchestrationPreview,
  OrchestrationPreviewCandidate,
  OrchestrationStatus,
} from "../../src/ports/inbound/for-orchestration.ts";

setActiveLocale("fr");

const at = new Date("2026-08-21T12:00:00.000Z");
const theme = createTheme({ NO_COLOR: "1" }, false);

test("le Pilote assisté demande une Feature, montre une préparation lisible et confirme le choix figé", async () => {
  const project = createProject();
  const alpha = createFeature(project, "feature-alpha", "Analyse catalogue");
  const beta = createFeature(project, "feature-beta", "Paiement en ligne");
  const target = userExecutionTarget("codex", "gpt-5-codex");
  let previewedFeature: string | undefined;
  let started: Parameters<ForOrchestration["start"]>[0] | undefined;
  let status = emptyStatus(project);
  const orchestration: ForOrchestration = {
    async configure() { throw new Error("not used"); },
    async preview(input) {
      previewedFeature = input.featureId.value;
      const feature = input.featureId.equals(beta.id) ? beta : alpha;
      return createPreview(project, feature, [{ target, eligible: true, reasons: [], recommended: true }]);
    },
    async start(input) {
      started = input;
      const record = createExecution(project, beta, target);
      status = { ...status, executions: [record], activeExecution: record, latestExecution: record };
      return record;
    },
    status: async () => status,
    async cancel() { throw new Error("not used"); },
    async approve() { throw new Error("not used"); },
    async retry() { throw new Error("not used"); },
  };
  const view = createOrchestrationView({
    project,
    initialStatus: status,
    initialFeatures: [alpha, beta],
    orchestration,
    redraw() {},
    onBack() {},
  });

  assert.match(render(view), /Choisir une Feature à préparer/);
  view.onKey({ kind: "enter" });
  assert.match(render(view), /Choisissez la Feature à préparer/);
  view.onKey({ kind: "down" });
  view.onKey({ kind: "enter" });
  await waitUntil(() => {
    const output = render(view);
    return previewedFeature === beta.id.value
      && output.includes("Choisissez l’assistant et le modèle à confirmer")
      && !output.includes("Préparation en cours");
  }, "prévisualisation de la Feature choisie");
  assert.match(render(view), /Choisissez l’assistant et le modèle à confirmer/);
  view.onKey({ kind: "enter" });
  await waitUntil(() => render(view).includes("Préparation terminée"), "aperçu après choix de l’assistant");

  const prepared = render(view);
  assert.match(prepared, /Feature : Paiement en ligne/);
  assert.match(prepared, /Étape : Cadrer la Feature/);
  assert.match(prepared, /Responsabilité : Pilotage produit/);
  assert.match(prepared, /Autorisations : Lire les fichiers du périmètre/);
  assert.match(prepared, /Assistant à confirmer : Codex CLI · gpt-5-codex/);
  assert.doesNotMatch(prepared, /feature-beta|concept|product|read_workspace|claude-sdk|preview-fingerprint/u);
  assert.equal(started, undefined, "la prévisualisation ne lance rien");

  view.onKey({ kind: "enter" });
  await waitUntil(() => started !== undefined, "confirmation du lancement");
  const confirmed = started as unknown as Parameters<ForOrchestration["start"]>[0];
  assert.equal(confirmed.featureId.value, beta.id.value);
  assert.deepEqual(confirmed.selection, { provider: "codex", model: "gpt-5-codex" });
  assert.equal(confirmed.previewFingerprint, "preview-fingerprint");
});

test("un choix assistant/modèle est enregistré explicitement puis relu avant confirmation", async () => {
  const project = createProject();
  const feature = createFeature(project, "feature-modele", "Configuration assistée");
  const target = userExecutionTarget("kimi", "kimi-latest");
  let configured: Parameters<ForOrchestration["configure"]>[0] | undefined;
  let started = false;
  const orchestration: ForOrchestration = {
    async configure(input) {
      configured = input;
      return ExecutionPolicy.defaultFor(project.id, at);
    },
    async preview() {
      return createPreview(project, feature, configured === undefined ? [] : [{ target, eligible: true, reasons: [], recommended: true }]);
    },
    async start() {
      started = true;
      return createExecution(project, feature, target);
    },
    status: async () => emptyStatus(project),
    async cancel() { throw new Error("not used"); },
    async approve() { throw new Error("not used"); },
    async retry() { throw new Error("not used"); },
  };
  const view = createOrchestrationView({
    project,
    initialStatus: emptyStatus(project),
    initialFeatures: [feature],
    orchestration,
    redraw() {},
    onBack() {},
  });

  view.onKey({ kind: "enter" });
  await waitUntil(() => render(view).includes("Aucun assistant et modèle compatibles"), "sélection sans modèle configuré");
  assert.equal(started, false);
  view.onKey({ kind: "enter" });
  assert.match(render(view), /Choisissez l’assistant/);
  view.onKey({ kind: "down" });
  view.onKey({ kind: "down" });
  view.onKey({ kind: "enter" });
  assert.match(render(view), /Assistant : Kimi Platform/);
  for (const character of "kimi-latest") view.onKey({ kind: "char", value: character });
  view.onKey({ kind: "enter" });
  assert.match(render(view), /Choisissez l’espace de travail de la campagne/);
  view.onKey({ kind: "enter" });
  await waitUntil(() => configured !== undefined, "enregistrement du modèle");
  assert.deepEqual(configured?.selection, { provider: "kimi", model: "kimi-latest" });
  assert.equal(started, false, "enregistrer un modèle ne démarre pas de mission");
  await waitUntil(() => render(view).includes("Assistant à confirmer : Kimi Platform · kimi-latest"), "nouvelle prévisualisation après configuration");

  view.onKey({ kind: "enter" });
  await waitUntil(() => started, "confirmation explicite après la nouvelle prévisualisation");
});

test("une préparation devenue obsolète est expliquée sans exposer son détail technique", async () => {
  const project = createProject();
  const feature = createFeature(project, "feature-obsolete", "Préparation obsolète");
  const target = userExecutionTarget("claude", "claude-sonnet");
  const orchestration: ForOrchestration = {
    async configure() { throw new Error("not used"); },
    async preview() { return createPreview(project, feature, [{ target, eligible: true, reasons: [], recommended: true }]); },
    async start() { throw new Error("The mission preview changed before confirmation: precondition_changed"); },
    status: async () => emptyStatus(project),
    async cancel() { throw new Error("not used"); },
    async approve() { throw new Error("not used"); },
    async retry() { throw new Error("not used"); },
  };
  const view = createOrchestrationView({
    project,
    initialStatus: emptyStatus(project),
    initialFeatures: [feature],
    orchestration,
    redraw() {},
    onBack() {},
  });

  view.onKey({ kind: "enter" });
  await waitUntil(() => {
    const output = render(view);
    return output.includes("Choisissez l’assistant et le modèle à confirmer") && !output.includes("Préparation en cours");
  }, "choix explicite de l’assistant");
  view.onKey({ kind: "enter" });
  await waitUntil(() => render(view).includes("Préparation terminée"), "prévisualisation initiale");
  view.onKey({ kind: "enter" });
  await waitUntil(() => render(view).includes("La situation a changé depuis la préparation"), "message de précondition obsolète");
  assert.doesNotMatch(render(view), /precondition_changed|preview-fingerprint/u);
});

test("le Pilote assisté résume une mission active, ses derniers jalons et la décision attendue", () => {
  const project = createProject();
  const feature = createFeature(project, "feature-suivi", "Suivi de mission");
  const target = userExecutionTarget("zai", "glm-coding-plan");
  const running = createExecution(project, feature, target)
    .begin({ at: new Date("2026-08-21T12:01:00.000Z") })
    .appendEvent("progress_update", "worker diagnostic that must stay private", new Date("2026-08-21T12:02:00.000Z"))
    .awaitApproval(
      { code: "permission_requested", detail: "adapter diagnostic that must stay private" },
      new Date("2026-08-21T12:03:00.000Z"),
    );
  const status: OrchestrationStatus = {
    ...emptyStatus(project),
    executions: [running],
    activeExecution: running,
    latestExecution: running,
    actionRequired: {
      kind: "approve",
      executionId: running.id,
      reason: "adapter diagnostic that must stay private",
    },
  };
  const view = createOrchestrationView({
    project,
    initialStatus: status,
    initialFeatures: [feature],
    orchestration: readOnlyOrchestration(status),
    redraw() {},
    onBack() {},
  });

  const output = render(view);
  assert.match(output, /Mission active : execution-assistee/);
  assert.match(output, /Étape : Cadrer la Feature/);
  assert.match(output, /Assistant : Z\.AI Coding Plan · glm-coding-plan/);
  assert.match(output, /Situation : Votre décision est requise/);
  assert.match(output, /Derniers événements :/);
  assert.match(output, /Arka a mis à jour le suivi de la mission/);
  assert.match(output, /Votre décision est maintenant requise/);
  assert.match(output, /Action attendue : Donnez votre accord ou arrêtez la mission/);
  assert.match(output, /Pourquoi : L’assistant demande une autorisation supplémentaire/);
  assert.doesNotMatch(output, /worker diagnostic|adapter diagnostic|permission_requested|awaiting_approval/u);
});

test("la dernière mission validée indique que la prochaine doit être préparée de nouveau", () => {
  const project = createProject();
  const feature = createFeature(project, "feature-terminee", "Mission terminée");
  const target = userExecutionTarget("claude", "claude-sonnet");
  const completed = createExecution(project, feature, target)
    .begin({ at: new Date("2026-08-21T12:01:00.000Z") })
    .succeed(["preuves/resultat.md"], new Date("2026-08-21T12:02:00.000Z"))
    .appendEvent("next_preview_required", "control plane detail", new Date("2026-08-21T12:03:00.000Z"));
  const status: OrchestrationStatus = {
    ...emptyStatus(project),
    executions: [completed],
    latestExecution: completed,
  };
  const view = createOrchestrationView({
    project,
    initialStatus: status,
    initialFeatures: [feature],
    orchestration: readOnlyOrchestration(status),
    redraw() {},
    onBack() {},
  });

  const output = render(view);
  assert.match(output, /Dernière mission : execution-assistee/);
  assert.match(output, /Assistant : Claude Code CLI · claude-sonnet/);
  assert.match(output, /Situation : Mission terminée/);
  assert.match(output, /Résultat reçu et vérifié par Arka/);
  assert.match(output, /La prochaine mission devra être préparée et confirmée/);
  assert.match(output, /Action attendue : Préparez la prochaine mission lorsque vous le souhaitez/);
  assert.match(output, /Arka ne lancera jamais la suite sans vous l’expliquer et obtenir votre confirmation/);
  assert.doesNotMatch(output, /next_preview_required|control plane detail/u);
});

test("une analyse lecture seule explique la validation humaine sans afficher la sortie provider", () => {
  const project = createProject();
  const feature = createFeature(project, "feature-audit", "Audit en lecture seule");
  const target = userExecutionTarget("claude", "claude-sonnet");
  const analysis = createExecution(project, feature, target)
    .begin({ at: new Date("2026-08-21T12:01:00.000Z") })
    .succeed(["analysis:verdict:findings_require_review"], new Date("2026-08-21T12:02:00.000Z"))
    .appendEvent("read_only_analysis_ready", "provider output must stay private", new Date("2026-08-21T12:03:00.000Z"))
    .appendEvent("manual_pipeline_validation_required", "provider_output_must_stay_private", new Date("2026-08-21T12:04:00.000Z"));
  const status: OrchestrationStatus = {
    ...emptyStatus(project),
    executions: [analysis],
    latestExecution: analysis,
    actionRequired: {
      kind: "inspect",
      executionId: analysis.id,
      reason: "provider output must stay private",
    },
  };
  const view = createOrchestrationView({
    project,
    initialStatus: status,
    initialFeatures: [feature],
    orchestration: readOnlyOrchestration(status),
    redraw() {},
    onBack() {},
  });

  const output = render(view);
  assert.match(output, /Situation : Analyse prête à valider/);
  assert.match(output, /L’analyse a relevé des éléments à examiner/);
  assert.match(output, /Conclusion d’analyse reçue en lecture seule/);
  assert.match(output, /Validation humaine du livrable requise avant la suite/);
  assert.match(output, /Action attendue : Validez le livrable d’audit avant de poursuivre/);
  assert.match(output, /Voir la validation attendue/);
  assert.doesNotMatch(output, /Préparer la mission/);
  assert.doesNotMatch(output, /provider output|provider_output_must_stay_private|findings_require_review/u);
});

function createProject(): Project {
  return Project.create({
    id: ProjectId.of("project-assiste"),
    name: "Project assisté",
    root: "/workspace/project-assiste",
    schemaVersion: 4,
    orchestrationMode: "automatic",
    createdAt: at,
    updatedAt: at,
  });
}

function createFeature(project: Project, id: string, name: string): Feature {
  return Feature.create({
    id: FeatureId.of(id),
    projectId: project.id,
    name,
    root: `${project.root}/${id}`,
    pipelineId: "arka-norn-default",
    schemaVersion: 3,
    createdAt: at,
    updatedAt: at,
  });
}

function createPreview(
  project: Project,
  feature: Feature,
  candidates: readonly OrchestrationPreviewCandidate[],
): OrchestrationPreview {
  return {
    schemaVersion: 1,
    projectId: project.id.value,
    featureId: feature.id.value,
    featureName: feature.name,
    stepId: "concept",
    role: "product",
    summary: "Préparer un cadrage clair pour la prochaine décision produit.",
    scopePaths: ["zone-de-travail"],
    requiredCapabilities: ["inspect_workspace"],
    requiredPermissions: ["read_workspace"],
    candidates,
    fingerprint: "preview-fingerprint",
  };
}

function createExecution(project: Project, feature: Feature, target: OrchestrationPreviewCandidate["target"]): ExecutionRecord {
  const order = MissionOrder.create({
    id: "mission-assistee",
    scope: { projectId: project.id, featureId: feature.id, paths: [feature.id.value] },
    preconditions: { pipelineId: feature.pipelineId, nextStepId: "concept" },
    requiredCapabilities: ["inspect_workspace"],
    requiredPermissions: ["read_workspace"],
    summary: "Mission de test.",
    issuedAt: at,
  });
  return ExecutionRecord.planned("execution-assistee", order, target, at);
}

function emptyStatus(project: Project): OrchestrationStatus {
  return {
    schemaVersion: 1,
    projectId: project.id.value,
    orchestrationMode: project.orchestrationMode,
    policy: undefined,
    executions: [],
    activeExecution: undefined,
    latestExecution: undefined,
    actionRequired: undefined,
  };
}

function readOnlyOrchestration(status: OrchestrationStatus): ForOrchestration {
  return {
    async configure() { throw new Error("not used"); },
    async preview() { throw new Error("not used"); },
    async start() { throw new Error("not used"); },
    status: async () => status,
    async cancel() { throw new Error("not used"); },
    async approve() { throw new Error("not used"); },
    async retry() { throw new Error("not used"); },
  };
}

function render(view: ReturnType<typeof createOrchestrationView>): string {
  let output = "";
  view.render(createRenderer({ write: (chunk) => { output += chunk; }, isTTY: false, columns: 140 }), theme);
  return output;
}

async function waitUntil(predicate: () => boolean, label: string, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
  }
  throw new Error(`Timeout TUI : ${label}`);
}
