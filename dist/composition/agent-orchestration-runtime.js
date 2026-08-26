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
import { formatNumber, translate } from "../application/localization/locale.js";
import { assertFeatureContainedInProject, loadVerifiedFeatureContext } from "./verified-feature-context.js";
export function createAgentOrchestrationRuntime(deps) {
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
    async function loadState(input) {
        const project = await deps.projects.show(input.projectId);
        const projectFeatures = await deps.features.list(project.id);
        const feature = input.featureId === undefined ? uniqueFeature(projectFeatures) : await deps.features.show(input.featureId);
        if (feature !== undefined && !feature.belongsTo(project.id))
            throw new Error(`Feature ${feature.id.value} does not belong to Project ${project.id.value}.`);
        const [agents, sessions, preferredSurface] = await Promise.all([
            deps.agents.list(project),
            deps.agents.sessions(project),
            deps.preferredSurface?.(),
        ]);
        const report = feature === undefined ? undefined : await inspect(project, feature, agents);
        const warnings = input.featureId === undefined && projectFeatures.length > 1
            ? [translate("orchestration.warning.chooseFeature", { count: formatNumber(projectFeatures.length) })]
            : [];
        return { project, ...(feature === undefined ? {} : { feature }), ...(report === undefined ? {} : { report }), ...(preferredSurface === undefined ? {} : { preferredSurface }), agents, sessions, warnings };
    }
    async function inspect(project, feature, agents) {
        const authorRegistry = deps.allowEmptyAuthorRegistry === true
            ? webAuthorRegistry(project, feature, agents)
            : (await loadVerifiedFeatureContext(feature, deps)).authorRegistry;
        return deps.pipeline.inspect({
            featureRoot: feature.root,
            featureId: feature.id.value,
            pipelineId: feature.pipelineId,
            documentContractVersion: feature.documentContractVersion,
            authorRegistry,
        });
    }
}
function webAuthorRegistry(project, feature, agents) {
    assertFeatureContainedInProject(feature, project);
    return agents.map((agent) => ({ id: agent.id.value, active: agent.active, authorized: agent.coversFeature(feature.id) }));
}
function uniqueFeature(features) {
    return features.length === 1 ? features[0] : undefined;
}
//# sourceMappingURL=agent-orchestration-runtime.js.map