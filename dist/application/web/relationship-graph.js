/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
export function buildProjectRelationshipGraph(project, features, governance, agents) {
    const nodes = [{ id: `project:${project.id.value}`, kind: "project", label: project.name }];
    const edges = [];
    for (const feature of features) {
        const featureNode = `feature:${feature.id}`;
        nodes.push({ id: featureNode, kind: "feature", label: feature.name, status: feature.status, featureId: feature.id });
        edges.push(edge("contains", `project:${project.id.value}`, featureNode));
        for (const step of feature.steps) {
            const stepNode = `step:${feature.id}:${step.id}`;
            nodes.push({ id: stepNode, kind: "step", label: step.id, status: step.status, featureId: feature.id });
            edges.push(edge("contains", featureNode, stepNode));
        }
        for (const document of feature.documents) {
            const documentNode = `document:${document.id}`;
            nodes.push({ id: documentNode, kind: "document", label: document.title, status: document.valid ? "valid" : "invalid", featureId: feature.id });
            edges.push(edge("produced", `step:${feature.id}:${document.stepId}`, documentNode));
            for (const dependency of document.dependencies)
                edges.push(edge("depends_on", documentNode, `document:${dependency.id}`, !dependency.resolved));
            if (document.authorAgentId !== undefined)
                edges.push(edge("authored_by", documentNode, `agent:${document.authorAgentId}`));
        }
    }
    for (const agent of agents)
        nodes.push({ id: `agent:${agent.id}`, kind: "agent", label: `${agent.provider} · ${agent.role}`, status: agent.active ? "active" : "inactive" });
    for (const decision of governance.history) {
        nodes.push({ id: `decision:${decision.id}`, kind: "decision", label: decision.reason, status: decision.kind });
        for (const target of decision.targets)
            edges.push(edge("targets", `decision:${decision.id}`, `${target.type}:${target.id}`));
    }
    return { nodes, edges, anomalies: features.flatMap((feature) => feature.anomalies) };
}
function edge(kind, source, target, broken = false) {
    return { id: `${kind}:${source}:${target}`, source, target, kind, ...(broken ? { broken: true } : {}) };
}
//# sourceMappingURL=relationship-graph.js.map