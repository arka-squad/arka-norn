export function pipelineExitCode(report) {
    if (report.overallStatus === "completed")
        return 0;
    if (report.overallStatus === "invalid")
        return 3;
    return 2;
}
export function presentPipelineReport(report) {
    const lines = [`=== Pipeline ${report.pipelineId} ===`, `Feature : ${report.featureRoot}`, `État   : ${report.overallStatus}`, ""];
    for (const step of report.steps) {
        const count = step.documents.length;
        lines.push(`[${String(step.order).padStart(2, "0")}] ${step.id.padEnd(30)} ` +
            `presence=${step.presenceStatus} schema=${step.schemaStatus} métier=${step.businessStatus} dépendances=${step.dependencyStatus} final=${step.completionStatus}` +
            `${count > 0 ? ` documents=${count}` : ""}`);
    }
    if (report.latestCrDevId !== undefined)
        lines.push("", `Dernier CR Dev : ${report.latestCrDevId}`);
    if (report.selectedQaId !== undefined)
        lines.push(`Recette retenue : ${report.selectedQaId}`);
    if (report.errors.length > 0)
        lines.push("", "Erreurs :", ...report.errors.map((error) => `- ${error}`));
    if (report.warnings.length > 0)
        lines.push("", "Avertissements :", ...report.warnings.map((warning) => `- ${warning}`));
    if (report.nextActions.length > 0) {
        lines.push("", "=== Prochaine action ===");
        lines.push(...report.nextActions.map((action) => `${action.kind} -> ${action.stepId} : ${action.reason}`));
    }
    else if (report.overallStatus === "completed") {
        lines.push("", "Pipeline complet.");
    }
    return `${lines.join("\n")}\n`;
}
export function pipelineReportEnvelope(report) {
    return {
        schemaVersion: 1,
        ok: pipelineExitCode(report) === 0,
        data: report,
        errors: report.errors,
        warnings: report.warnings,
    };
}
//# sourceMappingURL=pipeline-report-presenter.js.map