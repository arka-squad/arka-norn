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

import { createAgentAdvice, createInitializationPrompt, createProductHandoffPrompt } from "../../src/application/agents/agent-orchestration.ts";
import { AgentId } from "../../src/domain/agent/agent-id.ts";
import { AgentSessionId } from "../../src/domain/agent/agent-session-id.ts";
import { AgentRegistration } from "../../src/domain/agent/agent.ts";
import { FeatureId } from "../../src/domain/feature/feature-id.ts";
import { Feature } from "../../src/domain/feature/feature.ts";
import type { PipelineReport } from "../../src/domain/pipeline/pipeline-report.ts";
import { ProjectId } from "../../src/domain/project/project-id.ts";
import { Project } from "../../src/domain/project/project.ts";

const AT = new Date("2026-08-20T10:00:00.000Z");
const PROJECT_ID = ProjectId.of("arka-norn");
const FEATURE_ID = FeatureId.of("navigation-tui");
const PROJECT = Project.create({ id: PROJECT_ID, name: "Arka Norn", root: "/workspace/arka-norn", schemaVersion: 3, createdAt: AT, updatedAt: AT });
const FASTDEV = Feature.create({ id: FEATURE_ID, projectId: PROJECT_ID, name: "Navigation TUI", root: "/workspace/arka-norn/features/navigation-tui", pipelineId: "arka-norn-fastdev", schemaVersion: 3, createdAt: AT, updatedAt: AT });
const ESSENTIAL = Feature.create({ id: FEATURE_ID, projectId: PROJECT_ID, name: "Navigation TUI", root: "/workspace/arka-norn/features/navigation-tui", pipelineId: "arka-norn-essential", schemaVersion: 4, documentContractVersion: 5, createdAt: AT, updatedAt: AT });
const PRODUCT = agent("Codex_product_20260820", "product");

test("le conseil FastDev lance l'audit et autorise seulement une préparation Dev parallèle", () => {
  const state = stateFor(report("delivery_audit", "Audit - 3/4"));
  const advice = createAgentAdvice(state);

  assert.equal(advice.productPrincipal.status, "ready");
  assert.equal(advice.nextStepId, "delivery_audit");
  assert.deepEqual(advice.recommendations.map(({ role, mode, skillProfile, skill }) => ({ role, mode, skillProfile, skill })), [
    { role: "audit", mode: "execute", skillProfile: "audit", skill: "arka-fastdev" },
    { role: "dev", mode: "prepare", skillProfile: "dev", skill: "arka-fastdev" },
  ]);
});

test("le conseil Essentiel dérive le rôle de l'action et route vers la skill guidée", () => {
  const essentialReport = { ...report("delivery_audit", "Audit - 4/5"), pipelineId: ESSENTIAL.pipelineId };
  const advice = createAgentAdvice({ ...stateFor(essentialReport), feature: ESSENTIAL });
  assert.deepEqual(advice.recommendations.map(({ role, skill }) => ({ role, skill })), [
    { role: "audit", skill: "arka-essential" },
    { role: "dev", skill: "arka-essential" },
  ]);
});

test("un prompt spécialisé interdit d'exécuter une phase qui ne lui appartient pas", () => {
  const state = stateFor(report("delivery_audit", "Audit - 3/4"));
  assert.throws(() => createInitializationPrompt(state, { role: "dev", mode: "execute" }), /cannot execute/);

  const prompt = createInitializationPrompt(state, { role: "dev", provider: "Codex", mode: "prepare" });
  assert.equal(prompt.canWrite, false);
  assert.equal(prompt.sessionId, "dev-navigation-tui");
  assert.equal(prompt.skill, "arka-fastdev");
  assert.match(prompt.preflightCommand, /skills install.*--profile dev/);
  assert.doesNotMatch(prompt.prompt, /Use \$arka-norn, then \$arka-fastdev/);
  assert.match(prompt.prompt, /\$arka-framework-mastery, then \$arka-fastdev/);
  assert.match(prompt.prompt, /--paths 'features\/navigation-tui'/);
  assert.match(prompt.prompt, /never select or replace.*main session/i);
  assert.match(prompt.prompt, /Read-only work/);
});

