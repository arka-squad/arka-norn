# CR Dev — ARKANORN / B2-framing-first

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-B2-framing-first-20260826-01 |
| Date | 2026-08-26 |
| Agent | Codex (methode-dev) |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md` Lot B2 |
| Statut | ✅ LIVRÉ |

---

## Résultat livré

- Une création directe de Feature neuve échoue avec le code stable `framing_required` et ne crée aucun marker.
- La publication du framing reste l’unique chemin de matérialisation d’une Feature v5.
- Le pipeline v5 doit être explicite, en génération `2.3`, et identique à la route calculée par le plan publié.
- L’import explicite d’un marker v4 reste disponible sans réécriture à la lecture.
- `fastdev start` et `essential start` ciblent désormais une Feature existante ; ils ne créent plus de Feature implicite.

## Fichiers livrés

| Groupe | Fichiers | Rôle |
|---|---|---|
| Domaine/use case | `src/domain/errors.ts`, `src/use-cases/features/create-feature.ts` | Erreur `FRAMING_REQUIRED`, création v5 contrôlée avant toute écriture |
| CLI | `src/adapters/inbound/cli/management-cli.ts`, `src/adapters/inbound/cli/guided-feature-cli.ts` | Refus direct stable et rework explicite d’une Feature existante |
| Orchestration | `src/composition/orchestration-v23-plan-builder.ts` | Refus d’un pipeline divergent du plan publié |
| Tests | `tests/helpers/legacy-feature.ts`, tests unitaires, intégration et E2E concernés | Matrice création/import v4/publication v5/FastDev |
| Web transitoire | `web/src/generated/catalogs.test.ts`, `web/src/onboarding/onboarding.tsx` | Consommation du catalogue v3 avant suppression du wizard au Lot B3 |
| Build | fichiers `dist/` correspondants | Distribution reconstruite |

## Exigences couvertes

| ID | Exigence | Preuve |
|---|---|---|
| B2.1 | Publication framing comme seul chemin primaire v5 | `framing-engine.test.ts` matérialise après seconde stabilisation |
| B2.2 | Refus direct `framing_required` | `management-cli.test.ts`, `management-use-cases.test.ts` |
| B2.3 | Import v4 explicite sans mutation | comparaison octet pour octet dans `management-cli.test.ts` |
| B2.4 | FastDev comme rework explicite | `fastdev-cli.test.ts`, `cli-adapters.test.ts` |
| B2.5 | Cohérence marker v5, plan et pipeline | `framing-engine.test.ts`, `orchestration-v23-plan-builder.ts` |

## Vérifications

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS — code 0 |
| `npm run lint` | PASS — code 0, aucun warning |
| `npm run build` | PASS — code 0 |
| `npm run test:unit` | PASS — suite complète, code 0 |
| `npm run test:integration` | PASS — 110/110 |
| E2E CLI/TUI ciblés | PASS — management, FastDev, Agent, auteurs Pipeline et navigation TUI |
| Vitest catalogue Web ciblé | PASS — 2/2 |
| `git diff --check` | PASS |

## Décisions techniques

- Le plan recommandé n’est pas dupliqué dans `framingPlanRef` : le marker v5 2.3.2 reste lisible et le pipeline est confronté au plan publié au moment de la consommation.
- Le refus intervient avant la création du dossier métier. Le chemin CLI passe néanmoins par le use case audité afin que la tentative rejetée reste observable.
- Les tests historiques déclarent explicitement leurs fixtures v4 avec `writeLegacyFeatureMarker`; ils n’utilisent plus la commande de création comme raccourci caché.

## Migration et rollback

- Aucun marker v4 n’est migré automatiquement.
- Les markers v5 2.3.2 restent compatibles sans nouveau champ obligatoire.
- Rollback : restaurer les cinq fichiers source du Lot et leurs sorties `dist/`; aucun état utilisateur n’a besoin de conversion.

## Handoff

→ Prêt pour recette QA indépendante.
→ Lot suivant : **B3 — TUI et dettes Web legacy**.
