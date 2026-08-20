# CR Dev — ARKANORN / audit-recovery v1.2.0

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-audit-recovery-v1.2.0-20260820-01 |
| Date | 2026-08-20 |
| Agent | `OpenAI-Codex_dev-audit_20260819` |
| Base auditée | `eca803e60156349e0967b7773c8b5225f202e95f` |
| Version livrée | `1.2.0` |
| Statut | LIVRÉ |

## Objet

Reprise complète des dix écarts F01 à F10 consignés dans
`input/audit/AUDIT-COMPLET-ARKA-NORN-20260820.md`. Le lot ne crée pas de
Feature artificielle : il ajoute le contrat explicite d'audit Project v4.

## Périmètre Git Steward

| Champ | Valeur |
|---|---|
| Baseline | `eca803e60156349e0967b7773c8b5225f202e95f` |
| Branche | `codex/audit-recovery-v1.2.0` |
| Chemins autorisés | `src/`, `dist/`, `tests/`, `schemas/`, `examples/`, `scripts/`, `skills-src/`, `docs/`, `.github/`, manifestes, README/CHANGELOG et les preuves listées ci-dessous. |
| Exclusions locales | `coverage/`, `.agents/`, `.claude/` et `.arka-norn/backups/` : artefacts régénérables ou sauvegardes locales, non versionnés. |
| Politique de commit | Un commit intégré de reprise v1.2.0, après gates vertes et contrôle explicite de l'index. |

## Corrections livrées

| Écart | Livraison |
|---|---|
| F01 | Toute Feature marquée exige un registre d'auteurs vérifiable. Les erreurs de Project, registre, périmètre ou auteur retournent le code `3` sans rapport Pipeline permissif ; le dossier non marqué reste explicitement en compatibilité. |
| F02 | Une skill core absente rend `doctor.ok` faux et le diagnostic échoue. Les skills optionnelles absentes restent des avertissements. |
| F03 | Les actions asynchrones du cockpit Feature convertissent leurs erreurs en résultat TUI réessayable ; les mutations Agent sont sérialisées. |
| F04 | Les scènes Home et Skills réinspectent la santé après installation ou réparation, sans redémarrage. |
| F05 | Une gate `test:coverage:cli` mesure directement les adapters CLI et impose les seuils 70/70/60. La CI l'exige avant l'artefact de release. |
| F06 | `audit_etat_reel` accepte une enveloppe v4 exclusivement Project, avec `project_id` et sans `feature_id`; les documents Feature v2/v3 restent compatibles. |
| F07 | Le selftest et le test de packaging résolvent npm sans dépendre de `npm_execpath`. |
| F08 | L'aide de `validate` décrit désormais sa validation de schéma et sentinelles, et oriente la validation métier vers le Pipeline. |
| F09 | Les entrées indexées sont rechargées depuis leurs markers puis contrôlées (identité, confinement Project/Feature et absence de marker symbolique) avant toute lecture ou écriture. |
| F10 | Les scaffolds refusent les zones réservées et journalisent intention/résultat ; le journal refuse symlinks, fichiers non réguliers et hardlinks avant écriture. |

## Décisions techniques

- `schemas/project-audit-envelope.schema.json` porte l'enveloppe v4 et
  `audit-etat-reel.schema.json` sélectionne strictement v4 ou l'enveloppe
  Feature historique selon `schema_version`.
- `scaffold audit_etat_reel --project <id> --agent <id>` est confiné à la
  racine du Project, autorisé par le scope de l'Agent et réservé à cet audit.
- Le dashboard TUI reçoit désormais le registre de chaque Feature depuis le
  container. Le benchmark fournit explicitement son registre vide pour son
  dataset synthétique sans documents signés.
- Les sources de skills, leur catalogue, la documentation utilisateur, l'ADR
  et `dist/` sont alignés sur la même version `1.2.0`.
- Les tests d'installation isolent explicitement `ARKA_NORN_HOME`, afin que les
  gates restent reproductibles même lorsqu'un home de test parent est défini.

## Preuves de développement

| Gate | Résultat |
|---|---|
| TypeScript + ESLint | PASS — 0 erreur, 0 avertissement |
| Tests unitaires | PASS — 64/64 |
| Tests intégration | PASS — 48/48 |
| Tests E2E | PASS — 41/41 |
| Selftest direct sans `npm_execpath` | PASS — 55/55 |
| Couverture globale | PASS — seuil contractuel 70/70/60 atteint |
| Couverture CLI | PASS — seuil contractuel 70/70/60 atteint |
| Benchmark | PASS — budget contractuel de 5 000 ms respecté |
| Audit dépendances runtime | PASS — 0 vulnérabilité |
| Packaging | PASS — tarball `arka-norn@1.2.0` contrôlé (357 fichiers) |
| Release | PASS — `npm run release:verify` avec cache npm temporaire |
| Diff | À vérifier lors du staging Git Steward |

## Artefacts associés

- Audit signé Project v4 :
  `input/audit/AUDIT-ETAT-REEL-ARKA-NORN-20260820-01.json`.
- Exemple validable : `examples/project-audit-v4/01-audit-etat-reel.json`.
- Décision d'architecture : `docs/adr/ADR-006-audit-project-v4.md`.
- Recette indépendante :
  `input/reports/REC-ARKANORN-audit-recovery-v1.2.0-20260820-01.md`.
- Handoff de livraison :
  `input/reports/HANDOFF-ARKANORN-audit-recovery-v1.2.0-20260820-01.md`.
