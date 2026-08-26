# CR Dev — ARKANORN / B1-catalog-v3

| Champ           | Valeur                                    |
|----------------|-------------------------------------------|
| Ref             | CR-DEV-ARKANORN-B1-catalog-v3-20260826-01 |
| Date            | 2026-08-26                                |
| Agent           | Claude (methode-dev)                      |
| Spec source     | `.input/spec-norn-2.3-convergence-produit.md` Lot B1 |
| Statut          | ✅ LIVRÉ                                  |

---

## Fichiers livrés

| Fichier                                                         | Action   | Lignes | Rôle                              |
|-----------------------------------------------------------------|----------|--------|-----------------------------------|
| `src/domain/pipeline/pipeline-catalog.ts`                       | Modifié  | +25    | Types v3, isPipelineCatalogV3     |
| `src/adapters/outbound/pipeline/fs-pipeline-document-source.ts` | Modifié  | +20    | Parseur v3 + compat v2            |
| `src/composition/pipeline-runtime.ts`                           | Modifié  | +3     | Fallback v3 pour defaultWorkflowId |
| `pipelines/catalog.json`                                        | Modifié  | ~+30   | Catalogue v3 qualifié             |
| `scripts/generate-web-catalogs.mjs`                             | Modifié  | +5     | Export v3 sans defaultPipelineId  |
| `schemas/pipeline-catalog.schema.json`                          | Créé     | 63     | Schéma JSON du catalogue          |
| `tests/unit/pipeline-catalog.test.ts`                           | Modifié  | +4     | Assertions v3                     |
| `tests/unit/pipeline-catalog-v3.test.ts`                        | Créé     | 105    | Tests v3 et compatibilité v2      |
| Fichiers `dist/` et `web/src/generated/contracts.ts`            | Générés  | —      | Build                             |

---

## Exigences couvertes

| ID   | Exigence                                                              | Couvert | Fichier:Ligne                              |
|------|-----------------------------------------------------------------------|---------|--------------------------------------------|
| B1.1 | Ajouter le schéma et le lecteur compatible v2/v3                      | ✅      | `pipeline-catalog.schema.json`, `fs-pipeline-document-source.ts` |
| B1.2 | Qualifier les pipelines par génération et disponibilité               | ✅      | `pipeline-catalog.ts`, `pipelines/catalog.json` |
| B1.3 | Régénérer les catalogues Web                                          | ✅      | `scripts/generate-web-catalogs.mjs`        |
| B1.4 | Supprimer tout badge recommandé fondé sur le défaut legacy            | ✅      | Web contracts n’exportent plus `defaultPipelineId` |

---

## Vérifications

| Check            | Résultat                                              |
|-----------------|-------------------------------------------------------|
| Build            | 0 erreur (`npm run build`)                            |
| Typecheck        | 0 erreur (`npm run typecheck`)                        |
| Lint             | 0 erreur, 0 warning (`npm run lint`)                  |
| Tests unitaires  | 155/155 passed                                        |
| Régressions      | 0                                                     |
| Grep `: any`     | 0                                                     |
| Grep TODO/stub   | 0                                                     |
| Schéma JSON      | Valide                                                |

---

## Décisions techniques

| Décision                                            | Raison                                           |
|----------------------------------------------------|--------------------------------------------------|
| Projection v2 avec `generation=legacy`              | Préserve la compatibilité sans inventer d’info   |
| `defaultWorkflowId` retourne le fallback v3         | Maintient les consommateurs existants en attendant B2/B3 |

---

## Problèmes détectés hors scope

| Problème | Fichier | Sévérité |
|----------|---------|----------|
| Aucun    | —       | —        |

---

## Handoff

→ Prêt pour recette-qa
→ Lot suivant : **B2 — Création de Feature framing-first**
