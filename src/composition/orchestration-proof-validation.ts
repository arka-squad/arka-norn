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

import { relative } from "node:path";

import type { Feature } from "../domain/feature/feature.js";
import { MissionPreconditionError } from "../domain/orchestration/errors.js";
import type { ExecutionRecord } from "../domain/orchestration/execution-record.js";
import { containsSecretLikeText } from "../domain/orchestration/mission-order.js";
import type { PipelineReport } from "../domain/pipeline/pipeline-report.js";
import type { Project } from "../domain/project/project.js";
import type { AgentInitializationPrompt, OrchestratedAgentRole } from "../ports/inbound/for-agent-orchestration.js";
import type { OrchestrationActionRequired } from "../ports/inbound/for-orchestration.js";
import type { AgentExecutionOutcome } from "../ports/outbound/agent-execution-port.js";

const READ_ONLY_ANALYSIS_VERDICTS = ["no_blocker", "findings_require_review", "scope_change_required", "inconclusive"] as const;
export type ReadOnlyAnalysisVerdict = typeof READ_ONLY_ANALYSIS_VERDICTS[number];

export interface PreparedPromptContext {
  readonly feature: Feature;
  readonly role: OrchestratedAgentRole;
}

export function validatePreparedPrompt(
  prompt: AgentInitializationPrompt,
  project: Project,
  context: PreparedPromptContext,
  record: ExecutionRecord,
): void {
  const requiresWrite = record.order.requiredPermissions.includes("write_workspace");
  if (prompt.projectId !== project.id.value
    || prompt.featureId !== context.feature.id.value
    || prompt.role !== context.role
    || prompt.mode !== "execute"
    || (requiresWrite && !prompt.canWrite)
    || prompt.expectedStepId !== record.order.preconditions.nextStepId) {
    throw new MissionPreconditionError("The generated Agent prompt no longer matches the immutable MissionOrder.");
  }
}

export function boundedMissionPrompt(record: ExecutionRecord, skill: string, role: OrchestratedAgentRole, authorAgentId: string): string {
  const expectedStepId = record.order.preconditions.nextStepId;
  const canWrite = record.order.requiredPermissions.includes("write_workspace");
  return [
    "BOUNDED ARKA NORN MISSION",
    `- Execution: ${record.id}`,
    `- Role: ${role}`,
    `- Immutable Pipeline step: ${expectedStepId}`,
    `- Skill reference: $${skill}`,
    `- Required author_agent_id: ${authorAgentId}`,
    "",
    canWrite
      ? "The provided workspace root is exactly the Feature root. Read and write only inside this root."
      : "The provided workspace root is exactly the Feature root. This mission is strictly read-only: do not modify files.",
    "Do not use a shell, subprocess, network, or parent Project root. Do not modify the Project marker, policy, execution registry, or Agent identity.",
    canWrite
      ? `Check the local documents, then produce only the valid artifact expected for ${expectedStepId}. Stop without writing if the situation no longer matches.`
      : `Analyze the local documents for ${expectedStepId}, then return a factual summary. Stop without writing if the situation no longer matches.`,
    canWrite
      ? "Do not claim success without a newly produced valid Pipeline document."
      : "This analysis does not advance the Pipeline without human validation and a verifiable deliverable.",
    "",
    ...(canWrite
      ? [
          "After producing a validatable artifact, end with exactly this line and no other value in the marker:",
          `ARKA_NORN_PROOF:${record.id}:${expectedStepId}`,
        ]
      : [
          "After the analysis, end with exactly these two lines and no other marker values:",
          "ARKA_NORN_ANALYSIS:<no_blocker|findings_require_review|scope_change_required|inconclusive>",
          `ARKA_NORN_PROOF:${record.id}:${expectedStepId}`,
        ]),
  ].join("\n");
}

export function matchesOrchestrationRole(value: string, expected: OrchestratedAgentRole): boolean {
  const role = value.trim().toLowerCase();
  if (expected === "product") return role === "product" || role === "product-owner" || role === "po";
  if (expected === "architecte") return role === "architecte" || role.includes("architect");
  if (expected === "audit") return role.includes("audit");
  if (expected === "dev") return role === "dev" || role.includes("developer");
  return role === "qa" || role.includes("recette");
}

export function isReadOnlyMission(record: ExecutionRecord): boolean {
  return !record.order.requiredPermissions.includes("write_workspace");
}

export function readOnlyAnalysisVerdict(output: string | undefined, record: ExecutionRecord): ReadOnlyAnalysisVerdict | undefined {
  if (!hasExecutionProofMarker(output, record.id, record.order.preconditions.nextStepId) || output === undefined) return undefined;
  const verdicts = output.split(/\r?\n/u)
    .map((line) => line.trim())
    .flatMap((line) => line.startsWith("ARKA_NORN_ANALYSIS:") ? [line.slice("ARKA_NORN_ANALYSIS:".length)] : []);
  if (verdicts.length !== 1) return undefined;
  return isReadOnlyAnalysisVerdict(verdicts[0]) ? verdicts[0] : undefined;
}

export function readOnlyAnalysisVerdictFromProofReferences(references: readonly string[]): ReadOnlyAnalysisVerdict | undefined {
  const values = references
    .flatMap((reference) => reference.startsWith("analysis:verdict:") ? [reference.slice("analysis:verdict:".length)] : []);
  if (values.length !== 1) return undefined;
  return isReadOnlyAnalysisVerdict(values[0]) ? values[0] : undefined;
}

export function hasExecutionProofMarker(output: string | undefined, executionId: string, expectedStepId: string): boolean {
  if (output === undefined || output.length > 64 * 1024) return false;
  const expected = `ARKA_NORN_PROOF:${executionId}:${expectedStepId}`;
  return output.split(/\r?\n/u).some((line) => line.trim() === expected);
}

