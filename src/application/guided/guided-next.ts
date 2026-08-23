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

import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";

export interface GuidedNextConfig {
  readonly commandName: string;
  readonly deliveryStepId: string;
  readonly completionReason: string;
}

export interface GuidedNextData {
  readonly featureId: string;
  readonly pipelineId: string;
  readonly phase: string;
  readonly iteration: number;
  readonly action: string | null;
  readonly prerequisites: readonly string[];
  readonly reason: string;
  readonly instructions: readonly string[];
  readonly expectedArtifact: string | null;
  readonly suggestedCommand: string | null;
}

export function guidedNext(report: PipelineReport, featureId: string, sessionId: string, config: GuidedNextConfig): GuidedNextData {
  const action = report.nextActions[0];
  const deliveryRuns = report.steps.find((step) => step.id === config.deliveryStepId)?.documents.length ?? 0;
  if (action === undefined) {
    return {
      featureId,
      pipelineId: report.pipelineId,
      phase: "completed",
      iteration: Math.max(1, deliveryRuns),
      action: null,
      prerequisites: report.steps.map((step) => step.id),
      reason: config.completionReason,
      instructions: [],
      expectedArtifact: null,
      suggestedCommand: null,
    };
  }
  const target = report.steps.find((step) => step.id === action.stepId);
  return {
    featureId,
    pipelineId: report.pipelineId,
    phase: action.phase ?? action.stepId,
    iteration: action.stepId === config.deliveryStepId ? deliveryRuns + 1 : Math.max(1, deliveryRuns),
    action: action.kind,
    prerequisites: report.steps.filter((step) => step.order < (target?.order ?? 0) && step.completionStatus === "completed").map((step) => step.id),
    reason: action.reason,
    instructions: action.instructions ?? [],
    expectedArtifact: `${action.stepId}.json`,
    suggestedCommand: withSession(action.suggestedCommand ?? `arka-norn pipeline scaffold ${action.stepId} --feature ${featureId}`, sessionId),
  };
}

function withSession(command: string, sessionId: string): string {
  return command.includes(" --session ") ? command : `${command} --session ${sessionId}`;
}
