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

import type { AgentRegistration } from "../../domain/agent/agent.js";
import { AgentSessionId, deriveAgentSessionId } from "../../domain/agent/agent-session-id.js";
import { InvalidAgentOptionError } from "../../domain/errors.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { NextAction, PipelineReport } from "../../domain/pipeline/pipeline-report.js";
import type { Project } from "../../domain/project/project.js";
import type {
  AgentInitializationPrompt,
  AgentOrchestrationAdvice,
  AgentRoleRecommendation,
  AgentWorkMode,
  OrchestratedAgentRole,
  ProductHandoffPrompt,
} from "../../ports/inbound/for-agent-orchestration.js";
import { canonicalDocumentType, canonicalPipelineId } from "../compatibility/legacy-french-contract.js";

export interface AgentOrchestrationState {
  readonly project: Project;
  readonly feature?: Feature;
  readonly report?: PipelineReport;
  readonly agents: readonly AgentRegistration[];
  readonly sessions: readonly { readonly sessionId: AgentSessionId; readonly agent: AgentRegistration }[];
  readonly warnings?: readonly string[];
}

interface RolePolicy {
  readonly role: OrchestratedAgentRole;
  readonly skill: string;
  readonly profile: string;
}

const ROLE_POLICIES: Readonly<Record<OrchestratedAgentRole, RolePolicy>> = {
  product: { role: "product", skill: "arka-product", profile: "product" },
  architecte: { role: "architecte", skill: "arka-framework-mastery", profile: "architecture" },
  audit: { role: "audit", skill: "arka-framework-audit", profile: "audit" },
  dev: { role: "dev", skill: "arka-framework-development", profile: "dev" },
  qa: { role: "qa", skill: "arka-framework-qa-review", profile: "qa" },
};

const STEP_ROLES: Readonly<Record<string, OrchestratedAgentRole>> = {
  concept: "product",
  feature_brief: "product",
  rework_brief: "product",
  plan: "product",
  debt_register: "product",
  agent_task: "product",
  technical_contract_appendix: "architecte",
  frozen_invariants: "architecte",
  technical_integration_specification: "architecte",
  current_state_audit: "audit",
  delivery_audit: "audit",
  development_report: "dev",
  qa_review: "qa",
  delivery_validation: "qa",
};

export function createAgentAdvice(state: AgentOrchestrationState): AgentOrchestrationAdvice {
  const next = state.report?.nextActions[0];
  const requiredRole = next === undefined ? undefined : roleForAction(next);
  const product = resolveProductPrincipal(state);
  const featureId = state.feature?.id.value;
  const recommendations = featureId === undefined || next === undefined || requiredRole === undefined
    ? []
    : recommendationsFor(requiredRole, next.stepId, state.feature!);
  const warnings = [...(state.warnings ?? [])];
  if (state.feature === undefined) warnings.push("No unique Feature is selected; Product must choose or create the priority before starting a specialized profile.");
  if (product.status !== "ready") warnings.push(product.reason);
  return {
    schemaVersion: 1,
    projectId: state.project.id.value,
    ...(featureId === undefined ? {} : { featureId }),
    ...(state.feature === undefined ? {} : { pipelineId: state.feature.pipelineId }),
    phase: next?.phase ?? (state.report?.overallStatus === "completed" ? "Closure" : "Project organization"),
    ...(next === undefined ? {} : { nextStepId: next.stepId }),
    productPrincipal: product,
    productNextAction: productNextAction(state, requiredRole, next?.stepId),
    recommendations,
    handoffPromptCommand: `arka-norn agent handoff-prompt --project ${state.project.id.value}${featureId === undefined ? "" : ` --feature ${featureId}`}`,
    warnings,
  };
}

