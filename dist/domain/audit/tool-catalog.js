/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */
export const AUDIT_TOOL_IDS = ["syft", "grype", "trivy", "gitleaks", "k6", "terraform", "node", "python", "go", "rust", "maven", "gradle"];
export const AUDIT_TOOL_CATALOG = Object.freeze([
    tool("syft", ["M04"], "anchore/syft@sha256:678bfa565b60f747aac0f8e964fe5588a24445b8d0a480e91f6efd70020dfbb0", "none"),
    tool("grype", ["M05"], "anchore/grype@sha256:ddf9e9f204049f3a4a0955ef70873cabab6a31432125ad4f20a490b54950a253", "allowlisted"),
    tool("trivy", ["M05", "M08"], "aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969", "allowlisted"),
    tool("gitleaks", ["M05"], "zricethezav/gitleaks@sha256:c00b6bd0aeb3071cbcb79009cb16a60dd9e0a7c60e2be9ab65d25e6bc8abbb7f", "none"),
    tool("k6", ["M03", "M09"], "grafana/k6@sha256:5221b620a4f874faff6e32ba597aa667c058391fe4898b1c6f6377f062c6cdec", "allowlisted"),
    tool("terraform", ["M10"], "hashicorp/terraform@sha256:fd5debae63188975d6febc6aa5bd1a982a588f55e4a4ddb7de28be923f250456", "allowlisted"),
    tool("node", ["M02", "M09"], "node@sha256:0557ac14e0d45d02ed563067b82856ca5e7aa3437fa28d98d4350ea9c3d9494a", "none"),
    tool("python", ["M02"], "python@sha256:62eafe52c91cad83c2c74e630bfde917da8c253673e695665d454def84fc9a13", "none"),
    tool("go", ["M02"], "golang@sha256:1a6d4452c65dea36aac2e2d606b01b4a029ec90cc1ae53890540ce6173ea77ac", "none"),
    tool("rust", ["M02"], "rust@sha256:e70e2eec3d495fd5c8e0be74adda86507dfac7f51a724fbf9813ff59b2b247c7", "none"),
    tool("maven", ["M02"], "maven@sha256:613124833fa6718ded9d655a2ebfab6425818c178f899116b93560b6f1c9ffe9", "none"),
    tool("gradle", ["M02"], "gradle@sha256:66e8f1cd9019bb5dbc9084ebdc1717251db6479ac810ae80fe8fcf236c8d6ce9", "none"),
]);
export function auditToolDefinition(id) {
    const definition = AUDIT_TOOL_CATALOG.find((candidate) => candidate.id === id);
    if (definition === undefined)
        throw new Error(`Unknown audit tool: ${id}`);
    return definition;
}
export function isAuditToolId(value) {
    return typeof value === "string" && AUDIT_TOOL_IDS.includes(value);
}
function tool(id, modules, image, network) {
    return { id, modules, image, network, maximumArguments: 64 };
}
//# sourceMappingURL=tool-catalog.js.map