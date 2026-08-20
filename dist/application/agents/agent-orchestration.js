import { AgentSessionId, deriveAgentSessionId } from "../../domain/agent/agent-session-id.js";
import { InvalidAgentOptionError } from "../../domain/errors.js";
const ROLE_POLICIES = {
    product: { role: "product", skill: "arka-product", profile: "product" },
    architecte: { role: "architecte", skill: "arka-framework-maitrise", profile: "architecture" },
    audit: { role: "audit", skill: "arka-framework-audit", profile: "audit" },
    dev: { role: "dev", skill: "arka-framework-dev", profile: "dev" },
    qa: { role: "qa", skill: "arka-framework-recette-qa", profile: "qa" },
};
const STEP_ROLES = {
    concept: "product",
    cadrage_rework: "product",
    plan: "product",
    registre_dettes: "product",
    tache_agent: "product",
    annexe_contrat_technique: "architecte",
    invariants_figes: "architecte",
    spec_integration_technique: "architecte",
    audit_etat_reel: "audit",
    audit_rework: "audit",
    cr_dev: "dev",
    recette_qa: "qa",
    validation_fastdev: "qa",
};
export function createAgentAdvice(state) {
    const next = state.report?.nextActions[0];
    const requiredRole = next === undefined ? undefined : roleForStep(next.stepId);
    const product = resolveProductPrincipal(state);
    const featureId = state.feature?.id.value;
    const recommendations = featureId === undefined || next === undefined || requiredRole === undefined
        ? []
        : recommendationsFor(requiredRole, next.stepId, state.feature);
    const warnings = [...(state.warnings ?? [])];
    if (state.feature === undefined)
        warnings.push("Aucune Feature unique n'est sélectionnée ; le Product doit choisir ou créer la priorité avant de lancer un profil spécialisé.");
    if (product.status !== "ready")
        warnings.push(product.reason);
    return {
        schemaVersion: 1,
        projectId: state.project.id.value,
        ...(featureId === undefined ? {} : { featureId }),
        ...(state.feature === undefined ? {} : { pipelineId: state.feature.pipelineId }),
        phase: next?.phase ?? (state.report?.overallStatus === "completed" ? "Clôture" : "Organisation Project"),
        ...(next === undefined ? {} : { nextStepId: next.stepId }),
        productPrincipal: product,
        productNextAction: productNextAction(state, requiredRole, next?.stepId),
        recommendations,
        handoffPromptCommand: `arka-norn agent handoff-prompt --project ${state.project.id.value}${featureId === undefined ? "" : ` --feature ${featureId}`}`,
        warnings,
    };
}
export function createInitializationPrompt(state, input) {
    const feature = state.feature;
    const policy = policyFor(input.role, feature);
    if (input.role !== "product" && feature === undefined)
        throw new InvalidAgentOptionError("feature", `le rôle ${input.role} exige une Feature explicite`);
    const next = state.report?.nextActions[0];
    const requiredRole = next === undefined ? undefined : roleForStep(next.stepId);
    const advised = feature === undefined || next === undefined || requiredRole === undefined
        ? undefined
        : recommendationsFor(requiredRole, next.stepId, feature).find((item) => item.role === input.role);
    const mode = input.mode ?? advised?.mode ?? (input.role === "product" && requiredRole === "product" ? "execute" : "prepare");
    if (mode === "execute" && (next === undefined || requiredRole !== input.role)) {
        throw new InvalidAgentOptionError("mode", `le rôle ${input.role} ne peut pas exécuter l'étape ${next?.stepId ?? "aucune"}; génère un prompt en mode prepare`);
    }
    const sessionId = input.role === "product"
        ? AgentSessionId.MAIN
        : input.sessionId ?? deriveAgentSessionId(input.role, feature.id.value);
    if (input.role === "product" && input.sessionId !== undefined && !input.sessionId.equals(AgentSessionId.MAIN)) {
        throw new InvalidAgentOptionError("session", "le Product principal utilise toujours la session main");
    }
    const canWrite = mode === "execute";
    return {
        schemaVersion: 1,
        projectId: state.project.id.value,
        ...(feature === undefined ? {} : { featureId: feature.id.value }),
        role: input.role,
        mode,
        sessionId: sessionId.value,
        skill: policy.skill,
        skillProfile: policy.profile,
        canWrite,
        ...(canWrite && next !== undefined ? { expectedStepId: next.stepId } : {}),
        prompt: renderInitializationPrompt(state, input.provider, policy, sessionId, mode, canWrite ? next?.stepId : undefined),
    };
}
export function createProductHandoffPrompt(state, requestedAgentId) {
    const product = resolveProductPrincipal(state);
    const agent = requestedAgentId === undefined
        ? product.agentId === undefined ? undefined : state.agents.find((candidate) => candidate.id.value === product.agentId)
        : state.agents.find((candidate) => candidate.id.value === requestedAgentId);
    if (agent === undefined)
        throw new InvalidAgentOptionError("product", "aucun Agent product principal actif n'est disponible pour la reprise");
    if (!agent.active || roleCategory(agent.role) !== "product")
        throw new InvalidAgentOptionError("product", `l'Agent ${agent.id.value} n'est pas un Product principal actif`);
    const advice = createAgentAdvice(state);
    const feature = state.feature;
    const documents = state.report?.steps.flatMap((step) => step.documents.filter((document) => document.valid).map((document) => document.filePath)) ?? [];
    const sessionLines = state.sessions.map((binding) => `- ${binding.sessionId.value}: ${binding.agent.id.value} (${binding.agent.role}, ${binding.agent.active ? "actif" : "inactif"})`);
    const prompt = [
        "Utilise $arka-norn puis $arka-product pour reprendre la session Product principale sans créer une nouvelle identité.",
        "",
        "CONTEXTE DE REPRISE — vérifier chaque valeur avec la CLI avant toute mutation",
        `- Project: ${state.project.id.value}`,
        `- Racine: ${state.project.root}`,
        `- Session: main`,
        `- Agent Product à réutiliser: ${agent.id.value}`,
        ...(feature === undefined ? ["- Feature: aucune Feature unique sélectionnée"] : [`- Feature: ${feature.id.value}`, `- Workflow: ${feature.pipelineId}`]),
        `- Phase observée: ${advice.phase}`,
        `- Prochaine étape observée: ${advice.nextStepId ?? "aucune"}`,
        `- Prochaine responsabilité Product: ${advice.productNextAction}`,
        "",
        "SESSIONS AGENT OBSERVÉES",
        ...(sessionLines.length === 0 ? ["- aucune"] : sessionLines),
        "",
        "DOCUMENTS VALIDES À RELIRE",
        ...(documents.length === 0 ? ["- aucun"] : documents.map((file) => `- ${file}`)),
        "",
        "PROCÉDURE OBLIGATOIRE",
        `1. Exécute arka-norn agent use ${agent.id.value} --project ${state.project.id.value} --session main.`,
        `2. Confirme avec arka-norn agent current --project ${state.project.id.value} --session main.`,
        "3. Lance arka-norn doctor et traite tout FAIL avant la suite.",
        ...(feature === undefined ? ["4. Liste les Features et demande laquelle piloter si le choix n'est pas univoque."] : [
            `4. Lance arka-norn pipeline status ${feature.id.value} puis arka-norn pipeline next ${feature.id.value}.`,
            `5. Lance arka-norn agent advise --project ${state.project.id.value} --feature ${feature.id.value}.`,
        ]),
        "6. Reste dans le rôle product : organisation, décisions produit, priorisation et passations. Ne réalise pas l'audit, le développement ou la QA à la place des profils dédiés.",
        "7. Résume l'état vérifié, conseille la suite et fournis les prompts des agents à lancer. Ne te fie pas à ce prompt si la CLI le contredit.",
    ].join("\n");
    return {
        schemaVersion: 1,
        projectId: state.project.id.value,
        ...(feature === undefined ? {} : { featureId: feature.id.value }),
        sessionId: "main",
        agentId: agent.id.value,
        prompt,
    };
}
export function parseOrchestratedRole(value) {
    const normalized = value.trim().toLowerCase();
    if (normalized === "architect" || normalized === "architecture")
        return "architecte";
    if (normalized === "product" || normalized === "audit" || normalized === "dev" || normalized === "qa" || normalized === "architecte")
        return normalized;
    throw new Error(`Rôle non orchestré : ${value}. Utilise product, architecte, audit, dev ou qa.`);
}
function resolveProductPrincipal(state) {
    const main = state.sessions.find((binding) => binding.sessionId.equals(AgentSessionId.MAIN));
    if (main !== undefined) {
        if (main.agent.active && roleCategory(main.agent.role) === "product") {
            return { sessionId: "main", status: "ready", agentId: main.agent.id.value, reason: "Le Product principal est actif et lié à la session main." };
        }
        return { sessionId: "main", status: "conflict", agentId: main.agent.id.value, reason: `La session main pointe vers ${main.agent.id.value} (${main.agent.role}) au lieu d'un Product actif.` };
    }
    const products = state.agents.filter((agent) => agent.active && roleCategory(agent.role) === "product");
    if (products.length === 1)
        return { sessionId: "main", status: "unbound", agentId: products[0].id.value, reason: `Le Product ${products[0].id.value} doit être lié à la session main.` };
    if (products.length === 0)
        return { sessionId: "main", status: "missing", reason: "Aucun Agent product actif n'est enregistré ; le premier Agent du Project doit prendre ce rôle." };
    return { sessionId: "main", status: "conflict", reason: `${products.length} Agents product actifs existent sans liaison main ; une décision humaine est requise.` };
}
function productNextAction(state, requiredRole, stepId) {
    const product = resolveProductPrincipal(state);
    if (product.status === "missing")
        return `Enregistrer le Product principal avec arka-norn agent register --project ${state.project.id.value} --provider <provider> --role product --session main.`;
    if (product.status === "unbound" && product.agentId !== undefined)
        return `Lier ${product.agentId} avec arka-norn agent use ${product.agentId} --project ${state.project.id.value} --session main.`;
    if (product.status === "conflict")
        return product.reason;
    if (state.feature === undefined)
        return "Choisir, créer ou importer la Feature prioritaire avant de mobiliser un profil spécialisé.";
    if (state.report?.overallStatus === "completed")
        return "Vérifier les handoffs, clôturer la Feature et choisir la prochaine priorité produit.";
    if (requiredRole === "product")
        return `Exécuter ${stepId ?? "la prochaine étape"} dans la session Product principale, puis recalculer le conseil.`;
    return `Conserver le pilotage Product et lancer le profil ${requiredRole ?? "requis"} pour ${stepId ?? "la prochaine étape"}.`;
}
function recommendationsFor(requiredRole, stepId, feature) {
    if (requiredRole === "product")
        return [];
    const recommendations = [recommendation(requiredRole, "execute", stepId, feature)];
    if (["audit", "architecte"].includes(requiredRole))
        recommendations.push(recommendation("dev", "prepare", stepId, feature));
    if (requiredRole === "dev")
        recommendations.push(recommendation("qa", "prepare", stepId, feature));
    return recommendations;
}
function recommendation(role, mode, stepId, feature) {
    const policy = policyFor(role, feature);
    const sessionId = deriveAgentSessionId(role, feature.id.value).value;
    const reason = mode === "execute"
        ? `${role} est le profil responsable de l'étape ${stepId}.`
        : `${role} peut lire le contexte et préparer ses questions en parallèle, sans produire de document ni modifier le code.`;
    return {
        role,
        mode,
        canWrite: mode === "execute",
        sessionId,
        skill: policy.skill,
        skillProfile: policy.profile,
        reason,
        command: `arka-norn agent prompt ${role} --project ${feature.projectId.value} --feature ${feature.id.value} --mode ${mode}`,
    };
}
function policyFor(role, feature) {
    if (feature?.pipelineId === "arka-norn-fastdev" && ["audit", "dev", "qa"].includes(role)) {
        return { role, skill: "arka-fastdev", profile: role };
    }
    return ROLE_POLICIES[role];
}
function renderInitializationPrompt(state, provider, policy, sessionId, mode, expectedStepId) {
    const feature = state.feature;
    const providerValue = provider ?? "<provider-observé>";
    const featureOption = feature === undefined ? "" : ` --features ${feature.id.value}`;
    const register = `arka-norn agent register --project ${state.project.id.value} --provider ${shellQuote(providerValue)} --role ${policy.role}${featureOption} --responsibilities ${shellQuote(responsibilities(policy.role))} --session ${sessionId.value}`;
    const permission = mode === "execute"
        ? `Tu peux produire uniquement ${expectedStepId}. Vérifie que pipeline next retourne encore cette étape avant toute écriture.`
        : "Travail en lecture seule : analyse, dépendances, questions et risques. Ne modifie aucun fichier et ne produis aucun document Pipeline ou CR.";
    return [
        `Utilise $arka-norn puis $${policy.skill} pour initialiser cette session Agent ${policy.role}.`,
        "",
        "CONTEXTE FOURNI — le vérifier avec arka-norn, ne jamais le deviner",
        `- Project: ${state.project.id.value}`,
        `- Racine Project: ${state.project.root}`,
        ...(feature === undefined ? [] : [`- Feature: ${feature.id.value}`, `- Racine Feature: ${feature.root}`, `- Workflow: ${feature.pipelineId}`]),
        `- Rôle: ${policy.role}`,
        `- Session isolée: ${sessionId.value}`,
        `- Mode: ${mode}`,
        `- Étape attendue: ${expectedStepId ?? "aucune écriture autorisée"}`,
        "",
        "RÈGLES DE SESSION",
        `- Utilise --session ${sessionId.value} sur chaque commande agent ; ne sélectionne et ne remplace jamais l'Agent Product de la session main.`,
        "- Réutilise une identité uniquement si provider, rôle et périmètre correspondent exactement à cette session.",
        `- ${permission}`,
        "- Si la CLI contredit ce prompt, arrête-toi et remonte l'écart au Product principal.",
        "",
        "INITIALISATION",
        `1. Lance arka-norn skills doctor --target ${shellQuote(state.project.root)} --profile ${policy.profile}.`,
        `2. Si seules des skills manquent, lance arka-norn skills install --target ${shellQuote(state.project.root)} --profile ${policy.profile}. N'utilise jamais --force sans accord.`,
        `3. Lance arka-norn agent list --project ${state.project.id.value} --active.`,
        `4. Réutilise une identité exacte avec agent use --session ${sessionId.value}, sinon lance :`,
        `   ${register}`,
        `5. Confirme avec arka-norn agent current --project ${state.project.id.value} --session ${sessionId.value}.`,
        ...(feature === undefined ? [] : [
            `6. Lance arka-norn pipeline status ${feature.id.value} puis arka-norn pipeline next ${feature.id.value}.`,
            `7. Charge $${policy.skill} et exécute seulement le mode autorisé ci-dessus.`,
        ]),
        "8. Termine par un état factuel destiné au Product principal : identité, session, périmètre, preuves, blocages et prochaine décision.",
    ].join("\n");
}
function roleForStep(stepId) {
    return STEP_ROLES[stepId];
}
function roleCategory(role) {
    const normalized = role.trim().toLowerCase();
    if (normalized === "product" || normalized === "product-owner" || normalized === "po")
        return "product";
    if (normalized.includes("architect"))
        return "architecte";
    if (normalized.includes("audit"))
        return "audit";
    if (normalized === "dev" || normalized.includes("developer"))
        return "dev";
    if (normalized === "qa" || normalized.includes("recette"))
        return "qa";
    return undefined;
}
function responsibilities(role) {
    const values = {
        product: "organisation du Project;décisions produit;priorisation;coordination et passations",
        architecte: "architecture;contrats techniques;invariants;spécification d'intégration",
        audit: "audit de l'état réel;preuves reproductibles;constats sans correction",
        dev: "implémentation bornée;tests;CR de développement",
        qa: "recette indépendante;preuves fonctionnelles;verdict",
    };
    return values[role];
}
function shellQuote(value) {
    return `'${value.replaceAll("'", `'"'"'`)}'`;
}
//# sourceMappingURL=agent-orchestration.js.map