export function createInitializationPrompt(
  state: AgentOrchestrationState,
  input: {
    readonly role: OrchestratedAgentRole;
    readonly provider?: string;
    readonly sessionId?: AgentSessionId;
    readonly mode?: AgentWorkMode;
  },
): AgentInitializationPrompt {
  const feature = state.feature;
  const policy = policyFor(input.role, feature);
  if (input.role !== "product" && feature === undefined) throw new InvalidAgentOptionError("feature", `role ${input.role} requires an explicit Feature`);
  const next = state.report?.nextActions[0];
  const requiredRole = next === undefined ? undefined : roleForAction(next);
  const advised = feature === undefined || next === undefined || requiredRole === undefined
    ? undefined
    : recommendationsFor(requiredRole, next.stepId, feature).find((item) => item.role === input.role);
  const mode = input.mode ?? advised?.mode ?? (input.role === "product" && requiredRole === "product" ? "execute" : "prepare");
  if (mode === "execute" && (next === undefined || requiredRole !== input.role)) {
    throw new InvalidAgentOptionError("mode", `role ${input.role} cannot execute step ${next?.stepId ?? "none"}; generate a prompt in prepare mode`);
  }
  const sessionId = input.role === "product"
    ? AgentSessionId.MAIN
    : input.sessionId ?? deriveAgentSessionId(input.role, feature!.id.value);
  if (input.role === "product" && input.sessionId !== undefined && !input.sessionId.equals(AgentSessionId.MAIN)) {
    throw new InvalidAgentOptionError("session", "the main Product Agent always uses the main session");
  }
  const existingAgent = resolveSessionAgent(state, sessionId, input.role, feature, input.provider);
  const canWrite = mode === "execute";
  const preflightCommand = `arka-norn skills install --target ${shellQuote(state.project.root)} --profile ${policy.profile}`;
  return {
    schemaVersion: 1,
    projectId: state.project.id.value,
    ...(feature === undefined ? {} : { featureId: feature.id.value }),
    role: input.role,
    mode,
    sessionId: sessionId.value,
    skill: policy.skill,
    skillProfile: policy.profile,
    preflightCommand,
    canWrite,
    ...(canWrite && next !== undefined ? { expectedStepId: next.stepId } : {}),
    prompt: renderInitializationPrompt(state, input.provider, policy, sessionId, mode, canWrite ? next?.stepId : undefined, existingAgent, preflightCommand),
  };
}

export function createProductHandoffPrompt(state: AgentOrchestrationState, requestedAgentId?: string): ProductHandoffPrompt {
  const product = resolveProductPrincipal(state);
  const agent = requestedAgentId === undefined
    ? product.agentId === undefined ? undefined : state.agents.find((candidate) => candidate.id.value === product.agentId)
    : state.agents.find((candidate) => candidate.id.value === requestedAgentId);
  if (agent === undefined) throw new InvalidAgentOptionError("product", "no active main Product Agent is available for handoff");
  if (!agent.active || roleCategory(agent.role) !== "product") throw new InvalidAgentOptionError("product", `Agent ${agent.id.value} is not an active main Product Agent`);
  const advice = createAgentAdvice(state);
  const feature = state.feature;
  const documents = state.report?.steps.flatMap((step) => step.documents.filter((document) => document.valid).map((document) => document.filePath)) ?? [];
  const sessionLines = state.sessions.map((binding) => `- ${binding.sessionId.value}: ${binding.agent.id.value} (${binding.agent.role}, ${binding.agent.active ? "active" : "inactive"})`);
  const prompt = [
    "Use $arka-norn, then $arka-product, to resume the main Product session without creating a new identity.",
    "",
    "HANDOFF CONTEXT - verify every value with the CLI before any mutation",
    `- Project: ${state.project.id.value}`,
    `- Root: ${state.project.root}`,
    `- Session: main`,
    `- Product Agent to reuse: ${agent.id.value}`,
    ...(feature === undefined ? ["- Feature: no unique Feature selected"] : [`- Feature: ${feature.id.value}`, `- Workflow: ${feature.pipelineId}`]),
    `- Observed phase: ${advice.phase}`,
    `- Observed next step: ${advice.nextStepId ?? "none"}`,
    `- Next Product responsibility: ${advice.productNextAction}`,
    "",
    "OBSERVED AGENT SESSIONS",
    ...(sessionLines.length === 0 ? ["- none"] : sessionLines),
    "",
    "VALID DOCUMENTS TO REVIEW",
    ...(documents.length === 0 ? ["- none"] : documents.map((file) => `- ${file}`)),
    "",
    "REQUIRED PROCEDURE",
    `1. Enter the verified root: cd ${shellQuote(state.project.root)}.`,
    `2. Run arka-norn agent use ${agent.id.value} --project ${state.project.id.value} --session main.`,
    `3. Confirm with arka-norn agent current --project ${state.project.id.value} --session main, then review arka-norn agent sessions --project ${state.project.id.value}.`,
    "4. Run arka-norn doctor and resolve every FAIL before continuing.",
    ...(feature === undefined ? ["5. List Features and ask which one to control if the choice is ambiguous."] : [
      `5. Run arka-norn pipeline status ${feature.id.value}, then arka-norn pipeline next ${feature.id.value}.`,
      `6. Run arka-norn agent advise --project ${state.project.id.value} --feature ${feature.id.value}.`,
    ]),
    "7. Stay in the Product role: organization, product decisions, prioritization and handoffs. Do not perform audit, development or QA for dedicated profiles.",
    "8. Summarize verified state, advise the next action and provide Agent prompts. Trust the CLI if it contradicts this prompt.",
  ].join("\n");
  return {
    schemaVersion: 1,
    projectId: state.project.id.value,
    ...(feature === undefined ? {} : { featureId: feature.id.value }),
    sessionId: "main",
    agentId: agent.id.value,
    prompt,
  };
}

