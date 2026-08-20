import type { ProjectFeatureMetrics } from "../../adapters/inbound/tui/views/project-detail-view.js";
import { mapConcurrent } from "../../application/shared/map-concurrent.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";
import type { ForPipeline } from "../../ports/inbound/for-pipeline.js";

export async function loadProjectMetrics(
  features: readonly Feature[],
  pipeline: ForPipeline,
): Promise<ReadonlyMap<string, ProjectFeatureMetrics>> {
  return new Map(await mapConcurrent(features, 4, async (feature) => {
    const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value, pipelineId: feature.pipelineId });
    return [feature.id.value, metricsFromReport(report, feature.pipelineId)] as const;
  }));
}

export function metricsFromReport(report: PipelineReport, pipelineId: string = report.pipelineId): ProjectFeatureMetrics {
  const debts = report.steps.find((step) => step.id === "registre_dettes");
  const qa = report.steps.find((step) => step.id === "recette_qa");
  return {
    status: report.overallStatus,
    debtDocuments: debts?.documents.length ?? 0,
    qaFailures: qa?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
    handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
    invalidDocuments: report.steps.reduce((count, step) => count + step.documents.filter((document) => !document.valid).length, 0),
    pipelineId,
    phase: report.nextActions[0]?.phase ?? (report.overallStatus === "completed" ? "Terminé" : "Diagnostic"),
    progress: `${report.steps.filter((step) => step.completionStatus === "completed").length}/${report.steps.filter((step) => step.required).length}`,
    iteration: Math.max(1, report.steps.find((step) => step.id === "cr_dev")?.documents.length ?? 0),
  };
}
