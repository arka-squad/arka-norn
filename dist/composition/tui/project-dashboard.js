/*
 * Copyright 2026 Arka Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { mapConcurrent } from "../../application/shared/map-concurrent.js";
export async function loadProjectMetrics(features, pipeline, authorRegistryForFeature) {
    return new Map(await mapConcurrent(features, 4, async (feature) => {
        const report = await pipeline.inspect({
            featureRoot: feature.root,
            featureId: feature.id.value,
            pipelineId: feature.pipelineId,
            authorRegistry: await authorRegistryForFeature(feature),
        });
        return [feature.id.value, metricsFromReport(report, feature.pipelineId)];
    }));
}
export function metricsFromReport(report, pipelineId = report.pipelineId) {
    const debts = report.steps.find((step) => step.id === "registre_dettes");
    const qa = report.steps.find((step) => step.id === "recette_qa");
    return {
        status: report.overallStatus,
        debtDocuments: debts?.documents.length ?? 0,
        qaFailures: qa?.documents.filter((document) => document.businessVerdict === "fail").length ?? 0,
        handoffSignals: report.transversalDocuments.find((state) => state.type === "handoff")?.documents.length ?? 0,
        invalidDocuments: report.steps.reduce((count, step) => count + step.documents.filter((document) => !document.valid).length, 0),
        pipelineId,
        phase: report.nextActions[0]?.phase ?? (report.overallStatus === "completed" ? "Terminé" : "Diagnostic"),
        progress: `${report.steps.filter((step) => step.completionStatus === "completed").length}/${report.steps.filter((step) => step.required).length}`,
        iteration: Math.max(1, report.steps.find((step) => step.id === "cr_dev")?.documents.length ?? 0),
    };
}
//# sourceMappingURL=project-dashboard.js.map