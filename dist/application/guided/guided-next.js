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
export function guidedNext(report, featureId, sessionId, config) {
    const action = report.nextActions[0];
    const deliveryRuns = report.steps.find((step) => step.id === config.deliveryStepId)?.documents.length ?? 0;
    if (action === undefined) {
        return {
            featureId,
            pipelineId: report.pipelineId,
            phase: "Terminé",
            iteration: Math.max(1, deliveryRuns),
            action: null,
            prerequisites: report.steps.map((step) => step.id),
            reason: config.completionReason,
            instructions: [],
            expectedArtifact: null,
            suggestedCommand: null,
        };
    }
    const target = report.steps.find((step) => step.id === action.stepId);
    return {
        featureId,
        pipelineId: report.pipelineId,
        phase: action.phase ?? action.stepId,
        iteration: action.stepId === config.deliveryStepId ? deliveryRuns + 1 : Math.max(1, deliveryRuns),
        action: action.kind,
        prerequisites: report.steps.filter((step) => step.order < (target?.order ?? 0) && step.completionStatus === "completed").map((step) => step.id),
        reason: action.reason,
        instructions: action.instructions ?? [],
        expectedArtifact: `${action.stepId}.json`,
        suggestedCommand: withSession(action.suggestedCommand ?? `arka-norn pipeline scaffold ${action.stepId} --feature ${featureId}`, sessionId),
    };
}
function withSession(command, sessionId) {
    return command.includes(" --session ") ? command : `${command} --session ${sessionId}`;
}
//# sourceMappingURL=guided-next.js.map