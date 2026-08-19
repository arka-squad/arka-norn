# Matrice de remédiation — audit technique arka-norn

| Champ | Valeur |
|---|---|
| Audit source | `AUDIT-TECHNIQUE-ARKA-NORN-20260819.md` |
| Date de remédiation | 2026-08-19 |
| Branche cible | `main` |
| Baseline | `a2c983a` |
| Jalon de sécurisation | `a11087b` |
| Règle de clôture | aucune dette connue laissée ouverte dans le périmètre audité |

## État des constats

| ID | Constat | État | Correction et preuve directe |
|---|---|---|---|
| S1 | Frontières hexagonales | Préservé | Le domaine reste sans import Node ; ESLint interdit désormais `node:*`, adapters et composition sous `src/domain/`. |
| S2 | Deux architectures de commandes | Fermé | Routeur unique `main-cli.ts`; install/skills/migrate/status/scaffold/validate/doctor/pipeline sont typés. Le binaire et les scripts sont des wrappers minces. `scripts/lib.mjs` et sa validation Ajv parallèle ont été supprimés. |
| S3 | Container TUI central | Fermé | Container ramené sous 200 lignes ; contrôleurs pipeline, ressources, skills/santé et agrégats Project extraits sous `src/composition/tui/`. |
| Q1 | Typage strict | Renforcé | TypeScript 6.0.3, options strictes conservées et types Node alignés sur la ligne 20.x supportée. |
| Q2 | Commentaire CreateFeature périmé | Fermé | Le commentaire décrit l’invariant réel marker puis index ; le `try/catch` sans effet a été supprimé. |
| Q3 | Faux lint TypeScript | Fermé | ESLint 10 + typescript-eslint type-aware : promesses flottantes, mauvaises promesses, imports de type, `any`, complexité, profondeur et frontières domaine. Le contrôle syntaxique JS est renommé `check:js-syntax`. |
| A1 | Règle dernier CR / QA | Préservé | Tests unitaires et intégration couvrent QA pass/fail/partial et QA obsolète. |
| A2 | Handoffs non validés/invisibles | Fermé | Validation Ajv, `transversalDocuments`, compteurs cockpit et tests valid/invalid. |
| A3 | Identité/graphe documentaire partiels | Fermé | Enveloppe v2 commune ; IDs, Feature, séquence, date, relations, unicité, cardinalité, dépendances, self-reference et cycles contrôlés. |
| SEC1 | Sécurité filesystem | Renforcé | Lectures avec `O_NOFOLLOW` hors Windows et contrôle de fichier après ouverture ; écritures dans un parent canonique ; symlinks de fichier et dossier testés ; `fsync` dossier best-effort sur Windows et modes privés vérifiés sur POSIX. |
| SEC2 | Ownership du stale lock | Fermé | Token UUID, PID, date, libération conditionnelle, reaper réservé aux locks stale et contention `EPERM` Windows validée par fichier ou parent inscriptible ; tests processus vivant, processus mort et trois writers. |
| SEC3 | Dépendances | Préservé | Une dépendance runtime directe ; audits npm production et complet intégrés à la CI. |
| T1 | Pyramide de tests | Renforcé | Suites unitaires, intégration et E2E conservées et enrichies des reproductions de l’audit. |
| T2 | Parcours TUI incomplet | Fermé | Test clavier avec adapters réels : Home → Project → Feature → scaffold écrit sur disque ; double Entrée sérialisé. |
| T3 | Packaging lié au worktree | Fermé | Consumer vierge, tarballs indépendants et aucun symlink `node_modules`; smoke `help` et catalogue 14 skills. Un second smoke online est dans le job de release. |
| P1 | Double inspection Feature | Fermé | Un `PipelineReport` fournit statut et métriques ; concurrence bornée à 4 pour le dashboard. |
| P2 | Réhydratation séquentielle | Fermé | `mapConcurrent` borné à 8, ordre déterministe. Benchmark : 50 Projects, 200 Features, 50 rapports, budget total 5 s. |
| O1 | Faux PASS doctor | Fermé | Codec d’index partagé avec les stores ; entrées mal formées testées. |
| O2 | Audit trail silencieux/non borné | Fermé | Intention obligatoire avant mutation, succès/échec, code `AUDIT_UNAVAILABLE`, redaction, rotation 2 Mio/5 archives et health doctor. |
| O3 | Markers cassés invisibles | Fermé | Warnings visibles au niveau `warn`, diagnostic marker par marker dans doctor et écran santé TUI ; les listes métier ne retournent que des entités valides. |
| C1 | Absence de baseline Git | Fermé | Baseline `a2c983a`, jalon `a11087b` et `origin/main` créés sans écrasement. |
| C2 | CI non prouvée/actions mutables | Fermé côté code | Actions Node 24 épinglées par SHA ; matrice runtime Node 20/22/24 et 3 OS, runner et packaging portables sans shim `.cmd`, checksums indépendants de CRLF, couverture, benchmark et audits. L’exécution distante finale est vérifiée après push. |
| C3 | Release ambiguë | Fermé | Distribution interne propriétaire explicite, `LICENSE`, changelog, politique sécurité, release taguée, SBOM, SHA-256, attestation de provenance et rollback documenté. |
| D1 | Promesses documentation/code | Fermé | Architecture, CLI, TUI, sécurité, skills et release alignés sur les comportements testés. |
| D2 | Références `cortex.deck` | Fermé | Toutes les descriptions et exemples de schémas sont alignés sur `arka-norn`; recherche résiduelle limitée au rapport historique d’audit. |
| H1 | Dépendances sobres | Préservé | Ajv reste l’unique dépendance runtime. |
| H2 | Types Node trop récents | Fermé | `@types/node` 20.19.43, cohérent avec `engines.node >=20.11`. |

## Risques probables de l’audit

| Risque | Clôture |
|---|---|
| TOCTOU chemins | Parents canonisés avant écriture, temporaires imprévisibles ouverts avec `wx`, lectures no-follow et tests symlink fichier/dossier. Les primitives restent portables Node 20. |
| Supply chain Actions | Toutes les actions sont épinglées à un commit immuable. |
| Fuite par logs | Redaction récursive des clés sensibles dans logger et audit trail, couverte par tests. |
| Compatibilité Node 20 | Types alignés, matrice CI Node 20/22/24, package test sans dépendance implicite. |

## Gates de clôture

La remédiation n’est considérée terminée qu’après succès direct de :

```text
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run benchmark
npm run check
npm audit
npm audit --omit=dev
npm pack --dry-run --ignore-scripts
```

Les preuves finales et l’état de la CI distante sont consignés dans les rapports
CR-DEV et recette QA de ce lot.