export function parseOrchestratedRole(value: string): OrchestratedAgentRole {
  const normalized = value.trim().toLowerCase();
  if (normalized === "architect" || normalized === "architecture") return "architecte";
  if (normalized === "product" || normalized === "audit" || normalized === "dev" || normalized === "qa" || normalized === "architecte") return normalized;
  throw new Error(`Unsupported orchestrated role: ${value}. Use product, architecte, audit, dev or qa.`);
}

function resolveProductPrincipal(state: AgentOrchestrationState): AgentOrchestrationAdvice["productPrincipal"] & { readonly agentId?: string } {
  const main = state.sessions.find((binding) => binding.sessionId.equals(AgentSessionId.MAIN));
  if (main !== undefined) {
    if (main.agent.active && roleCategory(main.agent.role) === "product") {
      return { sessionId: "main", status: "ready", agentId: main.agent.id.value, reason: "The main Product Agent is active and bound to the main session." };
    }
    return { sessionId: "main", status: "conflict", agentId: main.agent.id.value, reason: `The main session points to ${main.agent.id.value} (${main.agent.role}) instead of an active Product Agent.` };
  }
  const products = state.agents.filter((agent) => agent.active && roleCategory(agent.role) === "product");
  if (products.length === 1) return { sessionId: "main", status: "unbound", agentId: products[0]!.id.value, reason: `Product Agent ${products[0]!.id.value} must be bound to the main session.` };
  if (products.length === 0) return { sessionId: "main", status: "missing", reason: "No active Product Agent is registered; the first Project Agent must take this role." };
  return { sessionId: "main", status: "conflict", reason: `${products.length} active Product Agents exist without a main binding; a human decision is required.` };
}

function productNextAction(state: AgentOrchestrationState, requiredRole: OrchestratedAgentRole | undefined, stepId: string | undefined): string {
  const product = resolveProductPrincipal(state);
  if (product.status === "missing") return `Register the main Product Agent with arka-norn agent register --project ${state.project.id.value} --provider <provider> --role product --session main.`;
  if (product.status === "unbound" && product.agentId !== undefined) return `Bind ${product.agentId} with arka-norn agent use ${product.agentId} --project ${state.project.id.value} --session main.`;
  if (product.status === "conflict") return product.reason;
  if (state.feature === undefined) return "Choose, create or import the priority Feature before starting a specialized profile.";
  if (state.report?.overallStatus === "completed") return "Verify handoffs, close the Feature and choose the next product priority.";
  if (requiredRole === "product") return `Execute ${stepId ?? "the next step"} in the main Product session, then recalculate advice.`;
  return `Keep Product control and start the ${requiredRole ?? "required"} profile for ${stepId ?? "the next step"}.`;
}

function recommendationsFor(requiredRole: OrchestratedAgentRole, stepId: string, feature: Feature): readonly AgentRoleRecommendation[] {
  if (requiredRole === "product") return [];
  const recommendations: AgentRoleRecommendation[] = [recommendation(requiredRole, "execute", stepId, feature)];
  if (["audit", "architecte"].includes(requiredRole)) recommendations.push(recommendation("dev", "prepare", stepId, feature));
  if (requiredRole === "dev") recommendations.push(recommendation("qa", "prepare", stepId, feature));
  return recommendations;
}

