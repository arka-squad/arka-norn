export function createFeatureCockpitViewModel(feature, report) {
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
        handoffSignals: report.warnings.filter((warning) => warning.toLowerCase().includes("handoff")).length,
    };
}
function symbol(status) {
    if (status === "completed")
        return "✓";
    if (status === "failed" || status === "blocked")
        return "!";
    if (status === "in_progress")
        return "~";
    return "·";
}
//# sourceMappingURL=feature-cockpit.js.map