# CR Dev — ARKANORN / project_feature_platform

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-project_feature_platform-20260819-01 |
| Date | 2026-08-19 |
| Agent | Codex |
| Spec source | `.input/plan/PLAN-ARKA-NORN-PLATEFORME-PROJETS-FEATURES-20260819-01.md` + `input/audit/AUDIT-TECHNIQUE-ARKA-NORN-20260819.md` |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Lignes | Rôle |
|---|---|---|---|
| `.github/workflows/ci.yml` | Modifié | 92 | Matrice multi-OS/Node, couverture, benchmark, audits et release attestée |
| `.gitignore` | Modifié | 5 | Ignore `.input/` et `coverage/` |
| `package.json`, `package-lock.json`, `eslint.config.mjs` | Créé / Modifié | 1 964 | Gates, dépendances alignées, métadonnées et lint TypeScript strict |
| `README.md`, `CHANGELOG.md`, `LICENSE`, `SECURITY.md` | Créé / Modifié | 124 | Contrat produit, version, licence interne et politique sécurité |
| `docs/{architecture,cli,security,skills,tui,release}.md` | Créé / Modifié | 143 | Documentation alignée sur les comportements livrés |
| `bin/arka-norn.mjs` | Modifié | 4 | Entrypoint minimal vers le routeur TypeScript |
| `src/adapters/inbound/cli/*.ts` | Créé / Modifié | 823 | Routeur et commandes typées Project, Feature, Pipeline, Doctor, Skills et migration |
| `src/adapters/inbound/tui/{runtime,views}/**/*.ts` | Modifié | 1 051 | Navigation, rendu physique et cockpits Project/Feature |
| `src/composition/container.ts`, `src/composition/tui/*.ts` | Créé / Modifié | 419 | Composition et contrôleurs TUI modulaires |
| `src/adapters/outbound/filesystem/_shared/atomic-json.ts` | Modifié | 101 | I/O atomiques, bornés et résistants aux liens symboliques |
| `src/adapters/outbound/skills/*.ts` | Créé / Modifié | 434 | Catalogue typé et installation transactionnelle des skills |
| `src/application/shared/map-concurrent.ts` | Modifié | 19 | Concurrence bornée et ordre déterministe |
| `src/domain/pipeline/evaluate-pipeline.ts` | Modifié | 284 | Graphe documentaire, CR/QA et handoffs |
| `src/use-cases/features/create-feature.ts` | Modifié | 81 | Invariant marker puis index et rollback explicite |
| `scripts/*.mjs` | Créé / Modifié / Supprimé | 417 | Wrappers minces, selftest production et benchmark ; suppression du moteur parallèle |
| `schemas/*.schema.json` | Modifié | 781 | Références produit arka-norn cohérentes |
| `tests/{unit,integration,e2e}/**/*.test.ts` | Créé / Modifié | 346 | Sécurité, TUI réelle, packaging isolé et rendu |
| `tests/{run-tests,register-typescript-loader,typescript-loader}.mjs` | Modifié | 79 | Runner TypeScript portable Node 20/22/24 et ESM Windows |
| `dist/**` | Généré | 55 fichiers changés | Build JavaScript et source maps reproductibles |
| `input/audit/REMEDIATION-AUDIT-TECHNIQUE-ARKA-NORN-20260819.md` | Créé | 70 | Clôture traçable des 27 constats d'audit |
| `input/reports/CR-DEV-ARKANORN-project_feature_platform-20260819-01.md` | Créé | présent fichier | Compte rendu de livraison |
| `input/reports/REC-ARKANORN-project_feature_platform-20260819-01.md` | Créé | rapport associé | Preuves de recette directe |

---

## Exigences couvertes

| ID | Exigence | Couvert | Fichier:Ligne |
|---|---|---|---|
| E01 | Formaliser le concept et l'objectif du produit | OUI | `README.md:1`, `docs/architecture.md:1` |
| E02 | Sécuriser le filesystem, les verrous, les chemins et les journaux | OUI | `src/adapters/outbound/filesystem/_shared/atomic-json.ts:25`, `docs/security.md:1` |
| E03 | Obtenir une architecture modulaire avec une seule logique métier | OUI | `src/adapters/inbound/cli/main-cli.ts:40`, `src/composition/container.ts:72` |
| E04 | Créer un véritable espace TUI Project/Feature | OUI | `src/composition/container.ts:121`, `tests/e2e/tui-navigation.test.ts:16` |
| E05 | Exposer la gestion Project/Feature et Pipeline en CLI | OUI | `src/adapters/inbound/cli/main-cli.ts:16`, `src/adapters/inbound/cli/management-cli.ts:1` |
| E06 | Inclure audit, dev et recette QA dans l'installation | OUI | `src/adapters/outbound/skills/skill-catalog.ts:1`, `scripts/selftest.mjs:109` |
| E07 | Rendre les mutations, diagnostics et données robustes | OUI | `src/composition/management-runtime.ts:102`, `src/adapters/outbound/filesystem/fs-doctor.ts:37` |
| E08 | Installer des gates vérifiables sans dette de qualité | OUI | `package.json:38`, `eslint.config.mjs:1` |
| E09 | Prouver packaging, performance et livraison interne | OUI | `tests/e2e/packaging.test.ts:11`, `scripts/benchmark.mjs:1`, `.github/workflows/ci.yml:1` |
| E10 | Créer le plan sous `.input/plan` et ignorer `.input/` | OUI | `.gitignore:1`, `.input/plan/PLAN-ARKA-NORN-PLATEFORME-PROJETS-FEATURES-20260819-01.md:1` |

---

## Vérifications

| Check | Résultat |
|---|---|
| Build | 0 erreur — TypeScript 6.0.3, build reproductible |
| Tests total | 81/81 passed |
| Nouveaux tests | 5 cas ajoutés |
| Régressions | 0 |
| Grep `any` | 0 dans `src/**/*.ts` et `tests/**/*.ts` |
| Grep `TODO/stub` | 0 dans `src/**/*.ts` et `tests/**/*.ts` |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Conserver Ajv comme unique dépendance runtime | Préserver un runtime local-first sobre |
| Routeur CLI TypeScript unique avec wrappers MJS minces | Éliminer les implémentations parallèles |
| Contrôleurs TUI injectables | Partager les cas d'usage et tester le clavier réel sans subprocess |
| Installation de skills transactionnelle et multi-cible | Éviter les installations partielles et garantir Claude/Codex |
| Lecture `O_NOFOLLOW` et parent d'écriture canonique | Fermer les contournements symlink/TOCTOU portables |
| `fsync` dossier best-effort sous Windows et modes privés POSIX | Respecter les garanties réellement offertes par chaque plateforme |
| Checksums normalisés LF et npm lancé par son module JavaScript | Rendre skills et packaging indépendants de CRLF et des shims Windows |
| Détection de contention de lock native par plateforme | Accepter `EPERM` sous Windows uniquement si le fichier concurrent existe |
| Identifiants de lock via `path.basename` et chemins via `realpathSync.native` | Éliminer séparateurs POSIX et noms courts 8.3 des assertions Windows |
| Préfiltre stale et validation du parent inscriptible | Fermer la course Node 20 où le reaper disparaît entre `open` et `lstat` |
| Seuils couverture 70/70/60 et benchmark 5 s | Transformer la qualité et la performance en gates reproductibles |
| Distribution interne propriétaire par artefact GitHub | Aligner licence, SBOM, provenance et rollback |

---

## Problèmes détectés hors scope

—

---

## Handoff

→ Prêt pour recette-qa (REC-*)
→ Prêt pour audit-final (AUD-*)
