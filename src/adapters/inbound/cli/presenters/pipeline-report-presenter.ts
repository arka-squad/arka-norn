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

import type { PipelineReport } from "../../../../domain/pipeline/pipeline-report.js";
import { translate } from "../../../../application/localization/locale.js";
import { cliEnvelope, type CliEnvelope } from "../cli-envelope.js";

export function pipelineExitCode(report: PipelineReport): 0 | 2 | 3 {
  if (report.overallStatus === "completed") return 0;
  if (report.overallStatus === "invalid") return 3;
  return 2;
}

export function presentPipelineReport(report: PipelineReport): string {
  const lines = [
    translate("pipeline.report.header", { pipeline: report.pipelineId }),
    translate("pipeline.report.feature", { feature: report.featureRoot }),
    translate("pipeline.report.status", { status: report.overallStatus }),
    "",
  ];
  for (const step of report.steps) {
    const count = step.documents.length;
    lines.push(
      `[${String(step.order).padStart(2, "0")}] ${step.id.padEnd(30)} ` +
      `presence=${step.presenceStatus} schema=${step.schemaStatus} business=${step.businessStatus} dependencies=${step.dependencyStatus} completion=${step.completionStatus}` +
      `${count > 0 ? ` documents=${count}` : ""}`,
    );
  }
  for (const transversal of report.transversalDocuments) {
    lines.push(`[--] ${transversal.type.padEnd(30)} transversal documents=${transversal.documents.length}`);
  }
  if (report.latestCrDevId !== undefined) lines.push("", translate("pipeline.report.latestReport", { id: report.latestCrDevId }));
  if (report.selectedQaId !== undefined) lines.push(translate("pipeline.report.selectedQa", { id: report.selectedQaId }));
  if (report.selectedAuditId !== undefined) lines.push(translate("pipeline.report.selectedAudit", { id: report.selectedAuditId }));
  if (report.selectedValidationId !== undefined) lines.push(translate("pipeline.report.selectedValidation", { id: report.selectedValidationId }));
  if (report.errors.length > 0) lines.push("", translate("pipeline.report.errors"), ...report.errors.map((error) => `- ${error}`));
  if (report.warnings.length > 0) lines.push("", translate("pipeline.report.warnings"), ...report.warnings.map((warning) => `- ${warning}`));
  if (report.nextActions.length > 0) {
    lines.push("", translate("pipeline.report.next"));
    lines.push(...report.nextActions.flatMap((action) => [
      `${action.phase ?? action.stepId} · ${action.kind} -> ${action.stepId} : ${action.reason}`,
      ...(action.instructions ?? []).map((instruction) => `- ${instruction}`),
      ...(action.suggestedCommand === undefined ? [] : [translate("pipeline.report.command", { command: action.suggestedCommand })]),
    ]));
  } else if (report.overallStatus === "completed") {
    lines.push("", translate("pipeline.report.complete"));
  }
  return `${lines.join("\n")}\n`;
}

export function pipelineReportEnvelope(report: PipelineReport, command = "pipeline.status"): CliEnvelope<PipelineReport> {
  return cliEnvelope({
    command,
    ok: pipelineExitCode(report) === 0,
    data: report,
    errors: report.errors,
    warnings: report.warnings,
    errorCode: "pipeline_error",
    warningCode: "pipeline_warning",
  });
}
