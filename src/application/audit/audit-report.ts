/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import { createHash } from "node:crypto";

import { auditModuleDefinition } from "../../domain/audit/module-catalog.js";
import type { AuditCanonical, AuditFinding, AuditKbRecord, AuditModuleResult, AuditRun } from "../../domain/audit/audit-types.js";

export interface AuditComparison {
  readonly baseline: string;
  readonly current: string;
  readonly new: readonly string[];
  readonly persisting: readonly string[];
  readonly resolved: readonly string[];
  readonly regressed: readonly string[];
  readonly coverageChanged: boolean;
}

export function buildCanonicalAudit(run: AuditRun, results: readonly AuditModuleResult[], now: Date): AuditCanonical {
  const complete = results.filter((result) => result.execution.status === "complete").length;
  const skipped = results.filter((result) => result.execution.status === "skipped").length;
  const partial = results.length - complete - skipped;
  return {
    schemaVersion: 1,
    auditId: run.id,
    projectId: run.projectId,
    commitExact: run.inspection.commitExact,
    mode: run.request.mode,
    status: complete === results.length ? "completed" : "partial",
    generatedAt: now.toISOString(),
    coverage: { complete, partial, skipped, total: results.length },
    moduleResults: results,
    findings: deduplicate(results.flatMap((result) => result.findings), (finding) => finding.fingerprint),
    strengths: unique(results.flatMap((result) => result.strengths)),
    limitations: unique(results.flatMap((result) => result.limitations)),
    recommendations: unique(results.flatMap((result) => result.recommendations)),
    decisionsRequired: unique(results.flatMap((result) => result.decisionsRequired)),
  };
}

export function renderAuditReport(run: AuditRun, audit: AuditCanonical, comparison?: AuditComparison): string {
  const moduleSections = audit.moduleResults.map((result) => {
    const findings = result.findings.length === 0 ? "Aucun constat structuré." : table(result.findings.map((finding) => [finding.severity, finding.title, finding.origin, finding.confidence]), ["Priorité", "Constat", "Origine", "Confiance"]);
    return `## ${result.moduleId} — ${auditModuleDefinition(result.moduleId).title}\n\n${result.summary}\n\n- Exécution : ${result.execution.status}\n- Évaluation : ${result.assessment?.status ?? "non évaluée"}\n- Couverture : ${result.coverage.completed.length}/${result.coverage.requested.length}\n\n### Constats\n\n${findings}\n\n### Limites\n\n${list(result.limitations, "Aucune limite déclarée.")}`;
  }).join("\n\n");
  const comparisonSection = comparison === undefined ? "" : `\n\n## Évolution depuis ${comparison.baseline}\n\n- Nouveaux : ${comparison.new.length}\n- Persistants : ${comparison.persisting.length}\n- Résolus : ${comparison.resolved.length}\n- Régressions : ${comparison.regressed.length}\n- Couverture modifiée : ${comparison.coverageChanged ? "oui" : "non"}`;
  const repositoryMap = run.inspection.signals.map((signal) => `- ${signal.detected ? "présent" : "non détecté"} — ${signal.id}${signal.evidence.length === 0 ? "" : ` : ${signal.evidence.slice(0, 5).map((item) => `\`${item}\``).join(", ")}`}`).join("\n");
  const recommendations = recommendationSections(audit.recommendations);
  return `# Découverte / audit — ${run.projectName}\n\n## Demande utilisateur\n\n${run.request.objective}\n\n## Résumé exécutif\n\n- Audit : \`${audit.auditId}\`\n- Mode : ${audit.mode}\n- État : ${audit.status}\n- Commit : \`${audit.commitExact ?? "non disponible"}\`\n- Workspace propre : ${run.inspection.workspaceClean === true ? "oui" : run.inspection.workspaceClean === false ? "non" : "inconnu"}\n- Couverture : ${audit.coverage.complete} complet(s), ${audit.coverage.partial} partiel(s), ${audit.coverage.skipped} non exécuté(s)\n- Constats : ${audit.findings.length}\n\n## Périmètre et provenance\n\n- Project : \`${run.projectId}\`\n- Feature : ${run.featureId === null ? "aucune" : `\`${run.featureId}\``}\n- Chemins : ${run.request.paths.map((path) => `\`${path}\``).join(", ")}\n- Généré : ${audit.generatedAt}\n\n## Couverture réelle\n\n${table(audit.moduleResults.map((result) => [result.moduleId, result.execution.status, `${result.coverage.completed.length}/${result.coverage.requested.length}`, result.assessment?.status ?? "non évaluée"]), ["Domaine", "Exécution", "Couverture", "Évaluation"])}\n\n## Carte du dépôt et du produit\n\n${repositoryMap || "Aucun signal détecté."}\n\n${repositoryMermaid(run)}\n\nCette carte est une inférence mécanique du pré-inventaire; elle ne remplace pas une architecture documentée.\n\n## Forces\n\n${list(audit.strengths, "Aucune force structurée déclarée.")}\n\n${moduleSections}\n\n## Recommandations — Now / Next / Later\n\n### Now\n\n${list(recommendations.now, "Aucune action immédiate structurée.")}\n\n### Next\n\n${list(recommendations.next, "Aucune action suivante structurée.")}\n\n### Later\n\n${list(recommendations.later, "Aucune action ultérieure structurée.")}\n\n## Décisions requises\n\n${list(audit.decisionsRequired, "Aucune décision explicite requise.")}\n\n## Limites globales\n\n${list(audit.limitations, "Aucune limite déclarée.")}\n\n## Preuves\n\n${audit.moduleResults.map((result) => `- ${result.moduleId} : ${result.evidence.map((evidence) => `\`${evidence.id}\``).join(", ") || "aucune"}`).join("\n")}${comparisonSection}\n`;
}

