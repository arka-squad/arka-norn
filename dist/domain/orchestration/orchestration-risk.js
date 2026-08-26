/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
export const GLOBAL_AUTOMATIC_RISK_CEILING = 20;
export const HARD_DENIALS = [
    "secret_detected",
    "outside_scope",
    "symlink",
    "submodule",
    "git_metadata",
    "missing_proof",
    "undeclared_operation",
];
export function assessRisk(changes, policy, modelAddition = 0) {
    validatePolicy(policy);
    if (changes.length === 0 || changes.length > 10_000)
        throw new TypeError("Risk changes are invalid.");
    if (!Number.isInteger(modelAddition) || modelAddition < 0 || modelAddition > 20)
        throw new TypeError("Model risk addition must be between 0 and 20.");
    const factors = [];
    const denials = new Set();
    for (const change of changes) {
        validateChange(change);
        const category = categoryFor(change.path);
        push(factors, change.path, category.name, category.score + extra(policy, category.name));
        if (change.operation === "delete")
            push(factors, change.path, "deletion", 30 + extra(policy, "deletion"));
        if (change.binary)
            push(factors, change.path, "binary", 40 + extra(policy, "binary"));
        if (change.executableChanged)
            push(factors, change.path, "executable_change", 50 + extra(policy, "executable_change"));
        const churn = Math.min(30, Math.ceil(change.churn / 100));
        if (churn > 0)
            push(factors, change.path, "churn", churn + extra(policy, "churn"));
        if (change.secretDetected)
            denials.add("secret_detected");
        if (change.outsideScope)
            denials.add("outside_scope");
        if (change.symlink)
            denials.add("symlink");
        if (change.submodule)
            denials.add("submodule");
        if (change.gitMetadata || change.path === ".git" || change.path.startsWith(".git/"))
            denials.add("git_metadata");
        if (!change.proofPresent)
            denials.add("missing_proof");
        if (!change.declared)
            denials.add("undeclared_operation");
    }
    const deterministicScore = factors.reduce((total, factor) => total + factor.score, 0);
    const totalScore = deterministicScore + modelAddition;
    const hardDenials = [...denials].sort();
    return Object.freeze({
        deterministicScore,
        modelAddition,
        totalScore,
        hardDenials: Object.freeze(hardDenials),
        factors: Object.freeze(factors.map((factor) => Object.freeze({ ...factor }))),
        automaticEligible: hardDenials.length === 0 && totalScore <= policy.automaticThreshold,
    });
}
function categoryFor(path) {
    const normalized = path.toLowerCase();
    if (normalized.startsWith(".github/") || normalized.startsWith(".gitlab/") || /(?:^|\/)(?:security|release)(?:\/|$)/u.test(normalized))
        return { name: "ci_security_release", score: 50 };
    if (/(?:^|\/)(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.lock)$/u.test(normalized) || /(?:^|\/)(?:package\.json|tsconfig[^/]*\.json|dockerfile|compose\.ya?ml)$/u.test(normalized))
        return { name: "configuration", score: 25 };
    if (/(?:^|\/)(?:test|tests|spec|specs)(?:\/|$)/u.test(normalized) || /\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(normalized))
        return { name: "tests", score: 10 };
    if (/\.(?:md|mdx|txt|adoc|rst)$/u.test(normalized) || normalized.startsWith("docs/"))
        return { name: "documentation", score: 1 };
    return { name: "source", score: 15 };
}
function validatePolicy(value) {
    if (!Number.isInteger(value.automaticThreshold) || value.automaticThreshold < 0 || value.automaticThreshold > GLOBAL_AUTOMATIC_RISK_CEILING)
        throw new TypeError("Automatic risk threshold is invalid.");
    if (value.extraWeights === undefined)
        return;
    for (const [key, weight] of Object.entries(value.extraWeights)) {
        if (!/^[a-z][a-z0-9_]{0,79}$/u.test(key) || !Number.isInteger(weight) || weight < 0 || weight > 100)
            throw new TypeError("Project risk weights may only add bounded risk.");
    }
}
function validateChange(value) {
    if (!safePath(value.path) || !["add", "modify", "delete", "rename"].includes(value.operation))
        throw new TypeError("Risk change path or operation is invalid.");
    if (!Number.isInteger(value.churn) || value.churn < 0 || value.churn > 10_000_000)
        throw new TypeError("Risk change churn is invalid.");
    for (const flag of [value.binary, value.executableChanged, value.secretDetected, value.outsideScope, value.symlink, value.submodule, value.gitMetadata, value.proofPresent, value.declared])
        if (typeof flag !== "boolean")
            throw new TypeError("Risk change flags are invalid.");
}
function safePath(value) { return value.length > 0 && value.length <= 1024 && !value.startsWith("/") && !value.includes("\\") && value.split("/").every((part) => part !== "" && part !== "." && part !== ".."); }
function extra(policy, key) { return policy.extraWeights?.[key] ?? 0; }
function push(factors, path, reason, score) { if (score > 0)
    factors.push({ path, reason, score }); }
//# sourceMappingURL=orchestration-risk.js.map