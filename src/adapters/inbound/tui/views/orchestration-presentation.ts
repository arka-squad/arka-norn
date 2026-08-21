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

import type { ExecutionRecord } from "../../../../domain/orchestration/execution-record.js";
import type { ExecutionTarget } from "../../../../domain/orchestration/types.js";

export function displayTarget(target: ExecutionTarget): string {
  const provider = displayProvider(target.provider);
  return target.model === undefined ? provider : `${provider} · ${target.model}`;
}

export function displayProvider(provider: string): string {
  switch (provider) {
    case "claude": return "Claude";
    case "codex": return "Codex";
    case "kimi": return "Kimi Platform";
    case "zai": return "Z.AI Coding Plan";
    default: return "Assistant sélectionné";
  }
}

export function displayStep(stepId: string): string {
  const labels: Readonly<Record<string, string>> = {
    concept: "Cadrer le besoin",
    cadrage_rework: "Cadrer le rework",
    plan: "Préparer le plan de réalisation",
    registre_dettes: "Documenter les écarts acceptés",
    tache_agent: "Préparer les missions à réaliser",
    annexe_contrat_technique: "Préciser les contrats techniques",
    invariants_figes: "Fixer les règles à respecter",
    spec_integration_technique: "Préparer la spécification d’intégration",
    audit_etat_reel: "Vérifier l’état réel",
    audit_rework: "Vérifier le rework",
    cr_dev: "Réaliser la livraison technique",
    recette_qa: "Vérifier la livraison",
    validation_fastdev: "Valider le rework",
  };
  return labels[stepId] ?? "Réaliser la prochaine étape validée";
}

export function displayRole(role: string): string {
  const labels: Readonly<Record<string, string>> = {
    product: "Pilotage produit",
    architecte: "Architecture",
    audit: "Audit indépendant",
    dev: "Développement",
    qa: "Vérification qualité",
  };
  return labels[role] ?? "Profil adapté à cette étape";
}

export function displayPermission(permission: string): string {
  const labels: Readonly<Record<string, string>> = {
    read_workspace: "Lire les fichiers du périmètre",
    write_workspace: "Modifier les fichiers du périmètre",
    shell: "Exécuter des commandes dans le périmètre",
    network: "Accéder aux services réseau autorisés",
  };
  return labels[permission] ?? "Autorisation vérifiée pour cette mission";
}

export function displayScopePath(path: string): string {
  if (path === ".") return "Tout le Project";
  return `Dossier : ${path}`;
}

export function displayCandidateReason(reason: string): string {
  const labels: Readonly<Record<string, string>> = {
    not_allowed: "non autorisé dans ce Project",
    disabled: "non activé pour ce Project",
    unhealthy: "indisponible actuellement",
    missing_capability: "ne couvre pas les actions nécessaires",
    missing_permission: "ne dispose pas des autorisations nécessaires",
    model_disabled: "le modèle choisi n’est pas activé",
    model_unavailable: "le modèle choisi n’est pas disponible",
    model_not_allowed: "le modèle choisi n’est pas autorisé",
  };
  return labels[reason] ?? "ne répond pas aux conditions de cette mission";
}

export interface AssistedMissionStatus {
  readonly title: string;
  readonly detail: string;
}

/** The next meaningful decision, expressed without exposing worker internals. */
export interface AssistedMissionAction {
  readonly title: string;
  readonly detail: string;
}

type ReadOnlyAnalysisVerdict = "no_blocker" | "findings_require_review" | "scope_change_required" | "inconclusive";

/** A closed proof reference, never provider text, marks a manual audit handoff. */
export function isReadOnlyAnalysisAwaitingValidation(execution: ExecutionRecord | undefined): boolean {
  return execution?.status === "succeeded" && readOnlyAnalysisVerdict(execution) !== undefined;
}

