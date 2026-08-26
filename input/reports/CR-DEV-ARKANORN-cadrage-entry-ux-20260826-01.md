# CR-DEV — UX d’entrée dans le cadrage et reprise Product

| Champ | Valeur |
|---|---|
| Référence | `CR-DEV-ARKANORN-cadrage-entry-ux-20260826-01` |
| Date | 2026-08-26 |
| Branche | `codex/cadrage-entry-ux` |
| Base | `origin/main@117257359b48b5b85058e9ce3bb633d1032bba62` |
| Version de livraison | `2.3.1` |
| Worktree | `/private/tmp/arka-norn-cadrage-entry-ux` |
| Lot séparé préservé | `features/feature-cadrage-engine` dans le working tree utilisateur |
| Statut | PRÊT POUR RECETTE |

## Résultat livré

Le premier cadrage n’est plus un cul-de-sac. La fin d’onboarding explique que la Feature est créée mais que son document reste à produire, puis ouvre directement sa fiche. Une carte de prochaine action y propose de continuer avec le Product dans ChatGPT ou Claude.ai à partir d’un contexte calculé par Norn.

La reprise est stable : un Product existant est reconnecté à la session `main` sans nouvelle identité ; en l’absence de Product, le contexte prépare sa création avant l’exécution de l’unique étape attendue. Ce point reste disponible en mode automatique parce que le DAG 2.3 dépend d’un Feature Brief déjà validé. Les prompts manuels d’architecture, audit, développement et QA restent interdits dans ce mode.

## Modifications principales

- Nouveau contrat Web `FeatureContinuationView` pour exposer une prochaine action humaine, l’état Product et la frontière manuel/automatique sans publier le contexte interne complet.
- Nouveau contrat `ProductPromptView` et route locale authentifiée de préparation explicite du contexte Product.
- Reprise par `productHandoffPrompt` lorsqu’une identité existe ; initialisation bornée lorsqu’elle manque.
- Exception publique limitée à `agent prompt product` et `agent handoff-prompt` en mode automatique ; aucun fallback spécialiste.
- Conseil Agent possible sur une Feature vide sans registre préalable, avec contrôle de confinement et registre d’auteurs vide. Tout auteur de document existant reste vérifié.
- Carte de prochaine action responsive, état d’identité clair, choix ChatGPT/Claude.ai, aperçu humain du contexte, copie volontaire et ouverture externe.
- Fin d’onboarding et route mémorisée dirigées vers la Feature, avec textes français et anglais non ambigus.
- Contrat `$arka-product` régénéré avec checksum : amorçage Product autorisé, orchestration spécialiste isolée.

## Sécurité et limites

- La route de prompt ne mute ni le Projet, ni la Feature, ni le registre : elle prépare un contexte seulement après une action explicite.
- Aucun secret, token ou configuration navigateur n’est transmis.
- Le navigateur n’envoie rien automatiquement à ChatGPT ou Claude.ai. Le copier-coller reste sous contrôle humain.
- Un conflit de session Product n’est jamais résolu par un choix implicite.
- Le moteur de questions et de suggestions de cadrage en préparation par l’utilisateur n’a pas été modifié.

## Preuves de vérification

| Gate | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zéro avertissement |
| `npm test` | PASS — suites unitaires, intégration et E2E CLI |
| `npm run test:unit` | PASS — 135/135 |
| `npm run test:web` | PASS — 22/22 |
| `npm run test:web:e2e` | PASS — 2/2, onboarding → Feature → contexte ChatGPT |
| `npm run build` | PASS — bundle Web et `dist/` régénérés |
| `npm run check:max-lines` | PASS — plafond de 700 lignes respecté |
| `npm run check:language` | PASS |
| `npm run check:js-syntax` | PASS — 35 fichiers |
| `npm run release:verify` | PASS — couverture, benchmark, audits et paquet `2.3.1` |
| `npm pack --dry-run --ignore-scripts` | PASS — 727 fichiers, 2,0 MB compressés |
| `git diff --check` | PASS |

## Fichiers structurants

- Contrats et service : `src/application/web/contracts.ts`, `src/application/web/project-tracking-service.ts`.
- Orchestration Product : `src/application/agents/agent-orchestration.ts`, `src/composition/agent-orchestration-runtime.ts`, `src/adapters/inbound/cli/agent-cli.ts`.
- API et composition : `src/adapters/inbound/web/api-router.ts`, `src/composition/web-runtime.ts`.
- Interface : `web/src/views/feature-continuation.tsx`, `web/src/views/feature-view.tsx`, `web/src/onboarding/onboarding.tsx`, `web/src/styles/views.css`.
- Contrat Agent : `scripts/generate-v2-skills.mjs`, `skills-src/arka-product.json`, `skills-src/catalog/skills.json`.
- Recette : `tests/unit/agent-orchestration.test.ts`, `tests/unit/cli-adapters.test.ts`, `tests/unit/skills-catalog.test.ts`, `tests/web/norn-web.spec.ts`.

## Handoff

La recette humaine doit vérifier deux cas : un nouveau Projet sans Agent, puis un Projet dont le Product existe mais dont la conversation a été perdue. Dans le second cas, le contexte affiché doit annoncer la réutilisation et contenir la sélection du même Agent dans `main`. Le passage vers les missions automatiques ne doit être évalué qu’après validation du Feature Brief.
