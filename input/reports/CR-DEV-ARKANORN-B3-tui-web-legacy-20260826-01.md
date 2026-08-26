# CR Dev — ARKANORN / B3-tui-web-legacy

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-B3-tui-web-legacy-20260826-01 |
| Date | 2026-08-26 |
| Agent | Codex (methode-dev) |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md` Lot B3 |
| Statut | ✅ LIVRÉ |

---

## Résultat livré

- L’espace Project du TUI ouvre un plan vivant à partir du seul résultat attendu ; il ne demande plus d’identifiant, de dossier ou de workflow.
- Le runtime TUI appelle réellement le service de framing et n’annonce l’enregistrement qu’après la révision persistée.
- L’import d’un marker historique reste une action explicite et séparée de toute création.
- Le wizard Web identité → Project → Feature → workflow et son CSS ont été supprimés.
- Le Web conserve la dernière route sûre d’un utilisateur configuré, sans republier les anciens brouillons, identifiants ou choix de pipeline.
- Les vues TUI et Web affichent `Legacy` uniquement pour les Features portant réellement la définition historique attendue.
- Les styles de navigation responsive ont été sortis du CSS onboarding supprimé ; la navigation desktop n’est plus recouverte et la barre mobile reste accessible.

## Fichiers livrés

| Groupe | Fichiers | Rôle |
|---|---|---|
| TUI | `src/adapters/inbound/tui/views/project-detail-view.ts`, `src/composition/container.ts` | Entrée framing-first et branchement au store vivant |
| Localisation | catalogues TUI/Web EN et FR | Libellés humains sans fallback de workflow |
| Projection Web | `src/application/web/contracts.ts`, `src/application/web/feature-tracking.ts` | Version de définition Pipeline exposée dans les résumés |
| Web | `web/src/App.tsx`, vues Feature/Project, helpers `app/` | Navigation reprise, labels produit et badge Legacy |
| Nettoyage | suppression de `web/src/onboarding/` et `web/src/styles/onboarding.css` | Retrait du wizard et de sa persistance de workflow |
| Responsive | `web/src/styles/mobile-navigation.css` | Navigation desktop/mobile indépendante de l’onboarding |
| Tests | E2E Essential, skills, TUI et Web ; tests Vitest | Contrats 2.3, reprise et absence de workflow implicite |
| Build | fichiers `dist/` correspondants | Distribution reconstruite |

## Exigences couvertes

| ID | Exigence | Preuve |
|---|---|---|
| B3.1 | TUI framing-first | `tui-fastdev.test.ts` saisit uniquement le résultat et vérifie l’appel de cadrage |
| B3.2 | Aucun fallback workflow | suppression de `fallbackWorkflows`, du catalogue TUI de création et recherche statique sans résultat |
| B3.3 | Import v4 maintenu | action TUI `Importer une Feature existante` inchangée côté port métier |
| B3.4 | Wizard Web supprimé | suppression des quatre modules `web/src/onboarding` et du CSS dédié |
| B3.5 | Préférences v1 lisibles, workflow ignoré à l’écriture | `navigation-memory.test.ts`, effet de persistance minimal dans `App.tsx` |
| B3.6 | Badge Legacy exact | tests TUI v3/v4 et test Web `legacy-2.0`/`2.3` |
| B3.7 | Parcours responsive utilisable | E2E Playwright desktop, 390 px, clavier et axe-core |

## Vérifications

| Commande | Résultat |
|---|---|
| `npm run typecheck` | PASS — code 0 |
| `npm run lint` | PASS — code 0, aucun warning |
| `npm run build` | PASS — bundle Web reconstruit |
| `npm run check:max-lines` | PASS |
| `npm run check:language` | PASS |
| `npm run test:unit` | PASS — 155/155 |
| `npm run test:integration` | PASS — 110/110 |
| `npm run test:web` | PASS — 18/18 |
| `npm run test:web:e2e` | PASS — 2/2, desktop/mobile/accessibilité |
| E2E TUI ciblés | PASS — 14/14 puis navigation 11/11 après ajustement |
| E2E Essential et skills ciblés | PASS — 1/1 et 2/2 |
| E2E packaging et cycle Web local | PASS — 2/2 avec ports loopback autorisés |
| `git diff --check` | PASS |

## Décisions techniques

- Le choix du pipeline reste une conséquence du plan publié. Il n’est présenté ni demandé lors de l’entrée TUI/Web.
- La compatibilité de navigation réutilise l’enveloppe de préférences v1 pour ne pas casser les installations existantes, mais les nouvelles écritures sont réduites à `lastRoute` et ne contiennent aucun draft ou pipeline.
- Le badge TUI suit strictement le marker v4 demandé par le Lot. La projection Web s’appuie sur `pipelineDefinitionVersion`, car les résumés ne transportaient pas encore `schemaVersion`.
- Les composants génériques de formulaires restent disponibles ; seul le consommateur onboarding sans aval a été supprimé.

## Migration et rollback

- Aucune Feature historique n’est modifiée.
- Une préférence Web v1 existante reste lisible pour `lastRoute`; ses champs de création ne sont plus consommés ni réenregistrés.
- Rollback : restaurer les modules onboarding et les vues TUI précédentes, puis reconstruire `dist/`. Aucun état produit n’a besoin de conversion.

## Handoff

→ Prêt pour recette QA indépendante.
→ Lot suivant : **C1 — ProjectDraft store**.
