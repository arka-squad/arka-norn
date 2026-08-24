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
export function createPipelineDefinition(input) {
    if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1)
        throw new Error("Pipeline schemaVersion must be positive.");
    if (!/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input.pipelineId))
        throw new Error("Invalid pipelineId.");
    if (input.steps.length === 0)
        throw new Error("Pipeline must contain at least one step.");
    const ids = new Set();
    const orders = new Set();
    for (const step of input.steps) {
        if (!/^[a-z0-9][a-z0-9_]{0,127}$/.test(step.id))
            throw new Error(`Invalid step id: ${step.id}`);
        if (ids.has(step.id))
            throw new Error(`Duplicate step id: ${step.id}`);
        if (!Number.isInteger(step.order) || step.order < 1 || orders.has(step.order))
            throw new Error(`Invalid or duplicate step order: ${step.order}`);
        ids.add(step.id);
        orders.add(step.order);
        if (step.decisionGate !== undefined && step.decisionGate !== "continue" && step.decisionGate !== "human_decision")
            throw new Error(`Invalid decision gate for ${step.id}`);
    }
    for (const document of input.transversalDocuments) {
        if (!/^[a-z0-9][a-z0-9_]{0,127}$/.test(document.type) || ids.has(document.type) || document.schemaPath.length === 0) {
            throw new Error(`Invalid transversal document type: ${document.type}`);
        }
    }
    for (const step of input.steps) {
        for (const dependency of step.dependsOn) {
            if (!ids.has(dependency))
                throw new Error(`Unknown dependency ${dependency} for ${step.id}`);
            const dependencyStep = input.steps.find((candidate) => candidate.id === dependency);
            if (dependencyStep !== undefined && dependencyStep.order >= step.order) {
                throw new Error(`Dependency ${dependency} must precede ${step.id}`);
            }
        }
        if (step.loopTo !== undefined && !ids.has(step.loopTo))
            throw new Error(`Unknown loop target ${step.loopTo}.`);
        const policy = step.businessPolicy;
        if (policy !== undefined && (policy.type === "audit_then_fix" || policy.type === "review_latest")) {
            if (!ids.has(policy.targetStep))
                throw new Error(`Unknown business policy target ${policy.targetStep} for ${step.id}.`);
            if (!ids.has(policy.retryStep))
                throw new Error(`Unknown business policy retry step ${policy.retryStep} for ${step.id}.`);
        }
    }
    return { ...input, steps: [...input.steps].sort((a, b) => a.order - b.order) };
}
//# sourceMappingURL=pipeline-definition.js.map