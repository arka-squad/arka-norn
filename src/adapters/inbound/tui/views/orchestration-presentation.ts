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

import type { ExecutionRecord } from "../../../../domain/orchestration/execution-record.js";
import type { ExecutionTarget } from "../../../../domain/orchestration/types.js";
import type { OrchestrationPreview, OrchestrationPreviewCandidate, OrchestrationStatus } from "../../../../ports/inbound/for-orchestration.js";
import { canonicalDocumentType } from "../../../../domain/compatibility/legacy-contract.js";
import { formatNumber, translate, type MessageKey } from "../../../../application/localization/locale.js";

export function displayTarget(target: ExecutionTarget): string {
  const provider = displayProvider(target.provider);
  return target.model === undefined ? provider : `${provider} · ${target.model}`;
}

export function displayProvider(provider: string): string {
  switch (provider) {
    case "claude": return "Claude Code CLI";
    case "codex": return "Codex CLI";
    case "kimi": return "Kimi Platform";
    case "zai": return "Z.AI Coding Plan";
    default: return translate("orchestration.provider.default");
  }
}

export function displayStep(stepId: string): string {
  const labels: Readonly<Record<string, MessageKey>> = {
    concept: "orchestration.step.featureBrief",
    feature_brief: "orchestration.step.featureBrief",
    rework_brief: "orchestration.step.reworkBrief",
    plan: "orchestration.step.plan",
    debt_register: "orchestration.step.debtRegister",
    agent_task: "orchestration.step.agentTask",
    technical_contract_appendix: "orchestration.step.technicalAppendix",
    frozen_invariants: "orchestration.step.frozenInvariants",
    technical_integration_specification: "orchestration.step.integrationSpecification",
    current_state_audit: "orchestration.step.currentStateAudit",
    delivery_audit: "orchestration.step.deliveryAudit",
    development_report: "orchestration.step.developmentReport",
    qa_review: "orchestration.step.qaReview",
    delivery_validation: "orchestration.step.deliveryValidation",
  };
  return translate(labels[canonicalDocumentType(stepId)] ?? "orchestration.step.default");
}

export function displayRole(role: string): string {
  const labels: Readonly<Record<string, MessageKey>> = {
    product: "orchestration.role.product",
    architecte: "orchestration.role.architect",
    architect: "orchestration.role.architect",
    audit: "orchestration.role.audit",
    dev: "orchestration.role.development",
    qa: "orchestration.role.qa",
  };
  return translate(labels[role] ?? "orchestration.role.default");
}

export function displayPermission(permission: string): string {
  const labels: Readonly<Record<string, MessageKey>> = {
    read_workspace: "orchestration.permission.read",
    write_workspace: "orchestration.permission.write",
    shell: "orchestration.permission.shell",
    network: "orchestration.permission.network",
  };
  return translate(labels[permission] ?? "orchestration.permission.default");
}

export function displayScopePath(path: string): string {
  if (path === ".") return translate("orchestration.scope.project");
  return translate("orchestration.scope.directory", { path });
}

export function displayCandidateReason(reason: string): string {
  const labels: Readonly<Record<string, MessageKey>> = {
    not_allowed: "orchestration.candidate.notAllowed",
    disabled: "orchestration.candidate.disabled",
    unhealthy: "orchestration.candidate.unhealthy",
    missing_capability: "orchestration.candidate.missingCapability",
    missing_permission: "orchestration.candidate.missingPermission",
    model_disabled: "orchestration.candidate.modelDisabled",
    model_unavailable: "orchestration.candidate.modelUnavailable",
    model_not_allowed: "orchestration.candidate.modelNotAllowed",
  };
  return translate(labels[reason] ?? "orchestration.candidate.default");
}

export interface AssistedMissionStatus {
  readonly title: string;
  readonly detail: string;
}

/** The next meaningful decision, expressed without exposing worker internals. */
export interface AssistedMissionAction {
  readonly title: string;
  readonly detail: string;
}

type ReadOnlyAnalysisVerdict = "no_blocker" | "findings_require_review" | "scope_change_required" | "inconclusive";

/** A closed proof reference, never provider text, marks a manual audit handoff. */
export function isReadOnlyAnalysisAwaitingValidation(execution: ExecutionRecord | undefined): boolean {
  return execution?.status === "succeeded" && readOnlyAnalysisVerdict(execution) !== undefined;
}

