export function createFeatureCockpitViewModel(feature, report) {
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
function createFastdevDetails(report, crStep, next, fastdev) {
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
function selectedDocument(step) {
    return step?.documents.find((document) => document.id === step.selectedDocumentId);
}
function sumField(step, field) {
    return step?.documents.reduce((count, document) => count + (document[field] ?? 0), 0) ?? 0;
}
function nextLabel(next) {
    return next === undefined ? "Aucune — pipeline terminé" : `${next.kind} → ${next.stepId}`;
}
function nextReason(next) {
    return next === undefined ? "toutes les étapes obligatoires et la dernière revue sont concluantes" : next.reason;
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