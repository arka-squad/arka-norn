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
import { createHash } from "node:crypto";
import { relative } from "node:path";
import { roleForStep } from "../application/agents/agent-orchestration.js";
import { translate } from "../application/localization/locale.js";
import { ExecutionPolicy, selectBestEligibleTarget, } from "../domain/orchestration/execution-policy.js";
import { sameExecutionTarget, userExecutionTarget } from "../domain/orchestration/types.js";
import { loadVerifiedFeatureContext } from "./verified-feature-context.js";
import { configuredProviderHealth, requirementsForExecution } from "./orchestration-provider-configuration.js";
import { readOnlyAnalysisVerdictFromProofReferences } from "./orchestration-proof-validation.js";
export function createOrchestrationMissionPlanner(input) {
    async function resolveFeature(project, requested) {
        if (requested !== undefined) {
            const feature = await input.features.show(requested);
            if (!feature.belongsTo(project.id))
                throw new Error(`Feature ${feature.id.value} does not belong to Project ${project.id.value}.`);
            return feature;
        }
        const features = await input.features.list(project.id);
        if (features.length !== 1)
            throw new Error("Automatic orchestration requires --feature unless the Project has exactly one Feature.");
        return features[0];
    }
    async function inspectFeature(feature) {
        const { authorRegistry } = await loadVerifiedFeatureContext(feature, { projects: input.projects, agents: input.agents });
        return inspectWithAuthorRegistry(feature, authorRegistry);
    }
    async function inspectWorkspaceFeature(project, feature) {
        if (!feature.belongsTo(project.id))
            throw new Error("The mirrored Feature does not belong to the logical Project.");
        const agents = await input.agents.list(project);
        return inspectWithAuthorRegistry(feature, agents.map((agent) => ({
            id: agent.id.value,
            active: agent.active,
            authorized: agent.coversFeature(feature.id),
        })));
    }
    async function inspectWithAuthorRegistry(feature, authorRegistry) {
        const report = await input.pipeline.inspect({
            featureRoot: feature.root,
            featureId: feature.id.value,
            pipelineId: feature.pipelineId,
            documentContractVersion: feature.documentContractVersion,
            authorRegistry,
        });
        return { report };
    }
    async function loadPolicyForPreview(project) {
        return (await input.policyStore.load(project)) ?? ExecutionPolicy.defaultFor(project.id, input.clock.now());
    }
    async function prepareMissionPreview(project, featureId) {
        const feature = await resolveFeature(project, featureId);
        const current = await inspectFeature(feature);
        const next = current.report.nextActions[0];
        if (next === undefined)
            throw new Error("The Pipeline has no next step to prepare with assisted control.");
        const role = roleForStep(next.stepId);
        if (role === undefined)
            throw new Error(`The current Pipeline step ${next.stepId} has no bounded assistant role.`);
        await assertNoPendingReadOnlyAnalysis(project, feature.id.value, next.stepId);
        const requirements = requirementsForExecution(role);
        const policy = await loadPolicyForPreview(project);
        const targetHealth = targetHealthForPolicy(policy, await providerHealth(project));
        const targetSelection = selectBestEligibleTarget(policy, requirements, targetHealth);
        // A Feature selects the business workflow. The Product Agent still owns
        // the Project root; write paths are confirmed independently from cwd.
        const scopePaths = ["."];
        const maximumMissions = Math.min(50, current.report.steps.filter((step) => step.completionStatus !== "completed").length + 1);
        const candidates = targetSelection.candidates.map((candidate) => ({
            target: candidate.target,
            eligible: candidate.eligible,
            reasons: candidate.reasons,
            recommended: targetSelection.selected !== undefined && sameExecutionTarget(candidate.target, targetSelection.selected),
            ...runtimeIdentity(targetHealth, candidate.target),
        }));
        const summary = translate("orchestration.preview.summary", { step: next.stepId, feature: feature.name });
        const preview = {
            schemaVersion: 1,
            projectId: project.id.value,
            featureId: feature.id.value,
            featureName: feature.name,
            stepId: next.stepId,
            role,
            summary,
            logicalRoot: project.root,
            workspaceMode: policy.workspaceMode,
            maximumMissions,
            scopePaths,
            requiredCapabilities: [...requirements.capabilities],
            requiredPermissions: [...requirements.permissions],
            candidates,
            fingerprint: previewFingerprint({
                projectId: project.id.value,
                featureId: feature.id.value,
                nextStepId: next.stepId,
                role,
                scopePaths,
                requirements,
                policyUpdatedAt: policy.updatedAt.toISOString(),
                workspaceMode: policy.workspaceMode,
                maximumMissions,
                candidates,
            }),
        };
        return { preview, feature, nextStepId: next.stepId, scopePaths, requirements, summary };
    }
    function assertConfirmedPreview(prepared, selection, expectedFingerprint) {
        if (expectedFingerprint !== prepared.preview.fingerprint) {
            throw new Error("The mission preview changed before confirmation. Review the updated mission before launching an assistant.");
        }
        const target = userExecutionTarget(selection.provider, selection.model);
        const candidate = prepared.preview.candidates.find((entry) => sameExecutionTarget(entry.target, target));
        if (candidate === undefined)
            throw new Error("The selected assistant and version are not configured for this Project.");
        if (!candidate.eligible)
            throw new Error("The selected assistant and version cannot safely run this mission: " + candidate.reasons.join(", ") + ".");
        return target;
    }
    function policyWithUserModel(source, selection, updatedAt) {
        userExecutionTarget(selection.provider, selection.model);
        const defaults = ExecutionPolicy.defaultFor(source.projectId, source.createdAt).toProps();
        const sourceByProvider = new Map(source.providers.map((provider) => [provider.provider, provider]));
        const providers = defaults.providers.map((defaultProvider) => {
            const current = sourceByProvider.get(defaultProvider.provider) ?? defaultProvider;
            if (current.provider !== selection.provider)
                return current;
            const existing = current.models.find((model) => model.id === selection.model);
            return {
                ...current,
                enabled: true,
                models: [
                    ...current.models.filter((model) => model.id !== selection.model),
                    { id: selection.model, enabled: true, priority: existing?.priority ?? 1000 },
                ],
            };
        });
        return ExecutionPolicy.create({
            schemaVersion: defaults.schemaVersion,
            projectId: source.projectId,
            selectionMode: "assisted",
            workspaceMode: source.workspaceMode,
            providers,
            createdAt: source.createdAt,
            updatedAt,
        });
    }
    async function targetHealth(project, policy) {
        return targetHealthForPolicy(policy, await providerHealth(project));
    }
    return { resolveFeature, inspectFeature, inspectWorkspaceFeature, loadPolicyForPreview, prepareMissionPreview, assertConfirmedPreview, policyWithUserModel, targetHealth };
    async function assertNoPendingReadOnlyAnalysis(project, featureId, stepId) {
        const registry = await input.registryStore.load(project);
        const pending = registry.executions.some((record) => record.status === "succeeded"
            && record.order.scope.featureId?.value === featureId
            && record.order.preconditions.nextStepId === stepId
            && readOnlyAnalysisVerdictFromProofReferences(record.proofReferences) !== undefined);
        if (pending)
            throw new Error("A read-only analysis awaits manual Pipeline validation.");
    }
    async function providerHealth(project) {
        if (input.providerHealth !== undefined)
            return input.providerHealth(project);
        return configuredProviderHealth(input.environment);
    }
}
export function relativeFeatureScope(project, feature) {
    const scope = relative(project.root, feature.root).replaceAll("\\", "/");
    if (scope.length === 0 || scope === ".." || scope.startsWith("../") || scope.startsWith("/")) {
        throw new Error("Feature scope is outside the Project root.");
    }
    return scope;
}
function targetHealthForPolicy(policy, providerEntries) {
    const byProvider = new Map(providerEntries.map((entry) => [entry.provider, entry]));
    return policy.providers.flatMap((provider) => provider.models.map((model) => {
        const health = byProvider.get(provider.provider);
        return {
            target: userExecutionTarget(provider.provider, model.id),
            healthy: health?.healthy ?? false,
            capabilities: health?.capabilities ?? [],
            ...(health?.runtimeVersion === undefined ? {} : { runtimeVersion: health.runtimeVersion }),
            ...(health?.runtimeFingerprint === undefined ? {} : { runtimeFingerprint: health.runtimeFingerprint }),
        };
    }));
}
function runtimeIdentity(health, target) {
    const match = health.find((entry) => sameExecutionTarget(entry.target, target));
    return {
        ...(match?.runtimeVersion === undefined ? {} : { runtimeVersion: match.runtimeVersion }),
        ...(match?.runtimeFingerprint === undefined ? {} : { runtimeFingerprint: match.runtimeFingerprint }),
    };
}
function previewFingerprint(value) {
    const stable = JSON.stringify({
        projectId: value.projectId,
        featureId: value.featureId,
        nextStepId: value.nextStepId,
        role: value.role,
        scopePaths: [...value.scopePaths],
        capabilities: [...value.requirements.capabilities],
        permissions: [...value.requirements.permissions],
        policyUpdatedAt: value.policyUpdatedAt,
        workspaceMode: value.workspaceMode,
        maximumMissions: value.maximumMissions,
        candidates: value.candidates.map((candidate) => ({
            target: candidate.target,
            eligible: candidate.eligible,
            reasons: [...candidate.reasons],
            recommended: candidate.recommended,
            runtimeVersion: candidate.runtimeVersion,
            runtimeFingerprint: candidate.runtimeFingerprint,
        })),
    });
    return createHash("sha256").update(stable).digest("hex");
}
//# sourceMappingURL=orchestration-mission-planner.js.map