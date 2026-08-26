/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */

import type { FramingPlan, FramingSection } from "../../domain/framing/framing-plan.js";
import { framingPlanFingerprint } from "../../domain/framing/framing-plan.js";
import { translate, type Locale, type MessageKey } from "../localization/locale.js";
import type { FramingDetailView, FramingSummaryView } from "./contracts.js";

export function framingSummary(plan: FramingPlan): FramingSummaryView {
  const locale = plan.contentLocale;
  const effect = plan.knowledge["intent.desired_effects"].find((item) => item.status === "active")?.statement;
  return {
    planId: plan.id, framingId: plan.target.framingId, targetKind: plan.target.kind,
    targetTitle: plan.target.kind === "project" ? translate("framing.target.project", {}, locale) : plan.target.workingTitle,
    revision: plan.revision, repositoryNature: plan.repositoryProbe.nature,
    attention: plan.derivedState.nextAction.attention, published: plan.publication !== null,
    summary: effect ?? translate("framing.plan.expectedOutcomeMissing", {}, locale),
    nextMove: framingActionText(plan), recommendedPipelineId: plan.derivedState.recommendedPipelineId, updatedAt: plan.updatedAt,
  };
}

export function framingDetail(plan: FramingPlan, history: FramingDetailView["history"]): FramingDetailView {
  const locale = plan.contentLocale;
  const sections = (Object.keys(plan.knowledge) as FramingSection[]).map((section) => ({
    id: section, title: translate(`framing.section.${section}` as MessageKey, {}, locale), items: plan.knowledge[section].map((item) => ({
      id: item.id, text: item.statement, source: provenanceLabel(item.provenance.kind, locale), active: item.status === "active",
    })),
  })).filter((section) => section.items.length > 0);
  return {
    ...framingSummary(plan), resumeContext: framingResumeContext(plan), sections,
    evidence: {
      snapshot: plan.repositoryProbe.snapshot.workspaceFingerprint, gitCommit: plan.repositoryProbe.snapshot.gitCommit,
      inventory: plan.repositoryProbe.inventory,
      claims: plan.knowledge["evidence.claims"].filter((item) => item.status === "active").map((item) => ({ id: item.id, text: item.statement, reference: evidenceReference(item.provenance) })),
      limitations: plan.repositoryProbe.reasons.filter((reason) => !reason.code.startsWith("repository_")).map((reason) => reason.evidenceRef),
    },
    decomposition: framingDecomposition(plan), history,
    stabilizations: [plan.stabilizations.intent, plan.stabilizations.groundedPlan].flatMap((item, index) => item === null ? [] : [{
      label: translate(index === 0 ? "framing.stabilization.intent" : "framing.stabilization.grounded", {}, locale),
      confirmedAt: item.confirmedAt, actorId: item.actorId, fingerprint: item.fingerprint,
    }]),
  };
}

export function revisionMilestone(plan: FramingPlan): string {
  const key = plan.publication !== null ? "framing.milestone.published" : plan.stabilizations.groundedPlan !== null
    ? "framing.milestone.grounded" : plan.stabilizations.intent !== null ? "framing.milestone.intent"
      : plan.revision === 1 ? "framing.milestone.opened" : "framing.milestone.enriched";
  return translate(key, {}, plan.contentLocale);
}

function framingResumeContext(plan: FramingPlan): string {
  const locale = plan.contentLocale;
  return [translate("framing.resume.title", {}, locale), `Plan: ${plan.id}`,
    translate("framing.resume.revision", { revision: plan.revision, fingerprint: framingPlanFingerprint(plan) }, locale),
    translate("framing.resume.target", { target: plan.target.kind === "project" ? plan.target.projectId : plan.target.workingTitle }, locale), "",
    translate("framing.resume.understanding", {}, locale), localizedSummary(plan), "",
    translate("framing.resume.next", { next: framingActionText(plan) }, locale), translate("framing.resume.rule", {}, locale),
  ].join("\n");
}

function framingDecomposition(plan: FramingPlan): FramingDetailView["decomposition"] {
  if (plan.decomposition === null) return null;
  return plan.decomposition.kind === "project_features"
    ? { kind: "features", entries: plan.decomposition.features.map((item) => ({ id: item.candidateId, title: item.title, outcome: item.observableOutcome, dependsOn: item.dependsOn })) }
    : { kind: "lots", entries: plan.decomposition.lots.map((item) => ({ id: item.id, title: item.title, outcome: item.observableEffect, dependsOn: item.dependsOn })) };
}

function framingActionText(plan: FramingPlan): string {
  return translate(`framing.action.${plan.derivedState.nextAction.kind}` as MessageKey, {}, plan.contentLocale);
}

function provenanceLabel(kind: FramingPlan["knowledge"][FramingSection][number]["provenance"]["kind"], locale: Locale): string {
  return translate(`framing.provenance.${kind}` as MessageKey, {}, locale);
}

function evidenceReference(provenance: FramingPlan["knowledge"][FramingSection][number]["provenance"]): string {
  return provenance.path !== undefined && provenance.lineStart !== undefined ? `${provenance.path}:${provenance.lineStart}` : provenance.reference;
}

function localizedSummary(plan: FramingPlan): string {
  const locale = plan.contentLocale;
  const active = Object.values(plan.knowledge).flat().filter((item) => item.status === "active");
  return translate("framing.summary.full", {
    title: plan.target.kind === "project" ? `Project ${plan.target.projectId}` : plan.target.workingTitle,
    effect: plan.knowledge["intent.desired_effects"].find((item) => item.status === "active")?.statement ?? translate("framing.summary.effectMissing", {}, locale),
    last: active.sort((left, right) => right.introducedInRevision - left.introducedInRevision)[0]?.statement ?? translate("framing.summary.lastMissing", {}, locale),
    next: framingActionText(plan),
  }, locale);
}
