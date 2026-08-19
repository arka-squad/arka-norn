# Recette — ARKANORN / project_feature_platform

| Champ         | Valeur |
|---------------|--------|
| Ref           | REC-ARKANORN-project_feature_platform-20260819-01 |
| Date          | 2026-08-19 |
| Testeur       | Codex |
| Environnement | local macOS, Node v24.7.0 |
| Version       | `main` sur baseline `a11087b`, worktree final |
| Statut global | PASS |

---

## Périmètre

Recette directe de la plateforme locale Project/Feature, de ses interfaces CLI/TUI, de sa sécurité, de l'installation des skills et de sa chaîne de livraison. Les résultats sont recomptés depuis le code et les commandes exécutées.

---

## Prérequis

- Dépendances installées depuis `package-lock.json`.
- Plan local `.input/plan/PLAN-ARKA-NORN-PLATEFORME-PROJETS-FEATURES-20260819-01.md` disponible.
- Protocole de vérification directe appliqué ; sa source externe `/mnt/skills/user/regle-verification-directe/SKILL.md` n'est pas montée dans cet environnement.

---

## Cas de test

### CT-01 — Gates statiques et build

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | `npm run typecheck`, `npm run lint`, `npm run build`, `npm run selftest` |
| Attendu  | 0 erreur et toutes les vérifications selftest PASS |
| Obtenu   | 0 erreur TypeScript, 0 warning ESLint, build exit 0, 51/51 vérifications selftest passées |
| Verdict  | PASS |
| Trace    | Commandes exécutées le 2026-08-19 ; `package.json:38-61`, `scripts/selftest.mjs:1-156` |
| Écart    | — |
| Note     | — |

### CT-02 — Pyramide de tests

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | `npm test` via `npm run test:coverage` |
| Attendu  | 0 régression sur unitaires, intégration et E2E |
| Obtenu   | 81 tests comptés : 81 PASS, 0 PARTIAL, 0 FAIL |
| Verdict  | PASS |
| Trace    | Sortie TAP directe ; `tests/run-tests.mjs`, 81 déclarations `test(...)` sous `tests/` |
| Écart    | — |
| Note     | 5 nouveaux cas de non-régression, dont conversion CRLF du catalogue |

### CT-03 — Couverture minimale

| Champ    | Valeur |
|----------|--------|
| Priorité | P1 |
| Entrée   | `npm run test:coverage` |
| Attendu  | lignes ≥ 70 %, fonctions ≥ 70 %, branches ≥ 60 % |
| Obtenu   | 7 265 lignes : 5 336 couvertes, 73,44 % ; 527 fonctions : 389 couvertes, 73,81 % ; 1 570 branches : 1 167 couvertes, 74,33 % |
| Verdict  | PASS |
| Trace    | `coverage/coverage-summary.json` généré directement par c8 |
| Écart    | — |
| Note     | Tous les seuils sont bloquants dans `package.json` |

### CT-04 — Sécurité filesystem et intégrité

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | JSON > 2 Mio, sortie de racine, symlink fichier/dossier, index corrompu, contention et lock stale |
| Attendu  | Rejet explicite sans écriture hors périmètre ni perte d'index |
| Obtenu   | 10 scénarios critiques comptés : taille, confinement, symlink fichier, symlink dossier, marker forgé, index concurrents, index corrompu, contention, lock vivant, lock mort ; 10 PASS |
| Verdict  | PASS |
| Trace    | `tests/integration/security-input-limits.test.ts:12`, `tests/integration/security-persistence.test.ts:16` |
| Écart    | — |
| Note     | Les mutations exigent aussi une intention d'audit écrivable |

### CT-05 — Espace TUI Project/Feature

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | Événements clavier Home → Project → Feature → scaffold |
| Attendu  | Navigation réelle, action sérialisée et document écrit par le moteur de production |
| Obtenu   | 4 niveaux franchis : Home, Project, Feature, résultat ; `concept.json` créé avec type `concept` ; double Entrée sérialisé |
| Verdict  | PASS |
| Trace    | `tests/e2e/tui-navigation.test.ts:16-69`, `tests/unit/tui-runtime.test.ts:1` |
| Écart    | — |
| Note     | Santé système et installation des skills sont séparées sur l'accueil |

### CT-06 — Gestion CLI et parité métier

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | Cycle CLI Project/Feature, Pipeline, migration, doctor et options inconnues |
| Attendu  | Une seule logique métier, sorties/codes stables et options strictes |
| Obtenu   | 12 commandes publiques comptées : project, depot, feature, pipeline, status, scaffold, validate, doctor, install, skills, migrate, selftest ; cycles et codes validés |
| Verdict  | PASS |
| Trace    | `src/adapters/inbound/cli/main-cli.ts:40-95`, `tests/e2e/cli.test.ts:1-166` |
| Écart    | — |
| Note     | `bin/arka-norn.mjs` contient 4 lignes et délègue au routeur typé |

### CT-07 — Installation effective des skills

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | `ARKA_NORN_HOME=<temp> arka-norn install --target <temp> --profile all` |
| Attendu  | 14 skills installés dans les deux providers, dont audit, dev et recette QA |
| Obtenu   | 14 skills `.agents` et 14 skills `.claude` comptés : [annexe-technique, audit, concept, dettes, dev, handoff, invariants, plan, recette-qa, scaffold, spec-integration, statut, taches, valider] |
| Verdict  | PASS |
| Trace    | Installation temporaire directe exit 0 ; `src/adapters/outbound/skills/skill-installer.ts:1-193` |
| Écart    | — |
| Note     | Le dépôt temporaire a été supprimé après comptage |