export function displayMissionStatus(execution: ExecutionRecord | undefined): AssistedMissionStatus {
  if (execution === undefined) {
    return {
      title: translate("orchestration.status.none.title"),
      detail: translate("orchestration.status.none.detail"),
    };
  }
  const verdict = readOnlyAnalysisVerdict(execution);
  if (verdict !== undefined) {
    return {
      title: translate("orchestration.status.analysis.title"),
      detail: displayReadOnlyAnalysisVerdict(verdict),
    };
  }
  switch (execution.status) {
    case "planned":
      return { title: translate("orchestration.status.planned.title"), detail: translate("orchestration.status.planned.detail") };
    case "running":
      return { title: translate("orchestration.status.running.title"), detail: translate("orchestration.status.running.detail") };
    case "awaiting_approval":
      return { title: translate("orchestration.status.approval.title"), detail: displaySuspension(execution.suspensionReason?.code) };
    case "succeeded":
      return { title: translate("orchestration.status.succeeded.title"), detail: translate("orchestration.status.succeeded.detail") };
    case "failed":
      return { title: translate("orchestration.status.failed.title"), detail: displaySuspension(execution.suspensionReason?.code) };
    case "cancelled":
      return { title: translate("orchestration.status.cancelled.title"), detail: translate("orchestration.status.cancelled.detail") };
    case "interrupted":
      return { title: translate("orchestration.status.interrupted.title"), detail: displaySuspension(execution.suspensionReason?.code) };
    case "rejected":
      return { title: translate("orchestration.status.rejected.title"), detail: displaySuspension(execution.suspensionReason?.code) };
  }
}

/**
 * Keep the operator in control: an action is either a concrete decision or a
 * clear statement that no decision is needed yet. The public status reason is
 * deliberately not rendered verbatim, since it can be an adapter diagnostic.
 */
export function displayMissionAction(
  execution: ExecutionRecord,
  actionRequired: { readonly kind: "approve" | "business_decision" | "scope_expansion" | "capability_expansion" | "apply_changes" | "retry" | "inspect"; readonly reason: string } | undefined,
): AssistedMissionAction {
  const verdict = readOnlyAnalysisVerdict(execution);
  if (verdict !== undefined) {
    return {
      title: translate("orchestration.action.audit.title"),
      detail: translate("orchestration.action.audit.detail"),
    };
  }
  const suspension = displaySuspension(execution.suspensionReason?.code);
  if (actionRequired?.kind === "approve" || actionRequired?.kind === "capability_expansion" || execution.status === "awaiting_approval") {
    return {
      title: translate("orchestration.action.approve.title"),
      detail: suspension,
    };
  }
  if (actionRequired?.kind === "retry") {
    return {
      title: translate("orchestration.action.retry.title"),
      detail: suspension,
    };
  }
  if (actionRequired?.kind === "inspect") {
    return {
      title: translate("orchestration.action.inspect.title"),
      detail: suspension,
    };
  }
  switch (execution.status) {
    case "planned":
    case "running":
      return {
        title: translate("orchestration.action.wait.title"),
        detail: translate("orchestration.action.wait.detail"),
      };
    case "succeeded":
      return {
        title: translate("orchestration.action.next.title"),
        detail: translate("orchestration.action.next.detail"),
      };
    case "cancelled":
      return {
        title: translate("orchestration.action.new.title"),
        detail: translate("orchestration.action.new.detail"),
      };
    case "failed":
    case "interrupted":
      return {
        title: translate("orchestration.action.retryReview.title"),
        detail: suspension,
      };
    case "rejected":
      return {
        title: translate("orchestration.action.blocked.title"),
        detail: suspension,
      };
  }
}

/**
 * Recent progress only. Event payloads are adapter diagnostics, so the TUI
 * maps their stable type to a readable statement rather than rendering them.
 */
export function displayMissionEvents(execution: ExecutionRecord, limit = 3): readonly string[] {
  const boundedLimit = Math.max(1, Math.min(limit, 5));
  const recent = execution.events.slice(-boundedLimit).map((event) => displayMissionEvent(event.type));
  const hiddenCount = Math.max(0, execution.events.length - recent.length) + execution.truncatedEventCount;
  if (hiddenCount === 0) return recent;
  return [
    ...recent,
    translate(hiddenCount === 1 ? "orchestration.events.hidden.one" : "orchestration.events.hidden.other", { count: hiddenCount }),
  ];
}

function displayMissionEvent(type: string): string {
  const labels: Readonly<Record<string, MessageKey>> = {
    target_selected: "orchestration.event.targetSelected",
    planned: "orchestration.event.planned",
    started: "orchestration.event.started",
    approval_requested: "orchestration.event.approvalRequested",
    approved: "orchestration.event.approved",
    provider_session_recorded: "orchestration.event.sessionRecorded",
    succeeded: "orchestration.event.succeeded",
    failed: "orchestration.event.failed",
    cancelled: "orchestration.event.cancelled",
    interrupted: "orchestration.event.interrupted",
    rejected: "orchestration.event.rejected",
    retry_planned: "orchestration.event.retryPlanned",
    next_preview_required: "orchestration.event.nextPreview",
    read_only_analysis_ready: "orchestration.event.analysisReady",
    manual_pipeline_validation_required: "orchestration.event.manualValidation",
  };
  return translate(labels[type] ?? "orchestration.event.default");
}

function readOnlyAnalysisVerdict(execution: ExecutionRecord): ReadOnlyAnalysisVerdict | undefined {
  const values = execution.proofReferences
    .flatMap((reference) => reference.startsWith("analysis:verdict:") ? [reference.slice("analysis:verdict:".length)] : []);
  if (values.length !== 1) return undefined;
  return isReadOnlyAnalysisVerdict(values[0]) ? values[0] : undefined;
}

