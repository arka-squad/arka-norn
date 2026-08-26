# CR Dev — ARKANORN / C2-draft-projections

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-C2-draft-projections-20260826-01 |
| Date | 2026-08-26 |
| Agent | Codex (methode-dev) |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md` Lot C2 |
| Statut | ✅ LIVRÉ |

---

## Résultat livré

- Les listes Projects du Web et de la TUI réunissent désormais les Projects matérialisés et les `ProjectDraft` actifs dans une projection explicitement distincte.
- Un draft ouvre sa vue de cadrage, expose sa nature, sa révision et son prochain mouvement, sans afficher de métriques ou mutations qui exigent un marker.
- Les entrées « créer un Project » du Web et de la TUI ouvrent directement un cadrage depuis un dossier existant. Elles ne demandent plus nom, identifiant, Feature, workflow ou mode d’orchestration.
- Toutes les destinations qui dépendent du marker sont désactivées avec l’explication fonctionnelle « disponible après publication du plan de cadrage ».
- Une route mémorisée vers le plan d’un draft reste reprenable sans Feature ni session provider historique. Une ancienne route Feature invalide est rabattue vers la vue Project la plus proche.
- La projection d’un état `recovery_required` reste visible et bloquée ; elle n’est jamais confondue avec un Project disparu.

## Fichiers livrés

| Groupe | Fichiers | Rôle |
|---|---|---|
| Contrats Web | `src/application/web/contracts.ts`, `src/ports/inbound/for-framing.ts` | Cycle de vie, capacité marker et lecture des drafts |
| Projection | `src/application/web/project-tracking-service.ts`, `src/application/web/project-draft-projection.ts` | Agrégation Projects/drafts et capacités bornées |
| API | `src/adapters/inbound/web/api-router.ts`, `web/src/bridge/http-bridge.ts` | Entrée de cadrage Project depuis le dossier |
| TUI | `src/adapters/inbound/tui/views/home-view.ts`, `src/composition/container.ts` | Liste unifiée, création framing-first et reprise du plan |
| Web | `web/src/views/projects-view.tsx`, `project-overview.tsx`, `App.tsx`, `app-shell.tsx` | Parcours draft, navigation bornée et explication humaine |
| Reprise | `web/src/app/navigation-memory.ts` | Validation et récupération de la dernière route sans Feature |
| Localisation | catalogues TUI/Web EN et FR | Libellés framing-first et états draft/récupération |
| Tests | tests TUI, intégration Web, composants Web et Playwright | Non-régression des deux cycles de vie et responsive |
| Build | fichiers `dist/` correspondants | Distribution reconstruite |

## Exigences couvertes

| ID | Exigence | Preuve |
|---|---|---|
| C2.1 | Draft visible dans la liste Projects | test d’intégration `web-project-drafts` et parcours Playwright |
| C2.2 | État et cadrage visibles | fiche draft, badge, prochain mouvement et `FramingCard` |
| C2.3 | Mutations marker désactivées | navigation desktop/mobile désactivée, vue sans métriques ni Feature table |
| C2.4 | Explication fonctionnelle | message publication requise ou récupération requise selon l’état |
| C2.5 | Reprise sans Feature/session historique | projection de route et test de reprise directe du plan vivant |
| C2.6 | Aucune matérialisation précoce | Playwright vérifie l’absence de `.arka-norn/project.json` après l’entrée Web |
| C2.7 | Compatibilité Project matérialisé | second parcours Playwright conserve création de cadrage Feature, Doctor et navigation complète |

## Vérifications

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS — code 0 |
| `npm run lint` | PASS — code 0, aucun warning |
| `npm run check:max-lines` | PASS — projection draft extraite du service Web |
| `npm run check:language` | PASS — source canonique anglaise |
| `npm run build` | PASS — distribution CLI/Web reconstruite |
| `npm run test:unit` | PASS — 156/156 |
| `npm run test:integration` | PASS — 113/113 en exécution isolée |
| `npm run test:e2e` | PASS — 67/67 |
| `npm run test:web` | PASS — 20/20 |
| `npm run test:web:e2e` | PASS — 3/3 |
| Tests ciblés après extraction finale | PASS — intégration draft 1/1, Web 5/5, Playwright 3/3 |
| `git diff --check` | PASS |

## Note de recette

Une première exécution des suites en parallèle a fait échouer le test temporel POSIX qui attend l’écriture du PID d’un descendant provider. Le même fichier a passé 4/4 immédiatement en isolation, puis la suite d’intégration complète a passé 113/113 sans concurrence. Aucun code worker n’a été modifié dans ce lot.

## Décisions techniques

- Le cycle de vie est porté par les contrats Web (`draft` ou `materialized`) au lieu d’être inféré d’un compteur ou d’une erreur de chargement.
- Les capacités sont négatives et explicites sur un draft : `markerReady: false` avec une raison stable. Les consommateurs ne tentent donc pas une mutation avant de découvrir son échec.
- La projection draft est isolée dans un module pur afin de conserver le service d’agrégation sous la limite de taille et de rendre les états récupération/cadrage auditables.
- L’ancienne API de création directe reste disponible pour compatibilité interne, mais les entrées principales Web/TUI ne l’utilisent plus.
- La reprise mémorise une route produit, pas une session d’Agent. Une route de cadrage valide reste exacte ; une route Feature devenue impossible revient au Project.

## Migration et rollback

- Aucun marker, Project ou Feature existant n’est migré ou réécrit.
- Un rollback du code laisse les drafts privés C1 intacts sous le HOME Norn.
- Les Projects matérialisés conservent leur navigation et leurs mutations historiques.

## Handoff

→ Prêt pour recette QA indépendante.
→ Lot suivant : **C3 — publication atomique ProjectDraft → Project et récupération**.
