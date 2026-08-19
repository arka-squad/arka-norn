import type { Feature } from "../../domain/feature/feature.js";
import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";

export interface FeatureCockpitViewModel {
  readonly title: string;
  readonly root: string;
  readonly overallStatus: string;
  readonly progress: string;
  readonly nextAction: string;
  readonly timeline: readonly string[];
  readonly developmentRuns: number;
  readonly qaRuns: number;
  readonly qaFailures: number;
  readonly debtDocuments: number;
  readonly handoffSignals: number;
}

export function createFeatureCockpitViewModel(feature: Feature, report: PipelineReport): FeatureCockpitViewModel {
  const completed = report.steps.filter((step) => step.completionStatus === "completed").length;
  const required = report.steps.filter((step) => step.required).length;
  const crStep = report.steps.find((step) => step.id === "cr_dev");
  const qaStep = report.steps.find((step) => step.id === "recette_qa");
  const debtStep = report.steps.find((step) => step.id === "registre_dettes");
  const next = report.nextActions[0];
  return {
    title: feature.name,
    root: feature.root,
    overallStatus: report.overallStatus,
    progress: `${completed}/${required} étapes obligatoires terminées`,
    nextAction: next === undefined ? "Aucune — pipeline terminé" : `${next.kind} → ${next.stepId}`,
    timeline: report.steps.map((step) => `${String(step.order).padStart(2, "0")} ${symbol(step.completionStatus)} ${step.id} · ${step.schemaStatus}/${step.businessStatus}`),
    developmentRuns: crStep?.documents.length ?? 0,
    qaRuns: qaStep?.documents.length ?? 0,
    qaFailures: qaStep?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
    debtDocuments: debtStep?.documents.length ?? 0,
    handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
  };
}

function symbol(status: string): string {
  if (status === "completed") return "✓";
  if (status === "failed" || status === "blocked") return "!";
  if (status === "in_progress") return "~";
  return "·";
}
