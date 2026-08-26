/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { relative } from "node:path";

import { readJson } from "../../adapters/outbound/filesystem/_shared/atomic-json.js";
import type { Feature } from "../../domain/feature/feature.js";
import type { PipelineReport } from "../../domain/pipeline/pipeline-report.js";
import type {
  FeatureSummary,
  FeatureTrackingView,
  HumanDocumentView,
  TrackingAnomaly,
  TrackingHealth,
} from "./contracts.js";
import { createHumanDocumentView, humanize } from "./human-document.js";

export async function createFeatureTrackingView(feature: Feature, report: PipelineReport): Promise<FeatureTrackingView> {
  const summaries = report.steps.flatMap((step) => step.documents.map((document) => ({ stepId: step.id, document })))
    .concat(report.transversalDocuments.flatMap((group) => group.documents.map((document) => ({ stepId: group.type, document }))));
  const known = new Map(summaries.flatMap(({ stepId, document }) => document.id === undefined
    ? []
    : [[document.id, { title: humanize(document.type ?? stepId) }] as const]));
  const selected = new Set(Object.values(report.selectedDocuments));
  const documents: HumanDocumentView[] = [];
  for (const item of summaries) {
    assertDocumentInsideFeature(feature.root, item.document.filePath);
    const raw = await readJson<unknown>(item.document.filePath);
    if (!isRecord(raw)) continue;
    documents.push(createHumanDocumentView({ summary: item.document, stepId: item.stepId, raw, knownDocuments: known, selectedDocumentIds: selected }));
  }
  const anomalies = anomaliesFrom(report, documents);
  const summary = summaryFrom(feature, report, documents);
  return {
    ...summary,
    root: feature.root,
    projectId: feature.projectId.value,
    documentContractVersion: feature.documentContractVersion,
    pipelineDefinitionVersion: feature.pipelineDefinitionVersion,
    steps: report.steps.map((step) => ({
      id: step.id,
      order: step.order,
      required: step.required,
      status: step.completionStatus,
      businessStatus: step.businessStatus,
      documentIds: step.documents.flatMap((document) => document.id === undefined ? [] : [document.id]),
    })),
    documents,
    anomalies,
  };
}

export function summaryFrom(feature: Feature, report: PipelineReport, documents?: readonly HumanDocumentView[]): FeatureSummary {
  const required = report.steps.filter((step) => step.required);
  const invalidDocumentCount = documents?.filter((document) => !document.valid).length
    ?? report.steps.reduce((count, step) => count + step.documents.filter((document) => !document.valid).length, 0);
  return {
    id: feature.id.value,
    name: feature.name,
    pipelineId: feature.pipelineId,
    pipelineDefinitionVersion: feature.pipelineDefinitionVersion,
    status: report.overallStatus,
    health: featureHealth(report.overallStatus, invalidDocumentCount),
    progress: { completed: required.filter((step) => step.completionStatus === "completed").length, required: required.length },
    ...(report.nextActions[0] === undefined ? {} : { nextStepId: report.nextActions[0].stepId }),
    updatedAt: feature.updatedAt.toISOString(),
    documentCount: documents?.length ?? report.steps.reduce((count, step) => count + step.documents.length, 0),
    invalidDocumentCount,
  };
}

function anomaliesFrom(report: PipelineReport, documents: readonly HumanDocumentView[]): TrackingAnomaly[] {
  return [
    ...documents.filter((document) => !document.valid).map((document): TrackingAnomaly => ({
      code: "invalid_document", message: document.errors.join("; ") || "Document contract is invalid.", documentId: document.id,
    })),
    ...documents.flatMap((document) => document.dependencies.filter((dependency) => !dependency.resolved).map((dependency): TrackingAnomaly => ({
      code: "broken_dependency", message: `Missing dependency ${dependency.id}.`, documentId: document.id,
    }))),
    ...report.unknownFiles.map((file): TrackingAnomaly => ({ code: "unknown_file", message: `Unknown Pipeline file: ${file}` })),
    ...report.errors.map((message): TrackingAnomaly => ({ code: "pipeline_error", message })),
  ];
}

function featureHealth(status: string, invalidDocuments: number): TrackingHealth {
  if (invalidDocuments > 0 || status === "invalid") return "invalid";
  if (status === "failed") return "blocked";
  if (status === "incomplete") return "attention";
  return "healthy";
}

function assertDocumentInsideFeature(featureRoot: string, filePath: string): void {
  const candidate = relative(featureRoot, filePath);
  if (candidate.startsWith("..") || candidate === "" || candidate.startsWith("/")) {
    throw new Error("Pipeline document is outside its Feature root.");
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
