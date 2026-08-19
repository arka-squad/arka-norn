import { mapConcurrent } from "../../application/shared/map-concurrent.js";
export async function loadProjectMetrics(features, pipeline) {
    return new Map(await mapConcurrent(features, 4, async (feature) => {
        const report = await pipeline.inspect({ featureRoot: feature.root, featureId: feature.id.value });
        return [feature.id.value, metricsFromReport(report)];
    }));
}
export function metricsFromReport(report) {
    const debts = report.steps.find((step) => step.id === "registre_dettes");
    const qa = report.steps.find((step) => step.id === "recette_qa");
    return {
        status: report.overallStatus,
        debtDocuments: debts?.documents.length ?? 0,
        qaFailures: qa?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
        handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
        invalidDocuments: report.steps.reduce((count, step) => count + step.documents.filter((document) => !document.valid).length, 0),
    };
}
//# sourceMappingURL=project-dashboard.js.map