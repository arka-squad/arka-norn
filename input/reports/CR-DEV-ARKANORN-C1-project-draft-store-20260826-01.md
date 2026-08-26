# CR Dev — ARKANORN / C1-project-draft-store

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-C1-project-draft-store-20260826-01 |
| Date | 2026-08-26 |
| Agent | Codex (methode-dev) |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md` Lot C1 |
| Statut | ✅ LIVRÉ |

---

## Résultat livré

- `framing enter` dans un dossier sans marker crée désormais un `ProjectDraft` privé sous le HOME Norn et ne modifie plus le dépôt produit.
- Le service de cadrage fonctionne avec une projection Project issue du draft ; un Project matérialisé n’est plus un prérequis pour créer, afficher, reprendre ou stabiliser un plan.
- Une nouvelle entrée reprend le draft par racine canonique et vérifie l’empreinte de son identité physique avant de poursuivre.
- Le store refuse les collisions d’identifiant et détecte une racine déplacée, remplacée, remontée sur un autre volume ou rattachée à une autre racine Git.
- Le marker Project reste matérialisé uniquement lors de la publication consécutive à la seconde stabilisation. La transaction complète et sa récupération sont réservées au Lot C3.
- La sortie CLI qualifie explicitement le cycle de vie `draft` ou `materialized` sans exposer de secret.

## Fichiers livrés

| Groupe | Fichiers | Rôle |
|---|---|---|
| Domaine | `src/domain/project/project-draft.ts`, `schemas/project-draft.schema.json` | Contrat public v1, validation et états de matérialisation |
| Port | `src/ports/outbound/project-draft-store.ts` | Résolution, vérification et transition du draft |
| Store | `src/adapters/outbound/filesystem/fs-project-draft-store.ts` | Persistance atomique 0600 et contrôle d’identité de racine |
| Application | `src/application/framing/framing-service.ts`, `src/ports/inbound/for-framing.ts` | Contexte Project matérialisé ou draft et reprise sans marker |
| Composition/CLI | `src/composition/framing-runtime.ts`, `src/adapters/inbound/cli/framing-cli.ts` | Injection du store et projection du cycle de vie |
| Tests | `tests/unit/project-draft.test.ts`, `tests/integration/project-draft-store.test.ts`, tests framing | Contrat, sécurité de racine, absence d’effet de bord et non-régression |
| Build | fichiers `dist/` correspondants | Distribution reconstruite |

## Exigences couvertes

| ID | Exigence | Preuve |
|---|---|---|
| C1.1 | Contrat et store Home atomique | JSON Schema v1, `writeJsonAtomic`, verrou global de résolution et fichiers privés 0600 |
| C1.2 | Framing sans Project matérialisé | `FramingService` crée une projection depuis le draft ; aucun appel `projects.create` avant publication |
| C1.3 | Reprise canonique et empreinte | test de reprise de `root/.` vers le même journal et vérification de `rootFingerprint` |
| C1.4 | Collision d’identifiant | test de deux racines distinctes avec le même identifiant, refus déterministe |
| C1.5 | Déplacement/changement de volume | empreinte liée au chemin canonique, device, inode et Git root ; tests déplacement et remplacement |
| C1.6 | Aucun effet de bord précoce | tests CLI et intégration : absence de `.arka-norn` après `enter` et première stabilisation |

## Vérifications

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS — code 0 |
| `npm run lint` | PASS — code 0, aucun warning |
| `npm run build` | PASS — distribution et Web reconstruits |
| `npm run check:max-lines` | PASS |
| `npm run check:language` | PASS après correction d’un commentaire A1 resté en français |
| Tests C1 ciblés | PASS — 10/10 |
| `npm run test:unit` | PASS — 156/156 |
| `npm run test:integration` | PASS — 112/112 |
| `git diff --check` | PASS |

## Décisions techniques

- La projection compatible reste un objet `Project` en mémoire afin de ne pas dupliquer les règles de cible dans les consommateurs existants. `FramingEntry.projectDraft` porte explicitement la distinction de cycle de vie.
- `rootFingerprint` couvre le chemin réel, l’identité de volume, l’inode et la racine Git disponible. Il détecte une substitution au même chemin, contrairement à une empreinte du chemin seul.
- Le store reconstruit sa liste depuis les répertoires de drafts et ne dépend pas d’un index fragile. La résolution concurrente est sérialisée par un verrou privé.
- L’état `publishing`/`recovery_required` est déjà disponible pour C3, mais C1 ne prétend pas encore fournir la transaction de publication multi-fichiers ni Doctor recovery.

## Migration et rollback

- Aucun marker ni Project existant n’est réécrit à la lecture.
- Les anciens cadrages dont le marker a déjà été créé continuent par le chemin matérialisé.
- Les nouveaux drafts sont des fichiers privés ajoutés ; un rollback du code les laisse inertes et ne modifie pas le dépôt produit.

## Handoff

→ Prêt pour recette QA indépendante.
→ Lot suivant : **C2 — projection Web/TUI des drafts**.
