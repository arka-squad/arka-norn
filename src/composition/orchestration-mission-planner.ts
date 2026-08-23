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
import type { Feature } from "../domain/feature/feature.js";
import {
  ExecutionPolicy,
  selectBestEligibleTarget,
  type ExecutionProviderHealth,
  type ExecutionRequirements,
  type ExecutionTargetHealth,
} from "../domain/orchestration/execution-policy.js";
import { sameExecutionTarget, userExecutionTarget, type ExecutionTarget } from "../domain/orchestration/types.js";
import type { Project } from "../domain/project/project.js";
import type { Clock } from "../ports/outbound/clock.js";
import type { ExecutionRegistryStore } from "../ports/outbound/execution-registry-store.js";
import type { OrchestrationPolicyStore } from "../ports/outbound/orchestration-policy-store.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type { OrchestrationPreview, OrchestrationTargetSelection } from "../ports/inbound/for-orchestration.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import { loadVerifiedFeatureContext } from "./verified-feature-context.js";
import { configuredProviderHealth, requirementsForExecution } from "./orchestration-provider-configuration.js";
import { readOnlyAnalysisVerdictFromProofReferences } from "./orchestration-proof-validation.js";

export interface PreparedMissionPreview {
  readonly preview: OrchestrationPreview;
  readonly feature: Feature;
  readonly nextStepId: string;
  readonly scopePaths: readonly string[];
  readonly requirements: ExecutionRequirements;
  readonly summary: string;
}

export interface OrchestrationMissionPlanner {
  resolveFeature(project: Project, requested?: Parameters<ForFeatures["show"]>[0]): Promise<Feature>;
  inspectFeature(feature: Feature): Promise<{ readonly report: Awaited<ReturnType<ForPipeline["inspect"]>> }>;
  loadPolicyForPreview(project: Project): Promise<ExecutionPolicy>;
  prepareMissionPreview(project: Project, featureId: Parameters<ForFeatures["show"]>[0]): Promise<PreparedMissionPreview>;
  assertConfirmedPreview(prepared: PreparedMissionPreview, selection: OrchestrationTargetSelection, expectedFingerprint: string): ExecutionTarget;
  policyWithUserModel(source: ExecutionPolicy, selection: OrchestrationTargetSelection, updatedAt: Date): ExecutionPolicy;
  targetHealth(project: Project, policy: ExecutionPolicy): Promise<readonly ExecutionTargetHealth[]>;
}

