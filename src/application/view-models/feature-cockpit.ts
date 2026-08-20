import type { Feature } from "../../domain/feature/feature.js";
import type { NextAction, PipelineReport, StepState } from "../../domain/pipeline/pipeline-report.js";

export interface FeatureCockpitViewModel {
  readonly title: string;
  readonly root: string;
  readonly overallStatus: string;
  readonly progress: string;
  readonly nextAction: string;
  readonly nextReason: string;
  readonly timeline: readonly string[];
  readonly developmentRuns: number;
  readonly qaRuns: number;
  readonly qaFailures: number;
  readonly debtDocuments: number;
  readonly handoffSignals: number;
  readonly workflowBadge?: string;
  readonly phase: string;
  readonly iteration: number;
  readonly openFindings: number;
  readonly closedCorrections: number;
  readonly latestAuditedCommit?: string;
  readonly validationState: string;
  readonly instructions: readonly string[];
  readonly expectedArtifact?: string;
  readonly suggestedCommand?: string;
}

export function createFeatureCockpitViewModel(feature: Feature, report: PipelineReport): FeatureCockpitViewModel {
  const completed = report.steps.filter((step) => step.completionStatus === "completed").length;
  const required = report.steps.filter((step) => step.required).length;
  const crStep = report.steps.find((step) => step.id === "cr_dev");
  const qaStep = report.steps.find((step) => step.id === "recette_qa");
  const debtStep = report.steps.find((step) => step.id === "registre_dettes");
  const next = report.nextActions[0];
  const fastdev = feature.pipelineId === "arka-norn-fastdev";
  const fastdevDetails = createFastdevDetails(report, crStep, next, fastdev);
  return {
    title: feature.name,
    root: feature.root,
    overallStatus: report.overallStatus,
    progress: fastdev ? `${fastdevDetails.phase} · ${completed}/${required}` : `${completed}/${required} étapes obligatoires terminées`,
    nextAction: nextLabel(next),
    nextReason: nextReason(next),
    timeline: report.steps.map((step) => `${String(step.order).padStart(2, "0")} ${symbol(step.completionStatus)} ${step.id} · ${step.schemaStatus}/${step.businessStatus}`),
    developmentRuns: crStep?.documents.length ?? 0,
    qaRuns: qaStep?.documents.length ?? 0,
    qaFailures: qaStep?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
    debtDocuments: debtStep?.documents.length ?? 0,
    handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
    ...fastdevDetails,
  };
}

function createFastdevDetails(
  report: PipelineReport,
  crStep: StepState | undefined,
  next: NextAction | undefined,
  fastdev: boolean,
): Pick<FeatureCockpitViewModel, "phase" | "iteration" | "openFindings" | "closedCorrections" | "validationState" | "instructions"> &
Partial<Pick<FeatureCockpitViewModel, "workflowBadge" | "latestAuditedCommit" | "expectedArtifact" | "suggestedCommand">> {
  const auditStep = report.steps.find((step) => step.id === "audit_rework");
  const validationStep = report.steps.find((step) => step.id === "validation_fastdev");
  const closedCorrections = sumField(crStep, "correctionCount");
  const findings = sumField(auditStep, "openFindingCount");
  const phase = fastdev && next?.stepId === "cr_dev" && auditStep?.businessStatus === "failed"
    ? "Corrections"
    : next?.phase ?? (report.overallStatus === "completed" ? "Terminé" : "Diagnostic");
  const auditedCommit = selectedDocument(auditStep)?.exactCommit;
  return {
    ...(fastdev ? { workflowBadge: "FASTDEV" } : {}),
    phase,
    iteration: Math.max(1, crStep?.documents.length ?? 0),
    openFindings: Math.max(0, findings - closedCorrections),
    closedCorrections,
    ...(auditedCommit === undefined ? {} : { latestAuditedCommit: auditedCommit }),
    validationState: selectedDocument(validationStep)?.businessVerdict ?? "absente",
    instructions: next?.instructions ?? [],
    ...(next === undefined ? {} : { expectedArtifact: `${next.stepId}.json` }),
    ...(next?.suggestedCommand === undefined ? {} : { suggestedCommand: next.suggestedCommand }),
  };
}

function selectedDocument(step: StepState | undefined) {
  return step?.documents.find((document) => document.id === step.selectedDocumentId);
}

function sumField(step: StepState | undefined, field: "correctionCount" | "openFindingCount"): number {
  return step?.documents.reduce((count, document) => count + (document[field] ?? 0), 0) ?? 0;
}

function nextLabel(next: NextAction | undefined): string {
  return next === undefined ? "Aucune — pipeline terminé" : `${next.kind} → ${next.stepId}`;
}

function nextReason(next: NextAction | undefined): string {
  return next === undefined ? "toutes les étapes obligatoires et la dernière revue sont concluantes" : next.reason;
}

function symbol(status: string): string {
  if (status === "completed") return "✓";
  if (status === "failed" || status === "blocked") return "!";
  if (status === "in_progress") return "~";
  return "·";
}