function repositoryMermaid(run: AuditRun): string {
  const labels: Readonly<Record<string, string>> = { source: "Code", tests: "Tests", manifest: "Dépendances", cicd: "CI/CD", observability: "Observabilité", product: "Produit et docs", web: "Interface web", iac: "Infrastructure", containers: "Conteneurs" };
  const nodes = run.inspection.signals.filter((signal) => signal.detected && labels[signal.id] !== undefined).map((signal) => signal.id);
  const lines = nodes.map((id) => `  repo --> ${id}["${labels[id]}"]`);
  return ["```mermaid", "flowchart LR", `  repo["${run.projectName.replace(/["\n\r]/g, " ")}"]`, ...(lines.length === 0 ? ["  repo --> unknown[\"Sources non détectées\"]"] : lines), "```"].join("\n");
}

function recommendationSections(values: readonly string[]): { readonly now: readonly string[]; readonly next: readonly string[]; readonly later: readonly string[] } {
  const strip = (value: string): string => value.replace(/^(?:now|next|later)\s*[:—-]\s*/i, "");
  return {
    now: values.filter((value) => /^now\s*[:—-]/i.test(value)).map(strip),
    next: values.filter((value) => !/^(?:now|later)\s*[:—-]/i.test(value)).map(strip),
    later: values.filter((value) => /^later\s*[:—-]/i.test(value)).map(strip),
  };
}

export function kbRecordsFromAudit(audit: AuditCanonical): readonly AuditKbRecord[] {
  return audit.moduleResults.flatMap((result) => {
    const records: AuditKbRecord[] = [];
    for (const finding of result.findings) records.push(kbRecord(audit, result, "finding", finding.title, finding.description, finding.status, finding.severity, finding.confidence, finding.origin, finding.evidenceIds, finding.fingerprint, finding.scope));
    for (const evidence of result.evidence) records.push(kbRecord(audit, result, evidence.kind === "metric" ? "metric" : "evidence", evidence.summary, evidence.summary, "observed", null, "high", "observed", [evidence.id], evidence.contentHash, evidence.location ?? "."));
    for (const strength of result.strengths) records.push(textKbRecord(audit, result, "fact", strength, "observed"));
    for (const limitation of result.limitations) records.push(textKbRecord(audit, result, "risk", limitation, "open"));
    for (const decision of result.decisionsRequired) records.push(textKbRecord(audit, result, "decision", decision, "required"));
    for (const recommendation of result.recommendations) records.push(textKbRecord(audit, result, "artifact", recommendation, "proposed"));
    return records;
  });
}

function textKbRecord(audit: AuditCanonical, result: AuditModuleResult, type: AuditKbRecord["type"], statement: string, status: string): AuditKbRecord {
  const fingerprint = createHash("sha256").update(JSON.stringify([type, result.moduleId, statement])).digest("hex");
  return kbRecord(audit, result, type, statement, statement, status, type === "risk" ? "info" : null, "medium", "observed", [], fingerprint);
}

function kbRecord(
  audit: AuditCanonical,
  result: AuditModuleResult,
  type: AuditKbRecord["type"],
  title: string,
  statement: string,
  status: string,
  severity: AuditKbRecord["severity"],
  confidence: AuditKbRecord["confidence"],
  origin: AuditKbRecord["origin"],
  evidenceIds: readonly string[],
  fingerprint: string,
  scope = ".",
): AuditKbRecord {
  return {
    schemaVersion: 1,
    id: `KB-${audit.auditId.slice(6)}-${result.moduleId}-${type}-${fingerprint.slice(0, 16)}`,
    auditId: audit.auditId,
    projectId: audit.projectId,
    commitExact: audit.commitExact,
    moduleId: result.moduleId,
    type,
    title: title.slice(0, 512),
    statement,
    status,
    scope,
    priority: severity ?? "none",
    severity,
    confidence,
    origin,
    evidenceIds,
    fingerprint,
    observedAt: audit.generatedAt,
  };
}

export function compareAudits(baseline: AuditCanonical, current: AuditCanonical): AuditComparison {
  const oldByFingerprint = new Map(baseline.findings.map((finding) => [finding.fingerprint, finding]));
  const newByFingerprint = new Map(current.findings.map((finding) => [finding.fingerprint, finding]));
  const added = [...newByFingerprint.keys()].filter((key) => !oldByFingerprint.has(key));
  const resolved = [...oldByFingerprint.keys()].filter((key) => !newByFingerprint.has(key));
  const persisting = [...newByFingerprint.keys()].filter((key) => oldByFingerprint.has(key));
  const regressed = persisting.filter((key) => severityRank(newByFingerprint.get(key)!) > severityRank(oldByFingerprint.get(key)!));
  const coverageChanged = hashCoverage(baseline) !== hashCoverage(current);
  return { baseline: baseline.auditId, current: current.auditId, new: added, persisting, resolved, regressed, coverageChanged };
}

function severityRank(finding: AuditFinding): number {
  return ["info", "low", "medium", "high", "critical"].indexOf(finding.severity);
}

function hashCoverage(audit: AuditCanonical): string {
  return createHash("sha256").update(JSON.stringify(audit.moduleResults.map((result) => [result.moduleId, result.execution.status, result.coverage]))).digest("hex");
}

function list(values: readonly string[], empty: string): string {
  return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}

function table(rows: readonly (readonly string[])[], headers: readonly string[]): string {
  return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function deduplicate<T>(values: readonly T[], key: (value: T) => string): readonly T[] {
  const seen = new Set<string>();
  return values.filter((value) => seen.has(key(value)) ? false : (seen.add(key(value)), true));
}