export function createOrchestrationMissionPlanner(input: {
  readonly projects: ForProjects;
  readonly features: ForFeatures;
  readonly agents: ForAgents;
  readonly pipeline: ForPipeline;
  readonly policyStore: OrchestrationPolicyStore;
  readonly registryStore: ExecutionRegistryStore;
  readonly clock: Clock;
  readonly environment: NodeJS.ProcessEnv;
  readonly providerHealth?: (project: Project) => readonly ExecutionProviderHealth[] | Promise<readonly ExecutionProviderHealth[]>;
}): OrchestrationMissionPlanner {
  async function resolveFeature(project: Project, requested?: Parameters<ForFeatures["show"]>[0]): Promise<Feature> {
    if (requested !== undefined) {
      const feature = await input.features.show(requested);
      if (!feature.belongsTo(project.id)) throw new Error(`Feature ${feature.id.value} does not belong to Project ${project.id.value}.`);
      return feature;
    }
    const features = await input.features.list(project.id);
    if (features.length !== 1) throw new Error("Automatic orchestration requires --feature unless the Project has exactly one Feature.");
    return features[0]!;
  }

  async function inspectFeature(feature: Feature): Promise<{ readonly report: Awaited<ReturnType<ForPipeline["inspect"]>> }> {
    const { authorRegistry } = await loadVerifiedFeatureContext(feature, { projects: input.projects, agents: input.agents });
    const report = await input.pipeline.inspect({
      featureRoot: feature.root,
      featureId: feature.id.value,
      pipelineId: feature.pipelineId,
      documentContractVersion: feature.documentContractVersion,
      authorRegistry,
    });
    return { report };
  }

  async function loadPolicyForPreview(project: Project): Promise<ExecutionPolicy> {
    return (await input.policyStore.load(project)) ?? ExecutionPolicy.defaultFor(project.id, input.clock.now());
  }

  async function prepareMissionPreview(project: Project, featureId: Parameters<ForFeatures["show"]>[0]): Promise<PreparedMissionPreview> {
    const feature = await resolveFeature(project, featureId);
    const current = await inspectFeature(feature);
    const next = current.report.nextActions[0];
    if (next === undefined) throw new Error("The Pipeline has no next step to prepare with assisted control.");
    const role = roleForStep(next.stepId);
    if (role === undefined) throw new Error(`The current Pipeline step ${next.stepId} has no bounded assistant role.`);
    await assertNoPendingReadOnlyAnalysis(project, feature.id.value, next.stepId);
    const requirements = requirementsForExecution(role);
    const policy = await loadPolicyForPreview(project);
    const targetSelection = selectBestEligibleTarget(
      policy,
      requirements,
      targetHealthForPolicy(policy, await providerHealth(project)),
    );
    const scopePaths = [relativeFeatureScope(project, feature)] as const;
    const candidates = targetSelection.candidates.map((candidate) => ({
      target: candidate.target,
      eligible: candidate.eligible,
      reasons: candidate.reasons,
      recommended: targetSelection.selected !== undefined && sameExecutionTarget(candidate.target, targetSelection.selected),
    }));
    const summary = translate("orchestration.preview.summary", { step: next.stepId, feature: feature.name });
    const preview: OrchestrationPreview = {
      schemaVersion: 1,
      projectId: project.id.value,
      featureId: feature.id.value,
      featureName: feature.name,
      stepId: next.stepId,
      role,
      summary,
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
        candidates,
      }),
    };
    return { preview, feature, nextStepId: next.stepId, scopePaths, requirements, summary };
  }

  function assertConfirmedPreview(
    prepared: PreparedMissionPreview,
    selection: OrchestrationTargetSelection,
    expectedFingerprint: string,
  ): ExecutionTarget {
    if (expectedFingerprint !== prepared.preview.fingerprint) {
      throw new Error("The mission preview changed before confirmation. Review the updated mission before launching an assistant.");
    }
    const target = userExecutionTarget(selection.provider, selection.model);
    const candidate = prepared.preview.candidates.find((entry) => sameExecutionTarget(entry.target, target));
    if (candidate === undefined) throw new Error("The selected assistant and version are not configured for this Project.");
    if (!candidate.eligible) throw new Error("The selected assistant and version cannot safely run this mission: " + candidate.reasons.join(", ") + ".");
    return target;
  }

  function policyWithUserModel(
    source: ExecutionPolicy,
    selection: OrchestrationTargetSelection,
    updatedAt: Date,
  ): ExecutionPolicy {
    userExecutionTarget(selection.provider, selection.model);
    const defaults = ExecutionPolicy.defaultFor(source.projectId, source.createdAt).toProps();
    const sourceByProvider = new Map(source.providers.map((provider) => [provider.provider, provider]));
    const providers = defaults.providers.map((defaultProvider) => {
      const current = sourceByProvider.get(defaultProvider.provider) ?? defaultProvider;
      if (current.provider !== selection.provider) return current;
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
      providers,
      createdAt: source.createdAt,
      updatedAt,
    });
  }

  async function targetHealth(project: Project, policy: ExecutionPolicy): Promise<readonly ExecutionTargetHealth[]> {
    return targetHealthForPolicy(policy, await providerHealth(project));
  }

  return { resolveFeature, inspectFeature, loadPolicyForPreview, prepareMissionPreview, assertConfirmedPreview, policyWithUserModel, targetHealth };

  async function assertNoPendingReadOnlyAnalysis(project: Project, featureId: string, stepId: string): Promise<void> {
    const registry = await input.registryStore.load(project);
    const pending = registry.executions.some((record) => record.status === "succeeded"
      && record.order.scope.featureId?.value === featureId
      && record.order.preconditions.nextStepId === stepId
      && readOnlyAnalysisVerdictFromProofReferences(record.proofReferences) !== undefined);
    if (pending) throw new Error("A read-only analysis awaits manual Pipeline validation.");
  }

  async function providerHealth(project: Project): Promise<readonly ExecutionProviderHealth[]> {
    if (input.providerHealth !== undefined) return input.providerHealth(project);
    return configuredProviderHealth(input.environment);
  }
}

export function relativeFeatureScope(project: Project, feature: Feature): string {
  const scope = relative(project.root, feature.root).replaceAll("\\", "/");
  if (scope.length === 0 || scope === ".." || scope.startsWith("../") || scope.startsWith("/")) {
    throw new Error("Feature scope is outside the Project root.");
  }
  return scope;
}

function targetHealthForPolicy(
  policy: ExecutionPolicy,
  providerEntries: readonly ExecutionProviderHealth[],
): readonly ExecutionTargetHealth[] {
  const byProvider = new Map(providerEntries.map((entry) => [entry.provider, entry]));
  return policy.providers.flatMap((provider) => provider.models.map((model) => {
    const health = byProvider.get(provider.provider);
    return {
      target: userExecutionTarget(provider.provider, model.id),
      healthy: health?.healthy ?? false,
      capabilities: health?.capabilities ?? [],
    };
  }));
}

function previewFingerprint(value: {
  readonly projectId: string;
  readonly featureId: string;
  readonly nextStepId: string;
  readonly role: string;
  readonly scopePaths: readonly string[];
  readonly requirements: ExecutionRequirements;
  readonly policyUpdatedAt: string;
  readonly candidates: readonly OrchestrationPreview["candidates"][number][];
}): string {
  const stable = JSON.stringify({
    projectId: value.projectId,
    featureId: value.featureId,
    nextStepId: value.nextStepId,
    role: value.role,
    scopePaths: [...value.scopePaths],
    capabilities: [...value.requirements.capabilities],
    permissions: [...value.requirements.permissions],
    policyUpdatedAt: value.policyUpdatedAt,
    candidates: value.candidates.map((candidate) => ({
      target: candidate.target,
      eligible: candidate.eligible,
      reasons: [...candidate.reasons],
      recommended: candidate.recommended,
    })),
  });
  return createHash("sha256").update(stable).digest("hex");
}
