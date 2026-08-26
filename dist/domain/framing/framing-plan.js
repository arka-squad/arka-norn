/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0
 */
import { assertPlanDeltaContract } from "./framing-delta-validation.js";
import { sha256 } from "../shared/sha256.js";
export const REPOSITORY_NATURES = ["empty", "skeleton", "implemented", "indeterminate"];
export const KNOWLEDGE_PROVENANCE_KINDS = [
    "human_decision", "agent_deduction", "source_fact", "inventory_fact",
    "technical_design", "recommendation", "open",
];
export const FRAMING_ATTENTIONS = [
    "agent", "human_substance", "human_stabilization", "worker", "complete", "recoverable_failure",
];
export const FRAMING_SECTIONS = [
    "intent.definition", "intent.problem", "intent.desired_effects", "intent.non_negotiable_rules",
    "intent.exact_objective", "intent.capabilities", "intent.included", "intent.excluded",
    "intent.behaviors", "decisions", "evidence.claims", "solution.context", "solution.reuse",
    "solution.design", "solution.risks",
];
export function createFramingPlan(input) {
    assertIdentifier(input.id, "plan id");
    assertTarget(input.target);
    const createdAt = input.now.toISOString();
    const base = {
        schemaVersion: 1,
        id: input.id,
        target: input.target,
        revision: 1,
        previousRevision: null,
        contentLocale: input.contentLocale,
        knowledge: emptyKnowledge(),
        repositoryProbe: input.repositoryProbe,
        decomposition: null,
        stabilizations: { intent: null, groundedPlan: null },
        publication: null,
        createdAt,
        updatedAt: createdAt,
    };
    return withDerivedState(base);
}
export function applyFramingDelta(plan, delta, now) {
    assertPlan(plan);
    assertPlanDeltaContract(delta);
    if (plan.publication !== null || plan.stabilizations.groundedPlan !== null)
        throw new Error("A published or stabilized plan cannot accept new deltas; open a new framing cycle.");
    if (delta.planId !== plan.id)
        throw new Error("Framing delta targets a different plan.");
    if (delta.baseRevision !== plan.revision)
        throw new Error(`Framing revision conflict: expected ${plan.revision}, received ${delta.baseRevision}.`);
    if (delta.operations.length === 0)
        throw new Error("Framing delta must contain at least one operation.");
    const revision = plan.revision + 1;
    let knowledge = cloneKnowledge(plan.knowledge);
    let probe = plan.repositoryProbe;
    let decomposition = plan.decomposition;
    for (const operation of delta.operations) {
        if (operation.op === "upsert_knowledge")
            knowledge = upsertKnowledge(knowledge, operation.section, operation.value, revision);
        else if (operation.op === "supersede_knowledge")
            knowledge = supersedeKnowledge(knowledge, operation.section, operation.id, operation.supersededBy, revision);
        else if (operation.op === "invalidate_evidence")
            knowledge = supersedeKnowledge(knowledge, "evidence.claims", operation.id, operation.supersededBy, revision);
        else if (operation.op === "record_probe") {
            assertProbe(operation.value, plan.target.projectId);
            probe = operation.value;
        }
        else {
            assertDecomposition(plan.target, operation.value);
            decomposition = operation.value;
        }
    }
    return withDerivedState({ ...plan, revision, previousRevision: plan.revision, knowledge, repositoryProbe: probe, decomposition, updatedAt: now.toISOString() });
}
export function stabilizeFramingPlan(plan, kind, actorId, expectedFingerprint, now) {
    assertPlan(plan);
    assertIdentifier(actorId, "actor id");
    const actual = framingPlanFingerprint(plan);
    if (actual !== expectedFingerprint)
        throw new Error("Framing plan changed before stabilization.");
    if (kind === "intent") {
        if (plan.stabilizations.intent !== null)
            throw new Error("Intent stabilization already exists; a third confirmation is forbidden.");
        if (!hasProductSubstance(plan))
            throw new Error("Intent cannot be stabilized before the problem, effect and objective are explicit.");
        return nextRevision(plan, { ...plan.stabilizations, intent: stabilization(kind, plan.revision, actual, actorId, now) }, now);
    }
    if (plan.stabilizations.intent === null)
        throw new Error("Grounded plan stabilization requires the intent stabilization.");
    if (plan.stabilizations.groundedPlan !== null)
        throw new Error("Grounded plan stabilization already exists; a third confirmation is forbidden.");
    if (!canStabilizeGroundedPlan(plan))
        throw new Error("Grounded plan requires verified grounding, a decomposition and no blocking open item.");
    return nextRevision(plan, { ...plan.stabilizations, groundedPlan: stabilization(kind, plan.revision, actual, actorId, now) }, now);
}
export function markFramingPublished(plan, publication, now) {
    if (plan.stabilizations.groundedPlan === null)
        throw new Error("Only a grounded stabilized plan can be published.");
    if (plan.publication !== null) {
        if (plan.publication.fingerprint === publication.fingerprint)
            return plan;
        throw new Error("Framing plan is already published with another fingerprint.");
    }
    return withDerivedState({ ...plan, revision: plan.revision + 1, previousRevision: plan.revision, publication, updatedAt: now.toISOString() });
}
export function framingPlanFingerprint(plan) {
    return sha256(stableJson({
        id: plan.id, target: plan.target, revision: plan.revision, knowledge: plan.knowledge,
        probe: plan.repositoryProbe, decomposition: plan.decomposition, stabilizations: plan.stabilizations,
    }));
}
export function createResumePacket(plan) {
    return {
        schemaVersion: 1,
        planId: plan.id,
        target: plan.target,
        revision: plan.revision,
        summary: humanFramingSummary(plan),
        nextAction: plan.derivedState.nextAction,
        fingerprint: framingPlanFingerprint(plan),
        expiresOnRevisionChange: true,
    };
}
export function humanFramingSummary(plan) {
    const title = plan.target.kind === "project" ? `Project ${plan.target.projectId}` : plan.target.workingTitle;
    const effect = active(plan, "intent.desired_effects")[0]?.statement ?? "expected effect still being framed";
    const last = latestActive(plan)?.statement ?? "no product element established yet";
    return `${title} — objective: ${effect}. Latest established element: ${last}. Next: ${plan.derivedState.nextAction.humanSummary}`;
}
export function assertPlan(plan) {
    assertOnlyKeys(plan, ["schemaVersion", "id", "target", "revision", "previousRevision", "contentLocale", "knowledge", "repositoryProbe", "decomposition", "stabilizations", "publication", "derivedState", "createdAt", "updatedAt"], [], "Framing plan");
    if (plan.schemaVersion !== 1 || !Number.isInteger(plan.revision) || plan.revision < 1)
        throw new Error("Invalid framing plan envelope.");
    if ((plan.revision === 1 && plan.previousRevision !== null) || (plan.revision > 1 && plan.previousRevision !== plan.revision - 1))
        throw new Error("Invalid framing revision lineage.");
    if (!Number.isFinite(Date.parse(plan.createdAt)) || !Number.isFinite(Date.parse(plan.updatedAt)) || Date.parse(plan.updatedAt) < Date.parse(plan.createdAt))
        throw new Error("Invalid framing timestamps.");
    assertIdentifier(plan.id, "plan id");
    assertTarget(plan.target);
    assertProbe(plan.repositoryProbe, plan.target.projectId);
    assertOnlyKeys(plan.knowledge, FRAMING_SECTIONS, [], "Framing knowledge");
    const activeIds = new Set();
    for (const section of FRAMING_SECTIONS)
        for (const item of plan.knowledge[section]) {
            assertKnowledge(item);
            if (item.introducedInRevision > plan.revision || (item.supersededInRevision ?? 0) > plan.revision)
                throw new Error(`Knowledge ${item.id} refers to a future revision.`);
            if (item.status === "active") {
                if (activeIds.has(item.id))
                    throw new Error(`Active knowledge id is ambiguous: ${item.id}.`);
                activeIds.add(item.id);
            }
        }
    for (const section of FRAMING_SECTIONS)
        for (const item of plan.knowledge[section].filter((candidate) => candidate.status === "active")) {
            for (const dependency of item.dependsOn ?? [])
                if (!activeIds.has(dependency))
                    throw new Error(`Knowledge ${item.id} depends on inactive knowledge ${dependency}.`);
        }
    for (const item of plan.knowledge["evidence.claims"].filter((candidate) => candidate.status === "active")) {
        if ((item.provenance.kind === "source_fact" || item.provenance.kind === "inventory_fact")
            && item.provenance.snapshotFingerprint !== plan.repositoryProbe.snapshot.workspaceFingerprint) {
            throw new Error(`Evidence ${item.id} does not belong to the current repository snapshot.`);
        }
        if (item.provenance.kind === "inventory_fact" && item.provenance.inventoryFingerprint !== plan.repositoryProbe.inventoryFingerprint) {
            throw new Error(`Inventory evidence ${item.id} does not belong to the current inventory.`);
        }
    }
    if (plan.decomposition !== null)
        assertDecomposition(plan.target, plan.decomposition);
    assertStabilizations(plan);
    assertPublication(plan);
    assertOnlyKeys(plan.derivedState, ["repositoryNature", "productClarity", "grounding", "planAuthority", "recommendedPipelineId", "nextAction"], [], "Framing derived state");
    assertOnlyKeys(plan.derivedState.nextAction, ["kind", "attention", "humanSummary"], ["workerRole"], "Framing action");
    const expected = deriveState(plan);
    if (stableJson(expected) !== stableJson(plan.derivedState))
        throw new Error("Framing derived state does not match its source data.");
}
function nextRevision(plan, stabilizations, now) {
    return withDerivedState({ ...plan, revision: plan.revision + 1, previousRevision: plan.revision, stabilizations, updatedAt: now.toISOString() });
}
function withDerivedState(plan) {
    const source = plan;
    const complete = { ...source, derivedState: undefined };
    return { ...source, derivedState: deriveState(complete) };
}
function deriveState(plan) {
    const nature = plan.repositoryProbe.nature;
    const intent = plan.stabilizations.intent;
    const grounded = isGrounded(plan);
    const blocked = active(plan, "decisions").some((item) => item.provenance.kind === "open" && item.blocksProgress === true);
    let grounding = intent === null ? "pending" : grounded ? "complete" : nature === "indeterminate" ? "degraded" : "in_progress";
    if (nature === "empty" && intent === null)
        grounding = "not_applicable";
    const authority = nature === "indeterminate" && intent !== null
        ? "degraded" : plan.stabilizations.groundedPlan !== null ? "consumable" : grounded ? "grounded" : intent !== null ? "intent_stabilized" : "conversational";
    return {
        repositoryNature: nature,
        productClarity: intent === null ? "emerging" : "stabilized",
        grounding,
        planAuthority: authority,
        recommendedPipelineId: recommendedPipeline(plan),
        nextAction: nextAction(plan, grounded, blocked),
    };
}
function nextAction(plan, grounded, blocked) {
    if (plan.publication !== null)
        return { kind: "framing_complete", attention: "complete", humanSummary: "The published plan is ready for delivery." };
    if (plan.stabilizations.groundedPlan !== null)
        return { kind: "publish_plan", attention: "agent", humanSummary: "Publish the stabilized revision." };
    if (plan.stabilizations.intent === null)
        return hasProductSubstance(plan)
            ? { kind: "stabilize_intent", attention: "human_stabilization", humanSummary: "Review the established intent and authorize technical grounding." }
            : { kind: "continue_conversation", attention: "agent", humanSummary: "Continue clarifying the problem, expected effect and objective." };
    if (blocked)
        return { kind: "resolve_substance", attention: "human_substance", humanSummary: "Resolve the product substance that cannot be inferred." };
    if (!grounded) {
        if (plan.repositoryProbe.nature === "indeterminate")
            return { kind: "recover_repository_probe", attention: "recoverable_failure", humanSummary: "Restore repository observability before making broad claims." };
        if (plan.repositoryProbe.nature === "empty")
            return { kind: "design_greenfield", attention: "worker", workerRole: "technical_designer", humanSummary: "Design the technical response without pretending to inspect an existing implementation." };
        return { kind: plan.repositoryProbe.nature === "skeleton" ? "read_constraints" : "read_code_blind", attention: "worker", workerRole: "technical_reader", humanSummary: "Confront the intent with the available technical material." };
    }
    if (plan.decomposition === null)
        return { kind: "prepare_decomposition", attention: "agent", humanSummary: "Split the plan into cohesive product units." };
    const pipeline = recommendedPipeline(plan);
    return { kind: "stabilize_grounded_plan", attention: "human_stabilization", humanSummary: pipeline === null ? "The grounded plan can be stabilized and published." : `The grounded plan and ${pipeline} delivery route can be stabilized and published.` };
}
function recommendedPipeline(plan) {
    if (plan.target.kind !== "feature" || plan.decomposition?.kind !== "feature_lots")
        return null;
    const hasRisk = active(plan, "solution.risks").length > 0;
    return hasRisk || plan.decomposition.lots.length >= 4 ? "arka-norn-complete-2.3" : "arka-norn-essential-2.3";
}
function hasProductSubstance(plan) {
    return active(plan, "intent.problem").length > 0 && active(plan, "intent.desired_effects").length > 0 && active(plan, "intent.exact_objective").length > 0;
}
function isGrounded(plan) {
    if (plan.stabilizations.intent === null || plan.repositoryProbe.nature === "indeterminate")
        return false;
    const design = active(plan, "solution.design");
    if (plan.repositoryProbe.nature === "empty")
        return design.some((item) => item.provenance.kind === "technical_design");
    const facts = active(plan, "evidence.claims");
    return facts.some((item) => (item.provenance.kind === "source_fact" || item.provenance.kind === "inventory_fact")
        && item.provenance.snapshotFingerprint === plan.repositoryProbe.snapshot.workspaceFingerprint) && design.length > 0;
}
function canStabilizeGroundedPlan(plan) {
    return isGrounded(plan) && plan.decomposition !== null
        && !active(plan, "decisions").some((item) => item.provenance.kind === "open" && item.blocksProgress === true);
}
function active(plan, section) {
    return plan.knowledge[section].filter((item) => item.status === "active");
}
function latestActive(plan) {
    return FRAMING_SECTIONS.flatMap((section) => active(plan, section)).sort((left, right) => right.introducedInRevision - left.introducedInRevision)[0];
}
function emptyKnowledge() {
    return Object.fromEntries(FRAMING_SECTIONS.map((section) => [section, []]));
}
function cloneKnowledge(source) {
    return Object.fromEntries(FRAMING_SECTIONS.map((section) => [section, [...source[section]]]));
}
function upsertKnowledge(knowledge, section, input, revision) {
    assertIdentifier(input.id, "knowledge id");
    if (input.statement.trim().length === 0)
        throw new Error("Knowledge statement cannot be empty.");
    const item = { ...input, statement: input.statement.trim(), status: "active", introducedInRevision: revision, supersededInRevision: null, supersededBy: null };
    assertKnowledge(item);
    const current = knowledge[section];
    const existing = current.find((candidate) => candidate.id === item.id && candidate.status === "active");
    if (existing !== undefined && stableJson({ statement: existing.statement, provenance: existing.provenance, blocksProgress: existing.blocksProgress, dependsOn: existing.dependsOn }) === stableJson({ statement: item.statement, provenance: item.provenance, blocksProgress: item.blocksProgress, dependsOn: item.dependsOn }))
        return knowledge;
    const replaced = current.map((candidate) => candidate.id === item.id && candidate.status === "active" ? { ...candidate, status: "superseded", supersededInRevision: revision, supersededBy: item.id } : candidate);
    return { ...knowledge, [section]: [...replaced, item] };
}
function supersedeKnowledge(knowledge, section, id, supersededBy, revision) {
    assertIdentifier(supersededBy, "replacement id");
    let found = false;
    const values = knowledge[section].map((item) => {
        if (item.id !== id || item.status !== "active")
            return item;
        found = true;
        return { ...item, status: "superseded", supersededInRevision: revision, supersededBy };
    });
    if (!found)
        throw new Error(`Active framing knowledge not found: ${section}/${id}.`);
    return cascadeInvalidation({ ...knowledge, [section]: values }, new Set([id]), supersededBy, revision);
}
function cascadeInvalidation(knowledge, invalidated, supersededBy, revision) {
    let changed = true;
    let result = knowledge;
    while (changed) {
        changed = false;
        for (const candidateSection of FRAMING_SECTIONS) {
            const values = result[candidateSection].map((item) => {
                if (item.status !== "active" || !(item.dependsOn ?? []).some((dependency) => invalidated.has(dependency)))
                    return item;
                invalidated.add(item.id);
                changed = true;
                return { ...item, status: "superseded", supersededInRevision: revision, supersededBy };
            });
            if (changed)
                result = { ...result, [candidateSection]: values };
        }
    }
    return result;
}
function assertKnowledge(item) {
    assertOnlyKeys(item, ["id", "statement", "provenance", "status", "introducedInRevision", "supersededInRevision", "supersededBy"], ["blocksProgress", "dependsOn"], "Framing knowledge item");
    assertIdentifier(item.id, "knowledge id");
    if (item.statement.trim().length === 0 || item.statement.length > 4_000 || !KNOWLEDGE_PROVENANCE_KINDS.includes(item.provenance.kind))
        throw new Error(`Invalid framing knowledge ${item.id}.`);
    if (item.provenance.reference.trim().length === 0 || item.provenance.reference.length > 512)
        throw new Error(`Invalid provenance reference for ${item.id}.`);
    if (item.status === "active" && (item.supersededInRevision !== null || item.supersededBy !== null))
        throw new Error(`Active knowledge ${item.id} cannot be superseded.`);
    if (item.status === "superseded" && (item.supersededInRevision === null || item.supersededBy === null))
        throw new Error(`Superseded knowledge ${item.id} requires its replacement.`);
    for (const dependency of item.dependsOn ?? [])
        assertIdentifier(dependency, "knowledge dependency");
    const provenance = item.provenance;
    assertOnlyKeys(provenance, ["kind", "reference"], ["snapshotFingerprint", "path", "lineStart", "lineEnd", "inventoryFingerprint"], "Knowledge provenance");
    if (provenance.kind === "source_fact" && (provenance.snapshotFingerprint === undefined || provenance.path === undefined || provenance.lineStart === undefined)) {
        throw new Error(`Source fact ${item.id} requires snapshot, path and line.`);
    }
    if (provenance.kind === "source_fact") {
        if (!/^[a-f0-9]{64}$/u.test(provenance.snapshotFingerprint) || provenance.path.startsWith("/") || provenance.path.split(/[\\/]/u).includes("..")
            || (provenance.lineEnd !== undefined && provenance.lineEnd < provenance.lineStart))
            throw new Error(`Source fact ${item.id} has an invalid source anchor.`);
    }
    if (provenance.kind === "inventory_fact" && (provenance.snapshotFingerprint === undefined || provenance.inventoryFingerprint === undefined)) {
        throw new Error(`Inventory fact ${item.id} requires snapshot and inventory fingerprint.`);
    }
    if (provenance.kind === "inventory_fact" && (!/^[a-f0-9]{64}$/u.test(provenance.snapshotFingerprint) || !/^[a-f0-9]{64}$/u.test(provenance.inventoryFingerprint)))
        throw new Error(`Inventory fact ${item.id} has invalid fingerprints.`);
}
function assertTarget(target) {
    assertOnlyKeys(target, target.kind === "feature"
        ? ["kind", "projectId", "framingId", "origin", "featureId", "workingTitle"]
        : ["kind", "projectId", "framingId"], [], "Framing target");
    assertIdentifier(target.projectId, "project id");
    assertIdentifier(target.framingId, "framing id");
    if (target.kind === "feature") {
        if (target.workingTitle.trim().length === 0)
            throw new Error("Feature framing requires a working title.");
        if (target.origin === "existing" && target.featureId === null)
            throw new Error("Existing Feature framing requires feature id.");
        if (target.featureId !== null)
            assertIdentifier(target.featureId, "feature id");
    }
}
function assertProbe(probe, projectId) {
    assertOnlyKeys(probe, ["schemaVersion", "projectId", "projectRoot", "scopePaths", "nature", "snapshot", "inventory", "inventoryFingerprint", "reasons", "observedAt"], [], "Repository probe");
    assertOnlyKeys(probe.snapshot, ["gitCommit", "workspaceFingerprint"], [], "Repository snapshot");
    assertOnlyKeys(probe.inventory, ["files", "sourceFiles", "testFiles", "manifestFiles", "constraintFiles", "symlinks", "submodules", "truncated", "ignoredRoots"], [], "Repository inventory");
    for (const reason of probe.reasons)
        assertOnlyKeys(reason, ["code", "evidenceRef"], [], "Repository probe reason");
    if (probe.schemaVersion !== 1 || probe.projectId !== projectId || !REPOSITORY_NATURES.includes(probe.nature))
        throw new Error("Invalid repository probe.");
    if (probe.inventory.files < 0 || probe.inventory.sourceFiles < 0)
        throw new Error("Repository probe counts cannot be negative.");
    if (!/^[a-f0-9]{64}$/u.test(probe.inventoryFingerprint) || !/^[a-f0-9]{64}$/u.test(probe.snapshot.workspaceFingerprint))
        throw new Error("Repository probe fingerprints are invalid.");
}
function assertDecomposition(target, decomposition) {
    assertOnlyKeys(decomposition, ["kind", decomposition.kind === "project_features" ? "features" : "lots"], [], "Framing decomposition");
    if (target.kind === "project" && decomposition.kind !== "project_features")
        throw new Error("A Project framing must decompose into Features.");
    if (target.kind === "feature" && decomposition.kind !== "feature_lots")
        throw new Error("A Feature framing must decompose into Lots.");
    const entries = decomposition.kind === "project_features" ? decomposition.features : decomposition.lots;
    if (entries.length === 0 || entries.length > 100)
        throw new Error("Framing decomposition must contain 1..100 entries.");
    const ids = entries.map((entry) => decomposition.kind === "project_features" ? entry.candidateId : entry.id);
    for (const id of ids)
        assertIdentifier(id, "decomposition id");
    if (new Set(ids).size !== ids.length)
        throw new Error("Framing decomposition identifiers must be unique.");
    const known = new Set(ids);
    for (const entry of entries) {
        const id = decomposition.kind === "project_features" ? entry.candidateId : entry.id;
        for (const dependency of entry.dependsOn) {
            assertIdentifier(dependency, "decomposition dependency");
            if (!known.has(dependency) || dependency === id)
                throw new Error(`Invalid dependency ${dependency} for ${id}.`);
        }
    }
    assertAcyclic(entries.map((entry) => ({
        id: decomposition.kind === "project_features" ? entry.candidateId : entry.id,
        dependencies: entry.dependsOn,
    })));
    if (decomposition.kind === "project_features") {
        for (const feature of decomposition.features) {
            assertOnlyKeys(feature, ["candidateId", "title", "observableOutcome", "acceptanceScenario", "included", "excluded", "dependsOn", "cohesionRationale"], [], "Feature candidate");
            assertText(feature.title, "Feature title");
            assertText(feature.observableOutcome, "Feature outcome");
            assertText(feature.acceptanceScenario, "Feature acceptance scenario");
            assertText(feature.cohesionRationale, "Feature cohesion rationale");
            for (const statement of [...feature.included, ...feature.excluded])
                assertText(statement, "Feature boundary");
        }
        return;
    }
    for (const lot of decomposition.lots) {
        assertOnlyKeys(lot, ["id", "title", "objective", "observableEffect", "readScopes", "writeScopes", "dependsOn", "acceptanceProofs"], [], "Feature Lot");
        assertOnlyKeys(lot.acceptanceProofs, ["functional", "ux", "code", "security"], [], "Lot acceptance proofs");
        assertText(lot.title, "Lot title");
        assertText(lot.objective, "Lot objective");
        assertText(lot.observableEffect, "Lot observable effect");
        if (lot.writeScopes.length === 0)
            throw new Error(`Lot ${lot.id} requires at least one write scope.`);
        for (const scope of [...lot.readScopes, ...lot.writeScopes])
            assertSafeScope(scope);
        const proofs = Object.values(lot.acceptanceProofs).flat();
        if (proofs.length === 0)
            throw new Error(`Lot ${lot.id} requires at least one acceptance proof.`);
        for (const proof of proofs)
            assertText(proof, "Lot acceptance proof");
    }
}
function assertAcyclic(entries) {
    const visiting = new Set();
    const visited = new Set();
    const byId = new Map(entries.map((entry) => [entry.id, entry.dependencies]));
    const visit = (id) => {
        if (visiting.has(id))
            throw new Error(`Framing decomposition contains a dependency cycle at ${id}.`);
        if (visited.has(id))
            return;
        visiting.add(id);
        for (const dependency of byId.get(id) ?? [])
            visit(dependency);
        visiting.delete(id);
        visited.add(id);
    };
    for (const entry of entries)
        visit(entry.id);
}
function assertSafeScope(value) {
    if (value !== "." && (value.length === 0 || value.length > 512 || value.startsWith("/") || value.includes("\\")
        || value.split("/").some((part) => part === "" || part === "." || part === "..")))
        throw new Error(`Unsafe framing scope: ${value}.`);
}
function assertText(value, field) {
    if (typeof value !== "string" || value.trim().length === 0 || value.length > 4_000)
        throw new Error(`${field} must contain 1..4000 characters.`);
}
function assertStabilizations(plan) {
    assertOnlyKeys(plan.stabilizations, ["intent", "groundedPlan"], [], "Framing stabilizations");
    for (const [expected, stabilization] of [["intent", plan.stabilizations.intent], ["grounded_plan", plan.stabilizations.groundedPlan]]) {
        if (stabilization === null)
            continue;
        assertOnlyKeys(stabilization, ["kind", "revision", "fingerprint", "actorId", "confirmedAt"], [], "Framing stabilization");
        if (stabilization.kind !== expected || stabilization.revision > plan.revision || !/^[a-f0-9]{64}$/u.test(stabilization.fingerprint) || !Number.isFinite(Date.parse(stabilization.confirmedAt)))
            throw new Error(`Invalid ${expected} stabilization.`);
    }
    if (plan.stabilizations.groundedPlan !== null && plan.stabilizations.intent === null)
        throw new Error("Grounded stabilization requires intent stabilization.");
}
function assertPublication(plan) {
    if (plan.publication === null)
        return;
    assertOnlyKeys(plan.publication, ["revision", "fingerprint", "relativePath", "publishedAt"], [], "Framing publication");
    if (plan.stabilizations.groundedPlan === null || plan.publication.revision >= plan.revision || !/^[a-f0-9]{64}$/u.test(plan.publication.fingerprint)
        || !plan.publication.relativePath.startsWith(".arka-norn/plans/") || !Number.isFinite(Date.parse(plan.publication.publishedAt)))
        throw new Error("Invalid framing publication.");
}
function assertOnlyKeys(value, required, optional, label) {
    const keys = Object.keys(value);
    if (required.some((key) => !(key in value)) || keys.some((key) => !required.includes(key) && !optional.includes(key)))
        throw new Error(`${label} has missing or unknown properties.`);
}
function stabilization(kind, revision, fingerprint, actorId, now) {
    return { kind, revision, fingerprint, actorId, confirmedAt: now.toISOString() };
}
function assertIdentifier(value, field) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/.test(value))
        throw new Error(`Invalid ${field}.`);
}
function stableJson(value) {
    if (Array.isArray(value))
        return `[${value.map(stableJson).join(",")}]`;
    if (typeof value === "object" && value !== null) {
        return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
    }
    return JSON.stringify(value);
}
//# sourceMappingURL=framing-plan.js.map