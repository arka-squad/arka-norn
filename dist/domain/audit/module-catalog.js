/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export const AUDIT_MODULE_CATALOG = Object.freeze([
    { id: "M00", key: "provenance", title: "Scope and provenance", description: "Project, scope, commit, workspace, tools, and sources", dependencies: [], maximumDepth: "inventory", signalIds: [] },
    { id: "M01", key: "git", title: "Repository and history", description: "Git integrity, objects, history, activity, and churn", dependencies: ["M00"], maximumDepth: "static", signalIds: ["git"] },
    { id: "M02", key: "code", title: "Code and tests", description: "Languages, observable quality, tests, and coverage", dependencies: ["M00"], maximumDepth: "dynamic", signalIds: ["source", "tests"] },
    { id: "M03", key: "architecture", title: "Architecture", description: "Components, boundaries, dependencies, flows, and critical points", dependencies: ["M00", "M02"], maximumDepth: "dynamic", signalIds: ["source"] },
    { id: "M04", key: "stack", title: "Technology and dependencies", description: "Runtimes, frameworks, manifests, lockfiles, and SBOM", dependencies: ["M00"], maximumDepth: "connected", signalIds: ["manifest"] },
    { id: "M05", key: "security", title: "Security", description: "Secrets, vulnerabilities, configuration, and supply chain", dependencies: ["M00", "M04"], maximumDepth: "dynamic", signalIds: ["manifest", "security"] },
    { id: "M06", key: "cicd", title: "CI/CD and publishing", description: "Pipelines, permissions, provenance, releases, and deployments", dependencies: ["M00"], maximumDepth: "connected", signalIds: ["cicd"] },
    { id: "M07", key: "observability", title: "Observability", description: "Logs, metrics, traces, alerts, SLOs, and runbooks", dependencies: ["M00"], maximumDepth: "connected", signalIds: ["observability"] },
    { id: "M08", key: "compliance", title: "Compliance and licenses", description: "Licenses, notices, personal data, and applicability", dependencies: ["M00", "M04"], maximumDepth: "connected", signalIds: ["license", "manifest"] },
    { id: "M09", key: "product", title: "Product, concept, and UX", description: "Audience, value, capabilities, journeys, assumptions, and roadmap", dependencies: ["M00"], maximumDepth: "dynamic", signalIds: ["product", "web"] },
    { id: "M10", key: "operations", title: "Operations, infrastructure, and costs", description: "IaC, environments, capacity, operations, and costs", dependencies: ["M00"], maximumDepth: "dynamic", signalIds: ["iac", "containers"] },
    { id: "M11", key: "business", title: "Business risk and sustainability", description: "Continuity, dependencies, supportability, IP, and decisions", dependencies: ["M00"], maximumDepth: "connected", signalIds: ["product"] },
]);
export function auditModuleDefinition(id) {
    const definition = AUDIT_MODULE_CATALOG.find((candidate) => candidate.id === id);
    if (definition === undefined)
        throw new Error(`Unknown audit module: ${id}`);
    return definition;
}
export function expandAuditModuleDependencies(selected) {
    const expanded = new Set(["M00"]);
    const visit = (id) => {
        if (expanded.has(id))
            return;
        for (const dependency of auditModuleDefinition(id).dependencies)
            visit(dependency);
        expanded.add(id);
    };
    for (const id of selected)
        visit(id);
    return AUDIT_MODULE_CATALOG.map((definition) => definition.id).filter((id) => expanded.has(id));
}
//# sourceMappingURL=module-catalog.js.map