export function newValidPipelineDocuments(
  before: PipelineReport,
  after: PipelineReport,
  featureRoot: string,
  expectedStepId: string,
  expectedAuthorAgentId: string,
): readonly string[] {
  const known = new Set(pipelineDocumentSnapshots(before).map((document) => document.fingerprint));
  const paths = pipelineDocumentSnapshots(after)
    .filter((document) => document.valid
      && document.source === "step"
      && document.stepId === expectedStepId
      && document.documentType === expectedStepId
      && document.authorAgentId === expectedAuthorAgentId
      && !known.has(document.fingerprint))
    .map((document) => relative(featureRoot, document.filePath).replaceAll("\\", "/"))
    .filter(isSafeFeatureRelativeProofPath);
  return Object.freeze([...new Set(paths)].sort((left, right) => left.localeCompare(right)).slice(0, 20));
}

export async function proofReferencesFor(input: {
  readonly before: PipelineReport;
  readonly featureRoot: string;
  readonly expectedAuthorAgentId: string | undefined;
  readonly record: ExecutionRecord;
  readonly outcome: AgentExecutionOutcome;
  readonly inspect: () => Promise<PipelineReport>;
}): Promise<readonly string[]> {
  try {
    const expectedStepId = input.record.order.preconditions.nextStepId;
    if (!hasExecutionProofMarker(input.outcome.output, input.record.id, expectedStepId)) return [];
    if (input.expectedAuthorAgentId === undefined) return [];
    const current = await input.inspect();
    const next = current.nextActions[0];
    if (next?.stepId === expectedStepId) return [];
    const newDocuments = newValidPipelineDocuments(
      input.before,
      current,
      input.featureRoot,
      expectedStepId,
      input.expectedAuthorAgentId,
    );
    if (newDocuments.length === 0) return [];
    const transition = current.overallStatus === "completed"
      ? "pipeline:completed"
      : next === undefined ? undefined : `pipeline:next-step:${next.stepId}`;
    if (transition === undefined) return [];
    return [transition, ...newDocuments.map((filePath) => `document:${filePath}`)];
  } catch {
    return [];
  }
}

export function isSafeProviderSessionId(value: string): boolean {
  return value.length > 0
    && value.length <= 256
    && !/[\u0000-\u001f\u007f]/u.test(value)
    && !containsSecretLikeText(value);
}

export function actionRequired(record: ExecutionRecord | undefined): OrchestrationActionRequired | undefined {
  if (record === undefined) return undefined;
  if (record.status === "succeeded" && readOnlyAnalysisVerdictFromProofReferences(record.proofReferences) !== undefined) {
    return {
      kind: "inspect",
      executionId: record.id,
      reason: "The read-only analysis is ready. Validate the official Pipeline document before preparing this step again.",
    };
  }
  if (record.status === "awaiting_approval") return { kind: "approve", executionId: record.id, reason: record.suspensionReason?.detail ?? "A provider permission requires explicit approval." };
  if (record.status === "failed" && record.suspensionReason?.code === "permission_not_preapproved") {
    return { kind: "inspect", executionId: record.id, reason: record.suspensionReason.detail };
  }
  if (record.status === "failed" || record.status === "cancelled" || record.status === "interrupted") return { kind: "retry", executionId: record.id, reason: record.suspensionReason?.detail ?? "The mission can be retried as a new provider run." };
  if (record.status === "rejected") return { kind: "inspect", executionId: record.id, reason: record.suspensionReason?.detail ?? "The mission was rejected before provider dispatch." };
  return undefined;
}

interface PipelineDocumentSnapshot {
  readonly fingerprint: string;
  readonly filePath: string;
  readonly valid: boolean;
  readonly source: "step" | "transversal";
  readonly stepId: string | undefined;
  readonly documentType: string | undefined;
  readonly authorAgentId: string | undefined;
}

function isReadOnlyAnalysisVerdict(value: string | undefined): value is ReadOnlyAnalysisVerdict {
  return value !== undefined && (READ_ONLY_ANALYSIS_VERDICTS as readonly string[]).includes(value);
}

function pipelineDocumentSnapshots(report: PipelineReport): readonly PipelineDocumentSnapshot[] {
  const result: PipelineDocumentSnapshot[] = [];
  for (const step of report.steps) {
    for (const document of step.documents) {
      result.push({
        fingerprint: ["step", step.id, document.filePath, document.id ?? "", document.type ?? "", document.authorAgentId ?? "", document.valid ? "valid" : "invalid", document.createdAt ?? ""].join("\u0001"),
        filePath: document.filePath,
        valid: document.valid,
        source: "step",
        stepId: step.id,
        documentType: document.type,
        authorAgentId: document.authorAgentId,
      });
    }
  }
  for (const transversal of report.transversalDocuments) {
    for (const document of transversal.documents) {
      result.push({
        fingerprint: ["transversal", transversal.type, document.filePath, document.id ?? "", document.type ?? "", document.authorAgentId ?? "", document.valid ? "valid" : "invalid", document.createdAt ?? ""].join("\u0001"),
        filePath: document.filePath,
        valid: document.valid,
        source: "transversal",
        stepId: undefined,
        documentType: document.type,
        authorAgentId: document.authorAgentId,
      });
    }
  }
  return result;
}

function isSafeFeatureRelativeProofPath(value: string): boolean {
  const normalized = value.replaceAll("\\", "/");
  return normalized.length > 0
    && normalized.length <= 480
    && !normalized.startsWith("/")
    && !normalized.startsWith("../")
    && normalized !== ".."
    && !normalized.split("/").includes("..")
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    && !containsSecretLikeText(normalized);
}
