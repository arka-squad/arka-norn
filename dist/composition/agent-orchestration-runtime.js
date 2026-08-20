import { createAgentAdvice, createInitializationPrompt, createProductHandoffPrompt } from "../application/agents/agent-orchestration.js";
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
        const projectFeatures = (await deps.features.list()).filter((feature) => feature.belongsTo(project.id));
        const feature = input.featureId === undefined ? uniqueFeature(projectFeatures) : await deps.features.show(input.featureId);
        if (feature !== undefined && !feature.belongsTo(project.id))
            throw new Error(`Feature ${feature.id.value} does not belong to Project ${project.id.value}.`);
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
    async function inspect(feature) {
        const project = await deps.projects.show(feature.projectId);
        const agents = await deps.agents.list(project);
        return deps.pipeline.inspect({
            featureRoot: feature.root,
            featureId: feature.id.value,
            pipelineId: feature.pipelineId,
            authorRegistry: agents.map((agent) => ({ id: agent.id.value, active: agent.active, authorized: agent.coversFeature(feature.id) })),
        });
    }
}
function uniqueFeature(features) {
    return features.length === 1 ? features[0] : undefined;
}
//# sourceMappingURL=agent-orchestration-runtime.js.map