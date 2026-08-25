# CR-DEV — UX onboarding et ergonomie Norn Web

- Date : 25 août 2026
- Branche : `ux-onboarding-ergonomie`
- Base : `669b4e5` (`v2.2.5`)
- Cadrage : `features/web-project-tracking/ux-onboarding-ergonomie.md`
- Brief produit : `features/norn-web-onboarding/feature_brief.json`
- Statut : **prêt pour recette QA**

## Résultat livré

Le premier incrément remplace la modale de profil isolée par un parcours guidé cohérent en quatre étapes : identité locale, Projet existant, première Feature, puis récapitulatif vérifié. La progression est durable, liée au profil humain et reprise après rechargement sans recréer les ressources.

L'incrément comprend également :

- une migration silencieuse des utilisateurs legacy vers un état `not_started`, afin de mémoriser leur dernière route sans déclarer artificiellement l'onboarding terminé ;
- la création des Features sous `<project>/features/<slug>` ;
- des workflows présentés par intention humaine, sans alias technique en libellé principal ;
- la restauration de la dernière route encore valide et un repli vers la ressource parente avec message explicatif ;
- la restauration de la position de lecture des documents, liée au profil et à la route ;
- une navigation mobile `Vue / Features / Documents / Plus`, sans débordement à 390 px ;
- une feuille « Plus » modale avec focus initial, piège clavier, fermeture par Échap et restitution du focus ;
- l'humanisation des workflows et prochaines étapes dans les vues critiques.

## Contrats et sécurité

- État versionné `schemaVersion: 1` : statut, étape, brouillons non sensibles, identifiants Project/Feature, dernière route et date de mise à jour.
- Persistance locale dans les préférences Norn, portée au schéma 4 et liée à `ownerHumanProfileId`.
- Aucune santé, liste de documents ou projection métier dupliquée dans l'état d'onboarding.
- Aucune clé, aucun secret, aucun credential et aucun jeton persistant.
- Le statut `completed` est refusé sans première Feature.
- Les routes externes et les pipelines non canoniques sont refusés par le domaine.
- L'étape suivante n'est affichée qu'après confirmation de l'écriture durable, ce qui ferme la fenêtre de rechargement prématuré.

## Traçabilité des critères

| Critère | Preuve |
|---|---|
| AC-UX-01 | E2E : identité → Projet → Feature → récapitulatif → vue d'ensemble en quatre étapes. |
| AC-FUNC-01 | E2E : rechargements aux étapes Projet, Feature et récapitulatif ; brouillons restaurés ; compteur de Features égal à 1. |
| AC-FUNC-02 | Tests du modèle d'entrée : first run, legacy configuré, complété, propriétaire différent, Projet disparu ; résolution de route vers le parent valide. |
| AC-FUNC-03 | Test domaine et E2E : `in_progress` avant la validation finale ; `completed` uniquement avec une Feature. |
| AC-UX-02 | E2E et inspection réelle à 390 px : aucune largeur excédentaire, quatre destinations visibles, cibles tactiles de 55 px, feuille « Plus » accessible. |
| AC-CODE-01 | Relecture Project/Feature après mutation ; état minimal ; chemins `features/<slug>` ; libellés humanisés. |
| AC-SEC-01 | Test de persistance locale liée au profil ; recherche statique des champs sensibles ; API Web toujours limitée au loopback avec Bearer et Origin stricts. |

## Fichiers principaux

- Domaine et persistance : `src/domain/onboarding/web-onboarding-state.ts`, `src/adapters/outbound/filesystem/fs-locale-preference-store.ts`, `src/application/web/contracts.ts`, `src/application/web/project-tracking-service.ts`.
- Parcours : `web/src/onboarding/onboarding.tsx`, `web/src/onboarding/onboarding-gate.tsx`, `web/src/onboarding/onboarding-model.ts`, `web/src/styles/onboarding.css`.
- Navigation et reprise : `web/src/App.tsx`, `web/src/app/router.ts`, `web/src/layout/app-shell.tsx`.
- Humanisation : catalogues EN/FR, `pipeline-rail.tsx`, `project-overview.tsx`, `features-view.tsx`, `feature-view.tsx`.
- Tests : `tests/unit/web-onboarding-state.test.ts`, `web/src/onboarding/onboarding-model.test.ts`, `tests/web/norn-web.spec.ts`.
- Artefacts `dist/` régénérés par la construction complète.

## Vérifications exécutées

| Vérification | Résultat |
|---|---|
| `npm run build` | OK — bundle de production et artefacts `dist/`. |
| `npm run typecheck` | OK. |
| `npm run lint` | OK, zéro avertissement. |
| `npm run check:language` | OK. |
| `npm run check:max-lines` | OK, maximum 700 lignes. |
| `npm run test:unit` | OK — 124/124. |
| `npm run test:web` | OK — 20/20. |
| Playwright final répété 3 fois | OK — 6/6. |
| `npm test` | 272/274 dans le sandbox ; les 2 seuls échecs étaient `EPERM` sur l'écoute loopback. |
| Tests loopback isolés autorisés | OK — packaging 1/1 et cycle Web CLI 1/1. |
| Inspection navigateur réelle | OK — 1280 px et 390 px, aucun overflow ni log console ; focus mobile vérifié. |

## Limites assumées

Les refontes approfondies des vues Gouvernance, résultat d'audit, sommaire Documents, Agents, Activité et Relations appartiennent aux lots UX 2 à 4 du cadrage et ne sont pas incluses dans cet incrément.

Le worktree contenait des changements et artefacts antérieurs ou concurrents (`.arka-norn`, dossiers d'audit/orchestration, archives npm, autres Features). Ils ont été préservés et ne sont pas revendiqués dans ce CR. Aucun commit n'a été créé automatiquement.