export function displayMissionStatus(execution: ExecutionRecord | undefined): AssistedMissionStatus {
  if (execution === undefined) {
    return {
      title: "Aucune mission en cours",
      detail: "Vous pouvez préparer la prochaine mission autorisée sans lancer quoi que ce soit.",
    };
  }
  const verdict = readOnlyAnalysisVerdict(execution);
  if (verdict !== undefined) {
    return {
      title: "Analyse prête à valider",
      detail: displayReadOnlyAnalysisVerdict(verdict),
    };
  }
  switch (execution.status) {
    case "planned":
      return { title: "Mission prête", detail: "Arka vérifie encore les conditions avant que l’assistant commence." };
    case "running":
      return { title: "L’assistant travaille", detail: "Arka suit la mission et vérifiera le résultat avant de poursuivre." };
    case "awaiting_approval":
      return { title: "Votre décision est requise", detail: displaySuspension(execution.suspensionReason?.code) };
    case "succeeded":
      return { title: "Mission terminée", detail: "Le résultat a été vérifié par Arka." };
    case "failed":
      return { title: "Mission à vérifier", detail: displaySuspension(execution.suspensionReason?.code) };
    case "cancelled":
      return { title: "Mission arrêtée", detail: "Vous avez demandé l’arrêt de cette mission." };
    case "interrupted":
      return { title: "Mission interrompue", detail: displaySuspension(execution.suspensionReason?.code) };
    case "rejected":
      return { title: "Mission arrêtée en sécurité", detail: displaySuspension(execution.suspensionReason?.code) };
  }
}

/**
 * Keep the operator in control: an action is either a concrete decision or a
 * clear statement that no decision is needed yet. The public status reason is
 * deliberately not rendered verbatim, since it can be an adapter diagnostic.
 */
export function displayMissionAction(
  execution: ExecutionRecord,
  actionRequired: { readonly kind: "approve" | "retry" | "inspect"; readonly reason: string } | undefined,
): AssistedMissionAction {
  const verdict = readOnlyAnalysisVerdict(execution);
  if (verdict !== undefined) {
    return {
      title: "Validez le livrable d’audit avant de poursuivre",
      detail: "Arka a reçu une conclusion d’analyse en lecture seule. Le Pipeline ne progresse qu’après votre validation du document officiel.",
    };
  }
  const suspension = displaySuspension(execution.suspensionReason?.code);
  if (actionRequired?.kind === "approve" || execution.status === "awaiting_approval") {
    return {
      title: "Donnez votre accord ou arrêtez la mission",
      detail: suspension,
    };
  }
  if (actionRequired?.kind === "retry") {
    return {
      title: "Reprenez avec le même assistant ou laissez la mission arrêtée",
      detail: suspension,
    };
  }
  if (actionRequired?.kind === "inspect") {
    return {
      title: "Vérifiez ce qui bloque avant de décider",
      detail: suspension,
    };
  }
  switch (execution.status) {
    case "planned":
    case "running":
      return {
        title: "Aucune décision n’est attendue pour le moment",
        detail: "Arka suit la mission et vous alertera uniquement si votre choix devient nécessaire.",
      };
    case "succeeded":
      return {
        title: "Préparez la prochaine mission lorsque vous le souhaitez",
        detail: "Arka ne lancera jamais la suite sans vous l’expliquer et obtenir votre confirmation.",
      };
    case "cancelled":
      return {
        title: "Préparez une nouvelle mission lorsque vous le souhaitez",
        detail: "Cette mission a été arrêtée à votre demande.",
      };
    case "failed":
    case "interrupted":
      return {
        title: "Vérifiez la situation avant de relancer la mission",
        detail: suspension,
      };
    case "rejected":
      return {
        title: "Vérifiez ce qui bloque avant de préparer une nouvelle mission",
        detail: suspension,
      };
  }
}

/**
 * Recent progress only. Event payloads are adapter diagnostics, so the TUI
 * maps their stable type to a readable statement rather than rendering them.
 */
export function displayMissionEvents(execution: ExecutionRecord, limit = 3): readonly string[] {
  const boundedLimit = Math.max(1, Math.min(limit, 5));
  const recent = execution.events.slice(-boundedLimit).map((event) => displayMissionEvent(event.type));
  const hiddenCount = Math.max(0, execution.events.length - recent.length) + execution.truncatedEventCount;
  if (hiddenCount === 0) return recent;
  return [
    ...recent,
    `… ${hiddenCount} événement${hiddenCount > 1 ? "s" : ""} antérieur${hiddenCount > 1 ? "s" : ""} non affiché${hiddenCount > 1 ? "s" : ""}`,
  ];
}

