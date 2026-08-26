# Audit UX — entrée dans le cadrage d’une Feature

| Champ | Valeur |
|---|---|
| Référence | `AUDIT-UX-ARKANORN-cadrage-entry-20260826-01` |
| Date | 2026-08-26 |
| Source | Test utilisateur de création d’une première Feature et reprise du Product principal |
| Base auditée | `origin/main@117257359b48b5b85058e9ce3bb633d1032bba62` (`2.3.0`) |
| Périmètre | Code d’onboarding, fiche Feature, conseil Agent/Product, API Web et amorçage de l’orchestration 2.3 |

## Verdict

Le test met en évidence une boucle impossible dans le parcours d’entrée, et non un simple problème de documentation. L’utilisateur termine quatre étapes d’onboarding avec le message que l’espace est prêt, mais aucun document de cadrage n’existe. La page suivante ne propose aucune action pour en produire un. En mode automatique, Norn interdit en plus le prompt Product alors que le moteur 2.3 exige déjà un `Feature Brief` validé pour construire son DAG.

Le parcours ne pouvait donc satisfaire aucune des deux promesses perçues : ni « Norn le fait », ni « Norn me donne clairement le contexte à transmettre à ChatGPT ou Claude.ai ». La perte de la conversation Product aggravait le blocage, car l’identité durable existait dans Norn sans surface Web pour la reconnecter à une nouvelle conversation.

## Constats vérifiés

| Priorité | Constat | Preuve dans le code | Effet utilisateur |
|---|---|---|---|
| P0 | Dépendance circulaire du mode automatique | `orchestration-v23-plan-builder.ts` refuse de planifier sans `feature_brief.json` contenant des lots, tandis que `agent-cli.ts` refusait tout prompt Product en mode automatique. | Impossible de produire le document requis pour démarrer le moteur censé le produire. |
| P1 | Fin d’onboarding trompeuse | `onboarding.tsx` annonçait « workspace ready », mémorisait la route Projet puis ouvrait la vue d’ensemble. | L’utilisateur pense avoir fini, perd la Feature créée et doit deviner la suite. |
| P1 | Aucune prochaine action sur la fiche | `feature-view.tsx` affichait métriques, pipeline et une liste de documents vide sans CTA. | La Feature est un cul-de-sac fonctionnel. |
| P1 | Discours contradictoire sur les documents | Le vide documentaire affirmait que les productions apparaîtraient automatiquement. | L’utilisateur attend un traitement qui ne peut pas commencer. |
| P1 | Session Product récupérable en domaine mais invisible sur le Web | `productHandoffPrompt` savait réutiliser l’Agent et la session `main`; ni le bridge ni l’API Web ne l’exposaient. | Une conversation fermée était perçue comme une perte de travail et d’identité. |
| P1 | Premier Product bloqué par sa propre absence | Le calcul de conseil appelait `loadVerifiedFeatureContext`, qui exigeait un registre Agent avant de pouvoir guider la création du premier Agent. | Nouveau Projet bloqué dès la première fiche Feature. |
| P2 | Le vocabulaire montre l’état interne au lieu du travail à faire | « prochaine étape vérifiée », identifiants de contrats et activité d’orchestration ne répondaient pas à « que dois-je faire maintenant ? ». | Charge cognitive disproportionnée pour un utilisateur non technique. |

## Contrat UX transitoire retenu

La refonte séparée du moteur d’aide au cadrage reste hors de ce lot. La correction transitoire porte seulement sur l’entrée et la continuité :

1. Créer une Feature ne signifie pas que son cadrage est produit.
2. La fin d’onboarding ouvre directement la Feature et nomme le travail restant.
3. Tant que la prochaine étape appartient à Product, Norn prépare un contexte vérifié pour ChatGPT ou Claude.ai.
4. Si un Product existe, le contexte reprend exactement son identité et la session `main`; aucun doublon n’est créé.
5. Si aucun Product n’existe, le contexte prépare sa création et sa liaison à `main` avant le document.
6. Le mode automatique ne s’applique aux spécialistes qu’après existence d’un Feature Brief validé. La reprise Product n’est pas un fallback silencieux de provider.
7. Aucun contenu n’est envoyé à un service externe sans action humaine : l’utilisateur copie puis ouvre la conversation choisie.

## Angles morts restant hors lot

- Le prompt de reprise reste techniquement détaillé pour l’assistant destinataire, même si l’utilisateur n’a plus à le comprendre ni à exécuter ses commandes.
- ChatGPT et Claude.ai ne proposent pas de mécanisme local commun permettant à Norn d’injecter un prompt dans une conversation authentifiée ; le transfert reste volontaire par copier-coller.
- Un conflit d’identité Product réellement ambigu demande encore une résolution dans le registre Agents. Le lot refuse de choisir ou de créer silencieusement une identité concurrente.
- La configuration Web complète des profils automatiques, budgets et autorisations 2.3 reste un parcours séparé.
- Les suggestions, questions adaptatives, contrôles de complétude et critères d’acceptation appartiennent à la refonte `feature-cadrage-engine` et ne sont pas dupliqués ici.

## Critères de réussite de la correction

- Après onboarding, la route active est la fiche de la Feature créée.
- L’interface dit explicitement que le cadrage reste à produire.
- Un clic prépare un contexte Product pour ChatGPT ou Claude.ai, sans JSON brut.
- Le contexte d’un Product existant contient `agent use <id> --session main` et jamais `agent register`.
- Le contexte d’un premier Product contient sa création bornée et l’étape documentaire attendue.
- La reprise Product fonctionne en mode manuel et automatique ; les prompts spécialistes restent interdits en automatique.
- Le premier conseil fonctionne avec un registre Agent absent et zéro document, sans affaiblir la validation des auteurs existants.
