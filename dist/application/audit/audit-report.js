/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
import { createHash } from "node:crypto";
import { auditModuleDefinition } from "../../domain/audit/module-catalog.js";
import { formatDate, formatNumber, translate } from "../localization/locale.js";
export function buildCanonicalAudit(run, results, now) {
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
export function renderAuditReport(run, audit, comparison) {
    const moduleSections = audit.moduleResults.map((result) => {
        const findings = result.findings.length === 0
            ? translate("audit.report.noFinding")
            : table(result.findings.map((finding) => [finding.severity, finding.title, finding.origin, finding.confidence]), [translate("audit.report.priority"), translate("audit.report.finding"), translate("audit.report.origin"), translate("audit.report.confidence")]);
        return `## ${result.moduleId} - ${auditModuleDefinition(result.moduleId).title}\n\n${result.summary}\n\n- ${translate("audit.report.execution")}: ${result.execution.status}\n- ${translate("audit.report.assessment")}: ${result.assessment?.status ?? translate("audit.report.notAssessed")}\n- ${translate("audit.report.coverage")}: ${formatNumber(result.coverage.completed.length)}/${formatNumber(result.coverage.requested.length)}\n\n### ${translate("audit.report.findings")}\n\n${findings}\n\n### ${translate("audit.report.limitations")}\n\n${list(result.limitations, translate("audit.report.noLimitation"))}`;
    }).join("\n\n");
    const comparisonSection = comparison === undefined ? "" : `\n\n## ${translate("audit.report.evolution", { baseline: comparison.baseline })}\n\n- ${translate("audit.report.new")}: ${formatNumber(comparison.new.length)}\n- ${translate("audit.report.persisting")}: ${formatNumber(comparison.persisting.length)}\n- ${translate("audit.report.resolved")}: ${formatNumber(comparison.resolved.length)}\n- ${translate("audit.report.regressions")}: ${formatNumber(comparison.regressed.length)}\n- ${translate("audit.report.coverageChanged")}: ${translate(comparison.coverageChanged ? "audit.report.yes" : "audit.report.no")}`;
    const repositoryMap = run.inspection.signals.map((signal) => `- ${translate(signal.detected ? "audit.report.signal.present" : "audit.report.signal.absent")} - ${signal.id}${signal.evidence.length === 0 ? "" : `: ${signal.evidence.slice(0, 5).map((item) => `\`${item}\``).join(", ")}`}`).join("\n");
    const recommendations = recommendationSections(audit.recommendations);
    const cleanWorkspace = run.inspection.workspaceClean === true ? translate("audit.report.yes") : run.inspection.workspaceClean === false ? translate("audit.report.no") : translate("audit.report.unknown");
    const generatedAt = formatDate(new Date(audit.generatedAt));
    return `# ${translate("audit.report.title", { project: run.projectName })}\n\n## ${translate("audit.report.userRequest")}\n\n${run.request.objective}\n\n## ${translate("audit.report.executiveSummary")}\n\n- ${translate("audit.report.audit")}: \`${audit.auditId}\`\n- ${translate("audit.report.mode")}: ${audit.mode}\n- ${translate("audit.report.status")}: ${audit.status}\n- ${translate("audit.report.commit")}: \`${audit.commitExact ?? translate("audit.report.unavailable")}\`\n- ${translate("audit.report.cleanWorkspace")}: ${cleanWorkspace}\n- ${translate("audit.report.coverage")}: ${translate("audit.report.completeCount", { complete: formatNumber(audit.coverage.complete), partial: formatNumber(audit.coverage.partial), skipped: formatNumber(audit.coverage.skipped) })}\n- ${translate("audit.report.findings")}: ${formatNumber(audit.findings.length)}\n\n## ${translate("audit.report.scope")}\n\n- Project: \`${run.projectId}\`\n- ${translate("audit.report.feature")}: ${run.featureId === null ? translate("audit.report.none") : `\`${run.featureId}\``}\n- ${translate("audit.report.paths")}: ${run.request.paths.map((path) => `\`${path}\``).join(", ")}\n- ${translate("audit.report.generated")}: ${generatedAt}\n\n## ${translate("audit.report.actualCoverage")}\n\n${table(audit.moduleResults.map((result) => [result.moduleId, result.execution.status, `${formatNumber(result.coverage.completed.length)}/${formatNumber(result.coverage.requested.length)}`, result.assessment?.status ?? translate("audit.report.notAssessed")]), [translate("audit.report.domain"), translate("audit.report.execution"), translate("audit.report.coverage"), translate("audit.report.assessment")])}\n\n## ${translate("audit.report.repositoryMap")}\n\n${repositoryMap || translate("audit.report.noSignal")}\n\n${repositoryMermaid(run)}\n\n${translate("audit.report.mapInference")}\n\n## ${translate("audit.report.strengths")}\n\n${list(audit.strengths, translate("audit.report.noStrength"))}\n\n${moduleSections}\n\n## ${translate("audit.report.recommendations")}\n\n### Now\n\n${list(recommendations.now, translate("audit.report.noNow"))}\n\n### Next\n\n${list(recommendations.next, translate("audit.report.noNext"))}\n\n### Later\n\n${list(recommendations.later, translate("audit.report.noLater"))}\n\n## ${translate("audit.report.decisions")}\n\n${list(audit.decisionsRequired, translate("audit.report.noDecision"))}\n\n## ${translate("audit.report.globalLimitations")}\n\n${list(audit.limitations, translate("audit.report.noLimitation"))}\n\n## ${translate("audit.report.evidence")}\n\n${audit.moduleResults.map((result) => `- ${result.moduleId}: ${result.evidence.map((evidence) => `\`${evidence.id}\``).join(", ") || translate("audit.report.none")}`).join("\n")}${comparisonSection}\n`;
}
function repositoryMermaid(run) {
    const labels = { source: "Code", tests: "Tests", manifest: "Dependencies", cicd: "CI/CD", observability: "Observability", product: "Product and docs", web: "Web interface", iac: "Infrastructure", containers: "Containers" };
    const nodes = run.inspection.signals.filter((signal) => signal.detected && labels[signal.id] !== undefined).map((signal) => signal.id);
    const lines = nodes.map((id) => `  repo --> ${id}["${labels[id]}"]`);
    return ["```mermaid", "flowchart LR", `  repo["${run.projectName.replace(/["\n\r]/g, " ")}"]`, ...(lines.length === 0 ? [`  repo --> unknown["${translate("audit.report.repositoryUnknown")}"]`] : lines), "```"].join("\n");
}
function recommendationSections(values) {
    const strip = (value) => value.replace(/^(?:now|next|later)\s*[:—-]\s*/i, "");
    return {
        now: values.filter((value) => /^now\s*[:—-]/i.test(value)).map(strip),
        next: values.filter((value) => !/^(?:now|later)\s*[:—-]/i.test(value)).map(strip),
        later: values.filter((value) => /^later\s*[:—-]/i.test(value)).map(strip),
    };
}
export function kbRecordsFromAudit(audit) {
    return audit.moduleResults.flatMap((result) => {
        const records = [];
        for (const finding of result.findings)
            records.push(kbRecord(audit, result, "finding", finding.title, finding.description, finding.status, finding.severity, finding.confidence, finding.origin, finding.evidenceIds, finding.fingerprint, finding.scope));
        for (const evidence of result.evidence)
            records.push(kbRecord(audit, result, evidence.kind === "metric" ? "metric" : "evidence", evidence.summary, evidence.summary, "observed", null, "high", "observed", [evidence.id], evidence.contentHash, evidence.location ?? "."));
        for (const strength of result.strengths)
            records.push(textKbRecord(audit, result, "fact", strength, "observed"));
        for (const limitation of result.limitations)
            records.push(textKbRecord(audit, result, "risk", limitation, "open"));
        for (const decision of result.decisionsRequired)
            records.push(textKbRecord(audit, result, "decision", decision, "required"));
        for (const recommendation of result.recommendations)
            records.push(textKbRecord(audit, result, "artifact", recommendation, "proposed"));
        return records;
    });
}
function textKbRecord(audit, result, type, statement, status) {
    const fingerprint = createHash("sha256").update(JSON.stringify([type, result.moduleId, statement])).digest("hex");
    return kbRecord(audit, result, type, statement, statement, status, type === "risk" ? "info" : null, "medium", "observed", [], fingerprint);
}
function kbRecord(audit, result, type, title, statement, status, severity, confidence, origin, evidenceIds, fingerprint, scope = ".") {
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
export function compareAudits(baseline, current) {
    const oldByFingerprint = new Map(baseline.findings.map((finding) => [finding.fingerprint, finding]));
    const newByFingerprint = new Map(current.findings.map((finding) => [finding.fingerprint, finding]));
    const added = [...newByFingerprint.keys()].filter((key) => !oldByFingerprint.has(key));
    const resolved = [...oldByFingerprint.keys()].filter((key) => !newByFingerprint.has(key));
    const persisting = [...newByFingerprint.keys()].filter((key) => oldByFingerprint.has(key));
    const regressed = persisting.filter((key) => severityRank(newByFingerprint.get(key)) > severityRank(oldByFingerprint.get(key)));
    const coverageChanged = hashCoverage(baseline) !== hashCoverage(current);
    return { baseline: baseline.auditId, current: current.auditId, new: added, persisting, resolved, regressed, coverageChanged };
}
function severityRank(finding) {
    return ["info", "low", "medium", "high", "critical"].indexOf(finding.severity);
}
function hashCoverage(audit) {
    return createHash("sha256").update(JSON.stringify(audit.moduleResults.map((result) => [result.moduleId, result.execution.status, result.coverage]))).digest("hex");
}
function list(values, empty) {
    return values.length === 0 ? empty : values.map((value) => `- ${value}`).join("\n");
}
function table(rows, headers) {
    return [`| ${headers.join(" | ")} |`, `|${headers.map(() => "---").join("|")}|`, ...rows.map((row) => `| ${row.join(" | ")} |`)].join("\n");
}
function unique(values) {
    return [...new Set(values)];
}
function deduplicate(values, key) {
    const seen = new Set();
    return values.filter((value) => seen.has(key(value)) ? false : (seen.add(key(value)), true));
}
//# sourceMappingURL=audit-report.js.map