### CT-08 — Paquet consommable hors worktree

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | Consumer vierge offline + `npm pack --dry-run --ignore-scripts` avec cache isolé |
| Attendu  | Installation sans `node_modules` du dépôt, CLI et selftest fonctionnels |
| Obtenu   | Tarball de 274 fichiers, 158,0 kB compressés et 731,1 kB décompressés ; consumer vierge PASS ; `src/`, `tests/` et `.input/` absents |
| Verdict  | PASS |
| Trace    | `tests/e2e/packaging.test.ts:11-87`, sortie npm pack directe |
| Écart    | — |
| Note     | Cache temporaire utilisé car le cache npm utilisateur local a des propriétaires incohérents |

### CT-09 — Performance portefeuille

| Champ    | Valeur |
|----------|--------|
| Priorité | P2 |
| Entrée   | `npm run benchmark` |
| Attendu  | 50 Projects < 1 500 ms, 200 Features < 2 500 ms, 50 rapports < 3 000 ms, total < 5 000 ms |
| Obtenu   | 50 Projects en 71,83 ms ; 200 Features en 110,75 ms ; 50 rapports en 44,34 ms ; total 226,92 ms |
| Verdict  | PASS |
| Trace    | Sortie directe `scripts/benchmark.mjs` |
| Écart    | — |
| Note     | Concurrence bornée et ordre déterministe |

### CT-10 — Dépendances, CI et release

| Champ    | Valeur |
|----------|--------|
| Priorité | P1 |
| Entrée   | `npm audit --omit=dev`, `npm audit`, parsing YAML et inspection workflow |
| Attendu  | 0 vulnérabilité, YAML valide, actions immuables et artefact attesté |
| Obtenu   | 0 vulnérabilité runtime ; 0 vulnérabilité complète ; YAML valide ; 4 actions épinglées par SHA [checkout v5, setup-node v5, attest-build-provenance v3, upload-artifact v4] |
| Verdict  | PASS |
| Trace    | Commandes directes ; `.github/workflows/ci.yml:1-92`, `docs/release.md:1-26` |
| Écart    | — |
| Note     | Matrice qualité : 3 OS × 3 versions Node = 9 combinaisons ; loader de tests reproduit sous Node 20.20.2 |

### CT-11 — Clôture de l'audit

| Champ    | Valeur |
|----------|--------|
| Priorité | P0 |
| Entrée   | Recompte de `input/audit/REMEDIATION-AUDIT-TECHNIQUE-ARKA-NORN-20260819.md` |
| Attendu  | Aucun constat audité laissé ouvert |
| Obtenu   | 27 constats comptés [S1, S2, S3, Q1, Q2, Q3, A1, A2, A3, SEC1, SEC2, SEC3, T1, T2, T3, P1, P2, O1, O2, O3, C1, C2, C3, D1, D2, H1, H2] ; 27 fermés, renforcés ou préservés ; 0 ouvert |
| Verdict  | PASS |
| Trace    | `input/audit/REMEDIATION-AUDIT-TECHNIQUE-ARKA-NORN-20260819.md:9-70` |
| Écart    | — |
| Note     | La CI distante est vérifiée après push |

---

## Incohérences spec détectées

Aucune incohérence spec détectée.

---

## Anomalies détectées

| ID     | Sévérité | Description | CT lié | Statut |
|--------|----------|-------------|---------|--------|
| ANO-01 | Majeur | Runner TypeScript incompatible avec Node 20 (`--experimental-strip-types`) | CT-10 | Corrigé |
| ANO-02 | Majeur | Import absolu du loader invalide sous Windows ESM | CT-10 | Corrigé |
| ANO-03 | Mineur | SHA `setup-node` tronqué dans le job benchmark | CT-10 | Corrigé |
| ANO-04 | Majeur | `fsync` de dossier retourne `EPERM` sous Windows | CT-04 | Corrigé |
| ANO-05 | Majeur | Checksums des skills dépendants des fins de ligne Git CRLF | CT-07 | Corrigé |
| ANO-06 | Mineur | Assertion de chemin non canonique face aux noms courts Windows | CT-04 | Corrigé |
| ANO-07 | Majeur | Test de packaging dépendant du lancement direct d'un shim `.cmd` | CT-08 | Corrigé |
| ANO-08 | Majeur | Contention du reaper signalée `EPERM` plutôt que `EEXIST` sous Windows | CT-04 | Corrigé |
| ANO-09 | Mineur | Identifiant doctor construit avec un séparateur POSIX | CT-04 | Corrigé |
| ANO-10 | Mineur | Assertion CLI sensible aux noms courts Windows 8.3 | CT-06 | Corrigé |
| ANO-11 | Majeur | Course Node 20 entre `open` du reaper et `lstat` après disparition concurrente | CT-04 | Corrigé |

---

## Synthèse

| Métrique          | Valeur |
|-------------------|--------|
| Total CT          | 11 |
| PASS              | 11 |
| PARTIAL           | 0 |
| FAIL              | 0 |
| Taux PASS         | 100% |
| Anomalies         | 11 corrigées, 0 ouverte |
| Bloquants         | 0 |
| Incohérences spec | 0 |

---

## Décision

Composant validé, prêt pour intégration/déploiement.

---

## Signatures

| Rôle     | Nom | Date |
|----------|-----|------|
| Testeur  | Codex | 2026-08-19 |
| Valideur | — | — |