function recommendation(role: OrchestratedAgentRole, mode: AgentWorkMode, stepId: string, feature: Feature): AgentRoleRecommendation {
  const policy = policyFor(role, feature);
  const sessionId = deriveAgentSessionId(role, feature.id.value).value;
  const reason = mode === "execute"
    ? `${role} is responsible for step ${stepId}.`
    : `${role} may read context and prepare questions in parallel without producing documents or modifying code.`;
  return {
    role,
    mode,
    canWrite: mode === "execute",
    sessionId,
    skill: policy.skill,
    skillProfile: policy.profile,
    reason,
    command: `arka-norn agent prompt ${role} --project ${feature.projectId.value} --feature ${feature.id.value} --provider '<provider>' --mode ${mode}`,
  };
}

function policyFor(role: OrchestratedAgentRole, feature: Feature | undefined): RolePolicy {
  const pipelineId = feature === undefined ? undefined : canonicalPipelineId(feature.pipelineId);
  const guidedSkill = pipelineId === "arka-norn-fastdev"
    ? "arka-fastdev"
    : pipelineId === "arka-norn-essential" ? "arka-essential" : undefined;
  if (guidedSkill !== undefined && ["audit", "dev", "qa"].includes(role)) {
    return { role, skill: guidedSkill, profile: role };
  }
  return ROLE_POLICIES[role];
}

function renderInitializationPrompt(
  state: AgentOrchestrationState,
  provider: string | undefined,
  policy: RolePolicy,
  sessionId: AgentSessionId,
  mode: AgentWorkMode,
  expectedStepId: string | undefined,
  existingAgent: AgentRegistration | undefined,
  preflightCommand: string,
): string {
  const feature = state.feature;
  const featureOption = feature === undefined ? "" : ` --features ${feature.id.value}`;
  const featurePath = feature === undefined ? undefined : relativeFeaturePath(state.project.root, feature.root);
  const pathOption = featurePath === undefined ? "" : ` --paths ${shellQuote(featurePath)}`;
  const register = existingAgent === undefined
    ? `arka-norn agent register --project ${state.project.id.value} --provider ${shellQuote(provider!)} --role ${policy.role}${featureOption}${pathOption} --responsibilities ${shellQuote(responsibilities(policy.role))} --session ${sessionId.value}`
    : `arka-norn agent use ${existingAgent.id.value} --project ${state.project.id.value} --session ${sessionId.value}`;
  const permission = mode === "execute"
    ? `You may produce only ${expectedStepId}. Verify that pipeline next still returns this step before writing.`
    : "Read-only work: analysis, dependencies, questions and risks. Do not modify files or produce Pipeline documents or reports.";
  return [
    policy.role === "product"
      ? "Use $arka-norn, then $arka-product, to resume Product control."
      : `Use $arka-framework-mastery, then $${policy.skill}, to initialize this ${policy.role} Agent session. Do not use $arka-norn; it is reserved for the main Product Agent and new Projects.`,
    "",
    "PREREQUISITE RUN BY PRODUCT BEFORE OPENING THIS SESSION",
    `- ${preflightCommand}`,
    `- If $${policy.skill} is unavailable, stop and ask Product to repair the installation.`,
    "",
    "PROVIDED CONTEXT - verify it with arka-norn; never guess it",
    `- Project: ${state.project.id.value}`,
    `- Project root: ${state.project.root}`,
    ...(feature === undefined ? [] : [`- Feature: ${feature.id.value}`, `- Feature root: ${feature.root}`, `- Workflow: ${feature.pipelineId}`]),
    `- Role: ${policy.role}`,
    `- Isolated session: ${sessionId.value}`,
    `- Mode: ${mode}`,
    `- Expected step: ${expectedStepId ?? "no writing allowed"}`,
    "",
    "SESSION RULES",
    `- Use --session ${sessionId.value} on every Agent command; never select or replace the Product Agent in the main session.`,
    "- Reuse an identity only when provider, role and scope exactly match this session.",
    `- ${permission}`,
    "- If the CLI contradicts this prompt, stop and report the discrepancy to the main Product Agent.",
    "",
    "INITIALIZATION",
    `1. Enter the verified root: cd ${shellQuote(state.project.root)}.`,
    `2. Run arka-norn skills doctor --target ${shellQuote(state.project.root)} --profile ${policy.profile}.`,
    `3. Run arka-norn agent list --project ${state.project.id.value} --active and arka-norn agent sessions --project ${state.project.id.value}.`,
    `4. ${existingAgent === undefined ? "Create and select the bounded identity with" : `Reuse compatible identity ${existingAgent.id.value} with`}:`,
    `   ${register}`,
    `5. Confirm with arka-norn agent current --project ${state.project.id.value} --session ${sessionId.value}.`,
    ...(feature === undefined ? [] : [
      `6. Run arka-norn pipeline status ${feature.id.value}, then arka-norn pipeline next ${feature.id.value}.`,
      `7. Load $${policy.skill} and execute only the authorized mode above.`,
    ]),
    "8. Finish with a factual report for the main Product Agent: identity, session, scope, evidence, blockers and next decision.",
  ].join("\n");
}