test("un prompt réutilise exactement l'Agent déjà lié et refuse un provider implicite pour une nouvelle session", () => {
  const audit = agent("Claude_audit_20260820", "audit");
  const state = stateFor(report("delivery_audit", "Audit - 3/4"), [
    { sessionId: AgentSessionId.MAIN, agent: PRODUCT },
    { sessionId: AgentSessionId.of("audit-navigation-tui"), agent: audit },
  ]);
  const reused = createInitializationPrompt(state, { role: "audit", mode: "execute" });
  assert.match(reused.prompt, new RegExp(`agent use ${audit.id.value}.*--session audit-navigation-tui`));
  assert.doesNotMatch(reused.prompt, /agent register/);

  assert.throws(() => createInitializationPrompt(stateFor(report("development_report", "Development")), { role: "dev", mode: "execute" }), /--provider is required/);
});

test("le Product principal est stable dans main et son prompt de reprise conserve son identité", () => {
  const state = stateFor(report("development_report", "Development - iteration 2"), [
    { sessionId: AgentSessionId.MAIN, agent: PRODUCT },
    { sessionId: AgentSessionId.of("audit-navigation-tui"), agent: agent("Claude_audit_20260820", "audit") },
  ]);
  const handoff = createProductHandoffPrompt(state);

  assert.equal(handoff.agentId, PRODUCT.id.value);
  assert.equal(handoff.sessionId, "main");
  assert.match(handoff.prompt, /agent use Codex_product_20260820.*--session main/);
  assert.match(handoff.prompt, /audit-navigation-tui: Claude_audit_20260820/);
  assert.match(handoff.prompt, /cd '\/workspace\/arka-norn'/);
  assert.match(handoff.prompt, /agent sessions --project arka-norn/);
  assert.match(handoff.prompt, /Do not perform audit, development or QA/);
});

test("une liaison main non Product est signalée comme conflit", () => {
  const developer = agent("Codex_dev_20260820", "dev");
  const advice = createAgentAdvice(stateFor(report("development_report", "Development"), [{ sessionId: AgentSessionId.MAIN, agent: developer }], [PRODUCT, developer]));
  assert.equal(advice.productPrincipal.status, "conflict");
  assert.match(advice.productPrincipal.reason, /instead of an active Product Agent/);
});

function stateFor(
  pipelineReport: PipelineReport,
  sessions: readonly { readonly sessionId: AgentSessionId; readonly agent: AgentRegistration }[] = [{ sessionId: AgentSessionId.MAIN, agent: PRODUCT }],
  agents: readonly AgentRegistration[] = [PRODUCT, ...sessions.map((binding) => binding.agent).filter((candidate) => candidate.id.value !== PRODUCT.id.value)],
) {
  return { project: PROJECT, feature: FASTDEV, report: pipelineReport, agents, sessions };
}

function report(stepId: string, phase: string): PipelineReport {
  return {
    schemaVersion: 2,
    pipelineId: "arka-norn-fastdev",
    featureRoot: FASTDEV.root,
    featureId: FASTDEV.id.value,
    selectedDocuments: {},
    overallStatus: "incomplete",
    steps: [],
    transversalDocuments: [],
    nextActions: [{ kind: stepId === "development_report" ? "continue_development" : "run_audit", stepId, phase, reason: "Calculated step", instructions: ["Produce evidence"], suggestedCommand: `arka-norn pipeline scaffold ${stepId}` }],
    errors: [],
    warnings: [],
    unknownFiles: [],
  };
}

function agent(id: string, role: string): AgentRegistration {
  return AgentRegistration.create({
    id: AgentId.of(id),
    provider: id.split("_")[0]!,
    role,
    active: true,
    scope: { projectId: PROJECT_ID, featureIds: [FEATURE_ID], paths: [], responsibilities: [role] },
    registeredAt: AT,
    updatedAt: AT,
  });
}
