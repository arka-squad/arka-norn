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

import { createAgentAdvice, createInitializationPrompt, createProductHandoffPrompt } from "../application/agents/agent-orchestration.js";
import type { Feature } from "../domain/feature/feature.js";
import type { ForAgentOrchestration } from "../ports/inbound/for-agent-orchestration.js";
import type { ForAgents } from "../ports/inbound/for-agents.js";
import type { ForFeatures } from "../ports/inbound/for-features.js";
import type { ForPipeline } from "../ports/inbound/for-pipeline.js";
import type { ForProjects } from "../ports/inbound/for-projects.js";
import { loadVerifiedFeatureContext } from "./verified-feature-context.js";

export function createAgentOrchestrationRuntime(deps: {
  readonly agents: ForAgents;
  readonly projects: ForProjects;
  readonly features: ForFeatures;
  readonly pipeline: ForPipeline;
}): ForAgentOrchestration {
  return {
    async advise(input) {
      return createAgentAdvice(await loadState(input));
    },
    async initializationPrompt(input) {
      return createInitializationPrompt(await loadState(input), input);
    },
    async productHandoffPrompt(input) {
      return createProductHandoffPrompt(await loadState(input), input.agentId);
    },
  };

  async function loadState(input: { readonly projectId: Parameters<ForProjects["show"]>[0]; readonly featureId?: Parameters<ForFeatures["show"]>[0] }) {
    const project = await deps.projects.show(input.projectId);
    const projectFeatures = await deps.features.list(project.id);
    const feature = input.featureId === undefined ? uniqueFeature(projectFeatures) : await deps.features.show(input.featureId);
    if (feature !== undefined && !feature.belongsTo(project.id)) throw new Error(`Feature ${feature.id.value} does not belong to Project ${project.id.value}.`);
    const [agents, sessions, report] = await Promise.all([
      deps.agents.list(project),
      deps.agents.sessions(project),
      feature === undefined ? undefined : inspect(feature),
    ]);
    const warnings = input.featureId === undefined && projectFeatures.length > 1
      ? [`${projectFeatures.length} Features existent ; utilise --feature pour choisir explicitement celle à piloter.`]
      : [];
    return { project, ...(feature === undefined ? {} : { feature }), ...(report === undefined ? {} : { report }), agents, sessions, warnings };
  }

  async function inspect(feature: Feature) {
    const { authorRegistry } = await loadVerifiedFeatureContext(feature, deps);
    return deps.pipeline.inspect({
      featureRoot: feature.root,
      featureId: feature.id.value,
      pipelineId: feature.pipelineId,
      authorRegistry,
    });
  }
}

function uniqueFeature(features: readonly Feature[]): Feature | undefined {
  return features.length === 1 ? features[0] : undefined;
}