function canReuseBinding(agent: AgentRegistration, role: OrchestratedAgentRole, project: Project, feature: Feature | undefined): boolean {
  if (!agent.active || roleCategory(agent.role) !== role || !agent.scope.projectId.equals(project.id)) return false;
  if (feature === undefined || agent.scope.featureIds.length === 0) return true;
  return agent.scope.featureIds.some((id) => id.equals(feature.id));
}

function resolveSessionAgent(
  state: AgentOrchestrationState,
  sessionId: AgentSessionId,
  role: OrchestratedAgentRole,
  feature: Feature | undefined,
  provider: string | undefined,
): AgentRegistration | undefined {
  const binding = state.sessions.find((candidate) => candidate.sessionId.equals(sessionId));
  if (binding !== undefined && !canReuseBinding(binding.agent, role, state.project, feature)) {
    throw new InvalidAgentOptionError("session", `session ${sessionId.value} is already bound to ${binding.agent.id.value} with an incompatible role, state or scope`);
  }
  if (binding !== undefined) return binding.agent;
  if (provider?.trim() === "") throw new InvalidAgentOptionError("provider", "provider cannot be empty");
  if (provider === undefined) throw new InvalidAgentOptionError("provider", `--provider is required to create the ${role} identity for session ${sessionId.value}`);
  return undefined;
}

function relativeFeaturePath(projectRoot: string, featureRoot: string): string | undefined {
  const project = normalizePath(projectRoot);
  const feature = normalizePath(featureRoot);
  if (feature === project) return ".";
  return feature.startsWith(`${project}/`) ? feature.slice(project.length + 1) : undefined;
}

function normalizePath(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized === "" ? "/" : normalized;
}

/** Stable routing used by the control plane before it prepares a bounded mission. */
export function roleForStep(stepId: string): OrchestratedAgentRole | undefined {
  return STEP_ROLES[canonicalDocumentType(stepId)];
}

/** Business actions carry the stable role signal across pipeline-specific step names. */
export function roleForAction(action: NextAction): OrchestratedAgentRole | undefined {
  if (action.kind === "run_audit") return "audit";
  if (action.kind === "continue_development" || action.kind === "return_to_development") return "dev";
  if (action.kind === "run_qa" || action.kind === "run_validation" || action.kind === "resolve_qa") return "qa";
  return roleForStep(action.stepId);
}

function roleCategory(role: string): OrchestratedAgentRole | undefined {
  const normalized = role.trim().toLowerCase();
  if (normalized === "product" || normalized === "product-owner" || normalized === "po") return "product";
  if (normalized.includes("architect")) return "architecte";
  if (normalized.includes("audit")) return "audit";
  if (normalized === "dev" || normalized.includes("developer")) return "dev";
  if (normalized === "qa" || normalized.includes("recette")) return "qa";
  return undefined;
}

function responsibilities(role: OrchestratedAgentRole): string {
  const values: Readonly<Record<OrchestratedAgentRole, string>> = {
    product: "Project organization;product decisions;prioritization;coordination and handoffs",
    architecte: "architecture;technical contracts;invariants;integration specification",
    audit: "current-state audit;reproducible evidence;findings without corrections",
    dev: "bounded implementation;tests;development report",
    qa: "independent review;functional evidence;verdict",
  };
  return values[role];
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}
