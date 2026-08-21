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

export interface CliEnvelope<T> {
  readonly schemaVersion: 1;
  readonly ok: boolean;
  readonly data: T;
  readonly errors: readonly string[];
  readonly warnings: readonly string[];
}

export function pipelineExitCode(report: PipelineReport): 0 | 2 | 3 {
  if (report.overallStatus === "completed") return 0;
  if (report.overallStatus === "invalid") return 3;
  return 2;
}

export function presentPipelineReport(report: PipelineReport): string {
  const lines = [`=== Pipeline ${report.pipelineId} ===`, `Feature : ${report.featureRoot}`, `État   : ${report.overallStatus}`, ""];
  for (const step of report.steps) {
    const count = step.documents.length;
    lines.push(
      `[${String(step.order).padStart(2, "0")}] ${step.id.padEnd(30)} ` +
      `presence=${step.presenceStatus} schema=${step.schemaStatus} métier=${step.businessStatus} dépendances=${step.dependencyStatus} final=${step.completionStatus}` +
      `${count > 0 ? ` documents=${count}` : ""}`,
    );
  }
  for (const transversal of report.transversalDocuments) {
    lines.push(`[--] ${transversal.type.padEnd(30)} transversal documents=${transversal.documents.length}`);
  }
  if (report.latestCrDevId !== undefined) lines.push("", `Dernier CR Dev : ${report.latestCrDevId}`);
  if (report.selectedQaId !== undefined) lines.push(`Recette retenue : ${report.selectedQaId}`);
  if (report.selectedAuditId !== undefined) lines.push(`Audit retenu : ${report.selectedAuditId}`);
  if (report.selectedValidationId !== undefined) lines.push(`Validation retenue : ${report.selectedValidationId}`);
  if (report.errors.length > 0) lines.push("", "Erreurs :", ...report.errors.map((error) => `- ${error}`));
  if (report.warnings.length > 0) lines.push("", "Avertissements :", ...report.warnings.map((warning) => `- ${warning}`));
  if (report.nextActions.length > 0) {
    lines.push("", "=== Prochaine action ===");
    lines.push(...report.nextActions.flatMap((action) => [
      `${action.phase ?? action.stepId} · ${action.kind} -> ${action.stepId} : ${action.reason}`,
      ...(action.instructions ?? []).map((instruction) => `- ${instruction}`),
      ...(action.suggestedCommand === undefined ? [] : [`Commande : ${action.suggestedCommand}`]),
    ]));
  } else if (report.overallStatus === "completed") {
    lines.push("", "Pipeline complet.");
  }
  return `${lines.join("\n")}\n`;
}

export function pipelineReportEnvelope(report: PipelineReport): CliEnvelope<PipelineReport> {
  return {
    schemaVersion: 1,
    ok: pipelineExitCode(report) === 0,
    data: report,
    errors: report.errors,
    warnings: report.warnings,
  };
}
