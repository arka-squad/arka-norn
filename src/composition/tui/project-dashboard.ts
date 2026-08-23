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

import type { ProjectFeatureMetrics } from "../../adapters/inbound/tui/views/project-detail-view.js";
import { translate } from "../../application/localization/locale.js";
import { mapConcurrent } from "../../application/shared/map-concurrent.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";
import type { ForPipeline, PipelineAuthorAuthorization } from "../../ports/inbound/for-pipeline.js";

export type AuthorRegistryForFeature = (feature: Feature) => Promise<readonly PipelineAuthorAuthorization[]> | readonly PipelineAuthorAuthorization[];

export async function loadProjectMetrics(
  features: readonly Feature[],
  pipeline: ForPipeline,
  authorRegistryForFeature: AuthorRegistryForFeature,
): Promise<ReadonlyMap<string, ProjectFeatureMetrics>> {
  return new Map(await mapConcurrent(features, 4, async (feature) => {
    const report = await pipeline.inspect({
      featureRoot: feature.root,
      featureId: feature.id.value,
      pipelineId: feature.pipelineId,
      documentContractVersion: feature.documentContractVersion,
      authorRegistry: await authorRegistryForFeature(feature),
    });
    return [feature.id.value, metricsFromReport(report, feature.pipelineId)] as const;
  }));
}

export function metricsFromReport(report: PipelineReport, pipelineId: string = report.pipelineId): ProjectFeatureMetrics {
  const debts = report.steps.find((step) => step.id === "debt_register");
  const qa = report.steps.find((step) => step.id === "qa_review");
  return {
    status: report.overallStatus,
    debtDocuments: debts?.documents.length ?? 0,
    qaFailures: qa?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
    handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
    invalidDocuments: report.steps.reduce((count, step) => count + step.documents.filter((document) => !document.valid).length, 0),
    pipelineId,
    phase: report.nextActions[0]?.phase ?? translate(report.overallStatus === "completed" ? "tui.project.phase.completed" : "tui.project.phase.diagnostic"),
    progress: `${report.steps.filter((step) => step.completionStatus === "completed").length}/${report.steps.filter((step) => step.required).length}`,
    iteration: Math.max(1, report.steps.find((step) => step.id === "development_report")?.documents.length ?? 0),
  };
}
