/*
 * Copyright 2026 Arka Labs
 * Licensed under the Apache License, Version 2.0 (the "License");
 */

import type { AuditDepth, AuditModuleId } from "./audit-types.js";

export interface AuditModuleDefinition {
  readonly id: AuditModuleId;
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly dependencies: readonly AuditModuleId[];
  readonly maximumDepth: AuditDepth;
  readonly signalIds: readonly string[];
}

export const AUDIT_MODULE_CATALOG: readonly AuditModuleDefinition[] = Object.freeze([
  { id: "M00", key: "provenance", title: "Cadrage et provenance", description: "Project, scope, commit, workspace, outils et sources", dependencies: [], maximumDepth: "inventaire", signalIds: [] },
  { id: "M01", key: "git", title: "Dépôt et historique", description: "Intégrité, objets, historique, activité et churn Git", dependencies: ["M00"], maximumDepth: "statique", signalIds: ["git"] },
  { id: "M02", key: "code", title: "Code et tests", description: "Langages, qualité observable, tests et couverture", dependencies: ["M00"], maximumDepth: "dynamique", signalIds: ["source", "tests"] },
  { id: "M03", key: "architecture", title: "Architecture", description: "Composants, frontières, dépendances, flux et points critiques", dependencies: ["M00", "M02"], maximumDepth: "dynamique", signalIds: ["source"] },
  { id: "M04", key: "stack", title: "Technologies et dépendances", description: "Runtimes, frameworks, manifests, lockfiles et SBOM", dependencies: ["M00"], maximumDepth: "connecte", signalIds: ["manifest"] },
  { id: "M05", key: "security", title: "Sécurité", description: "Secrets, vulnérabilités, configuration et supply chain", dependencies: ["M00", "M04"], maximumDepth: "dynamique", signalIds: ["manifest", "security"] },
  { id: "M06", key: "cicd", title: "CI/CD et publication", description: "Pipelines, permissions, provenance, releases et déploiements", dependencies: ["M00"], maximumDepth: "connecte", signalIds: ["cicd"] },
  { id: "M07", key: "observability", title: "Observabilité", description: "Logs, métriques, traces, alertes, SLO et runbooks", dependencies: ["M00"], maximumDepth: "connecte", signalIds: ["observability"] },
  { id: "M08", key: "compliance", title: "Conformité et licences", description: "Licences, notices, données personnelles et applicabilité", dependencies: ["M00", "M04"], maximumDepth: "connecte", signalIds: ["license", "manifest"] },
  { id: "M09", key: "product", title: "Produit, concept et UX", description: "Cible, valeur, fonctionnalités, parcours, hypothèses et roadmap", dependencies: ["M00"], maximumDepth: "dynamique", signalIds: ["product", "web"] },
  { id: "M10", key: "operations", title: "Opérations, infrastructure et coûts", description: "IaC, environnements, capacité, exploitation et coûts", dependencies: ["M00"], maximumDepth: "dynamique", signalIds: ["iac", "containers"] },
  { id: "M11", key: "business", title: "Risques business et pérennité", description: "Continuité, dépendances, supportabilité, IP et décisions", dependencies: ["M00"], maximumDepth: "connecte", signalIds: ["product"] },
]);

export function auditModuleDefinition(id: AuditModuleId): AuditModuleDefinition {
  const definition = AUDIT_MODULE_CATALOG.find((candidate) => candidate.id === id);
  if (definition === undefined) throw new Error(`Unknown audit module: ${id}`);
  return definition;
}

export function expandAuditModuleDependencies(selected: readonly AuditModuleId[]): readonly AuditModuleId[] {
  const expanded = new Set<AuditModuleId>(["M00"]);
  const visit = (id: AuditModuleId): void => {
    if (expanded.has(id)) return;
    for (const dependency of auditModuleDefinition(id).dependencies) visit(dependency);
    expanded.add(id);
  };
  for (const id of selected) visit(id);
  return AUDIT_MODULE_CATALOG.map((definition) => definition.id).filter((id) => expanded.has(id));
}