function isReadOnlyAnalysisVerdict(value: string | undefined): value is ReadOnlyAnalysisVerdict {
  return value === "no_blocker"
    || value === "findings_require_review"
    || value === "scope_change_required"
    || value === "inconclusive";
}

function displayReadOnlyAnalysisVerdict(verdict: ReadOnlyAnalysisVerdict): string {
  switch (verdict) {
    case "no_blocker": return translate("orchestration.verdict.noBlocker");
    case "findings_require_review": return translate("orchestration.verdict.review");
    case "scope_change_required": return translate("orchestration.verdict.scope");
    case "inconclusive": return translate("orchestration.verdict.inconclusive");
  }
}

function displaySuspension(code: string | undefined): string {
  const labels: Readonly<Record<string, MessageKey>> = {
    permission_not_preapproved: "orchestration.suspension.permissionNotPreapproved",
    permission_requested: "orchestration.suspension.permissionRequested",
    automatic_disabled: "orchestration.suspension.automaticDisabled",
    scope_changed: "orchestration.suspension.scopeChanged",
    precondition_changed: "orchestration.suspension.preconditionChanged",
    missing_proof: "orchestration.suspension.missingProof",
    provider_error: "orchestration.suspension.providerError",
    worker_unavailable: "orchestration.suspension.workerUnavailable",
    cancelled_by_user: "orchestration.suspension.cancelledByUser",
    interrupted: "orchestration.suspension.interrupted",
    policy_rejected: "orchestration.suspension.policyRejected",
  };
  return translate(code === undefined ? "orchestration.suspension.default" : labels[code] ?? "orchestration.suspension.default");
}

export function translatePreparationError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("read-only analysis awaits manual pipeline validation")) {
    return translate("orchestration.error.analysisAwaitingValidation");
  }
  if (message.includes("precondition") || message.includes("fingerprint") || message.includes("changed")) {
    return translate("orchestration.error.changed");
  }
  if (message.includes("feature")) {
    return translate("orchestration.error.feature");
  }
  if (message.includes("provider") || message.includes("assistant") || message.includes("target")) {
    return translate("orchestration.error.provider");
  }
  if (message.includes("active") || message.includes("execution")) {
    return translate("orchestration.error.active");
  }
  return translate("orchestration.error.default");
}

export function renderMissionSummary(
  execution: ExecutionRecord,
  actionRequired: OrchestrationStatus["actionRequired"],
  isActive: boolean,
): readonly string[] {
  const action = displayMissionAction(execution, actionRequired);
  return [
    translate("tui.orchestration.mission.id", { label: translate(isActive ? "tui.orchestration.mission.active" : "tui.orchestration.mission.latest"), id: execution.id }),
    translate("tui.orchestration.mission.step", { step: displayStep(execution.order.preconditions.nextStepId) }),
    translate("tui.orchestration.mission.assistant", { assistant: displayTarget(execution.target) }),
    translate("tui.orchestration.mission.events"),
    ...displayMissionEvents(execution).map((event) => `  * ${event}`),
    translate("tui.orchestration.mission.expectedAction", { action: action.title }),
    translate("tui.orchestration.mission.reason", { reason: action.detail }),
  ];
}

export function renderPreviewSummary(preview: OrchestrationPreview, selectedCandidateIndex: number | undefined): readonly string[] {
  const selected = selectedCandidateIndex === undefined ? undefined : preview.candidates[selectedCandidateIndex];
  const compatible = selectableCandidates(preview);
  const unavailable = preview.candidates.filter((candidate) => !candidate.eligible);
  return [
    translate("tui.orchestration.preview.done"),
    `Feature : ${preview.featureName}`,
    translate("tui.orchestration.preview.work", { summary: preview.summary }),
    translate("tui.orchestration.mission.step", { step: displayStep(preview.stepId) }),
    translate("tui.orchestration.preview.role", { role: displayRole(preview.role) }),
    translate("tui.orchestration.preview.scope", { scope: preview.scopePaths.map(displayScopePath).join(" - ") }),
    translate("tui.orchestration.preview.permissions", { permissions: preview.requiredPermissions.map(displayPermission).join(" - ") }),
    translate("tui.orchestration.preview.target", { target: selected?.eligible === true && selected.target.model !== undefined ? displayTarget(selected.target) : translate("tui.orchestration.preview.target.none") }),
    ...(compatible.length > 1 ? [translate("tui.orchestration.preview.other", { count: formatNumber(compatible.length - 1) })] : []),
    ...(unavailable.length === 0 ? [] : [translate("tui.orchestration.preview.unavailable", { choices: unavailable.map((candidate) => `${displayTarget(candidate.target)} (${candidate.reasons.map(displayCandidateReason).join(", ")})`).join(" - ") })]),
    translate("tui.orchestration.preview.recheck"),
  ];
}

export function selectableCandidates(preview: OrchestrationPreview): readonly { readonly candidate: OrchestrationPreviewCandidate; readonly index: number }[] {
  return preview.candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate }) => candidate.eligible && candidate.target.model !== undefined)
    .sort((left, right) => Number(right.candidate.recommended) - Number(left.candidate.recommended));
}