function displayMissionEvent(type: string): string {
  const labels: Readonly<Record<string, string>> = {
    target_selected: "Assistant et modèle confirmés",
    planned: "Mission préparée",
    started: "Assistant lancé",
    approval_requested: "Votre décision est maintenant requise",
    approved: "Votre accord a été enregistré",
    provider_session_recorded: "Mission reliée à l’assistant sélectionné",
    succeeded: "Résultat reçu et vérifié par Arka",
    failed: "Mission arrêtée avant un résultat vérifiable",
    cancelled: "Arrêt demandé",
    interrupted: "Mission interrompue avant sa fin",
    rejected: "Mission refusée pour protéger le Project",
    retry_planned: "Nouvel essai préparé avec le même assistant et modèle",
    next_preview_required: "La prochaine mission devra être préparée et confirmée",
    read_only_analysis_ready: "Conclusion d’analyse reçue en lecture seule",
    manual_pipeline_validation_required: "Validation humaine du livrable requise avant la suite",
  };
  return labels[type] ?? "Arka a mis à jour le suivi de la mission";
}

function readOnlyAnalysisVerdict(execution: ExecutionRecord): ReadOnlyAnalysisVerdict | undefined {
  const values = execution.proofReferences
    .flatMap((reference) => reference.startsWith("analysis:verdict:") ? [reference.slice("analysis:verdict:".length)] : []);
  if (values.length !== 1) return undefined;
  return isReadOnlyAnalysisVerdict(values[0]) ? values[0] : undefined;
}

function isReadOnlyAnalysisVerdict(value: string | undefined): value is ReadOnlyAnalysisVerdict {
  return value === "no_blocker"
    || value === "findings_require_review"
    || value === "scope_change_required"
    || value === "inconclusive";
}

function displayReadOnlyAnalysisVerdict(verdict: ReadOnlyAnalysisVerdict): string {
  switch (verdict) {
    case "no_blocker": return "L’analyse ne signale pas de blocage. Validez tout de même le livrable d’audit avant de poursuivre.";
    case "findings_require_review": return "L’analyse a relevé des éléments à examiner. Consultez et validez le livrable d’audit avant de poursuivre.";
    case "scope_change_required": return "L’analyse indique que le périmètre doit être revu. Décidez du nouveau périmètre avant de poursuivre.";
    case "inconclusive": return "L’analyse ne permet pas encore de conclure. Complétez ou validez le livrable d’audit avant de poursuivre.";
  }
}

function displaySuspension(code: string | undefined): string {
  const labels: Readonly<Record<string, string>> = {
    permission_not_preapproved: "Les autorisations prévues ne suffisent pas. Arka n’a rien exécuté de plus.",
    permission_requested: "L’assistant demande une autorisation supplémentaire.",
    automatic_disabled: "Le Pilote assisté a été désactivé avant la suite de la mission.",
    scope_changed: "Le périmètre de la mission a changé depuis sa préparation.",
    precondition_changed: "La situation a changé depuis la préparation de la mission.",
    missing_proof: "Le résultat ne peut pas encore être confirmé.",
    provider_error: "L’assistant a rencontré un problème et Arka a arrêté la mission.",
    worker_unavailable: "L’assistant n’est pas disponible pour poursuivre cette mission.",
    cancelled_by_user: "Vous avez demandé l’arrêt de cette mission.",
    interrupted: "La mission a été interrompue avant sa fin.",
    policy_rejected: "Les règles du Project ne permettent plus cette mission.",
  };
  return code === undefined
    ? "Arka a arrêté la mission pour protéger le Project."
    : labels[code] ?? "Arka a arrêté la mission pour protéger le Project.";
}

export function translatePreparationError(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("read-only analysis awaits manual pipeline validation")) {
    return "L’analyse est prête. Validez ou produisez le livrable d’audit avant de préparer de nouveau cette étape.";
  }
  if (message.includes("precondition") || message.includes("fingerprint") || message.includes("changed")) {
    return "La situation a changé depuis la préparation. Actualisez la mission avant de la lancer.";
  }
  if (message.includes("feature")) {
    return "Choisissez une Feature avant de préparer la mission.";
  }
  if (message.includes("provider") || message.includes("assistant") || message.includes("target")) {
    return "Aucun assistant disponible ne répond actuellement aux règles de cette mission.";
  }
  if (message.includes("active") || message.includes("execution")) {
    return "Une mission est déjà en cours. Terminez-la ou arrêtez-la avant d’en préparer une autre.";
  }
  return "Cette action ne peut pas être réalisée pour le moment. Actualisez l’écran et réessayez.";
}
