# CR Dev — ARKANORN / C3-project-publication

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-C3-project-publication-20260826-01 |
| Date | 2026-08-26 |
| Agent | Codex (methode-dev) |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md` Lot C3 |
| Statut | ✅ LIVRÉ |

---

## Résultat livré

- La seconde stabilisation d'un `ProjectDraft` publie désormais son plan et son marker au moyen d'une transaction journalisée et reprenable.
- Le journal privé suit six états immuables de progression, de `prepared` à `materialized`, sans placer d'état de travail dans le dépôt produit.
- Le plan et le marker sont préparés dans `.arka-norn/.staging/<publication-id>`, synchronisés, puis engagés exclusivement sans écraser une destination existante.
- Chaque reprise vérifie l'identité du draft, la révision et l'empreinte du plan, les artefacts déjà engagés et l'index Project.
- Doctor distingue une publication saine, récupérable ou dangereuse, propose la reprise et ne masque pas un journal corrompu.
- Les markers concurrents, liens symboliques et racines Git de sous-module sont refusés sans mutation hors destination.

## Fichiers livrés

| Groupe | Fichiers | Rôle |
|---|---|---|
| Contrat | `src/domain/project/project-publication.ts`, `schemas/project-publication.schema.json` | Journal versionné, états et validation stricte |
| Port | `src/ports/outbound/project-publication-store.ts` | Publication, inspection et récupération |
| Transaction | `src/adapters/outbound/filesystem/fs-project-publication-store.ts` | Staging, engagement exclusif, journal, reprise et protections de chemin |
| Application | `src/application/framing/framing-service.ts`, `src/composition/framing-runtime.ts` | Publication transactionnelle des drafts et import du Project matérialisé |
| Doctor | `src/adapters/outbound/filesystem/fs-doctor.ts`, `src/ports/inbound/for-doctor.ts` | Diagnostic et action `recover_project_publication` |
| Tests | `tests/integration/project-publication.test.ts` | Idempotence, interruptions, reprise, corruption et protections |
| Build | fichiers `dist/` correspondants | Distribution reconstruite |

## Exigences couvertes

| ID | Exigence | Preuve |
|---|---|---|
| C3.1 | Matérialiser marker et plan après la seconde stabilisation | `framing-service.ts:223`, test de publication complète |
| C3.2 | Journaliser la transaction | `project-publication.ts:8`, `fs-project-publication-store.ts:30` |
| C3.3 | Rendre la publication idempotente et reprenable | `fs-project-publication-store.ts:118`, interruptions testées après chaque état |
| C3.4 | Exposer diagnostic et récupération dans Doctor | `fs-doctor.ts:173`, tests preview/apply et journal corrompu |
| C3.5 | Refuser marker concurrent et lien symbolique | `project-publication.test.ts:106` |
| C3.6 | Refuser une racine de sous-module | `project-publication.test.ts:106` |

## Vérifications

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS — code 0 |
| Lint ciblé sur tous les fichiers C3 | PASS — aucun warning |
| `npm run check:max-lines` | PASS — maximum 700 lignes |
| `npm run build` | PASS — distribution CLI/Web reconstruite |
| Tests C3 ciblés | PASS — 5/5 |
| Régressions framing et Doctor ciblées | PASS — 13/13 |
| Recherche `any`, `TODO`, `FIXME`, stub | PASS — 0 résultat dans le scope C3 |
| `git diff --check` | PASS |

La recette globale et les parcours E2E ne sont pas rejoués ici : ils sont volontairement confiés au provider QA à partir du brief de passation C3.

## Décisions techniques

- Le journal et ses erreurs bornées restent sous le HOME Norn ; seuls le marker et la révision publiée entrent dans le dépôt.
- Les engagements utilisent des liens durs exclusifs sur le même volume après écriture atomique et `fsync`, ce qui interdit l'écrasement concurrent.
- La réparation Doctor reprend uniquement une transaction dont les artefacts correspondent exactement à l'empreinte autorisée. Un journal illisible ou une destination divergente reste non réparable automatiquement.
- Le test de collision appelle directement le store transactionnel afin de vérifier sa propre garde ; la couche framing conserve en parallèle sa garde antérieure de divergence du snapshot.

## Problèmes détectés hors scope

—

## Handoff

→ Prêt pour recette E2E indépendante.
→ Lot suivant : **D1 — catalogue de capacités et contrats Web**.
