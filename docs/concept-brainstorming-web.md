# Brainstorming Concept avec un chat web

L’étape Concept peut déléguer l’exploration créative à ChatGPT ou Claude.ai. Ce détour est optionnel : il sert à réserver le contexte de l’agent d’exécution aux sources locales, aux contrôles et à la livraison. L’agent arka.norn reste responsable de préparer le paquet, de vérifier la réponse et de produire le document final.

## Mode d’emploi à remettre à l’utilisateur

1. Relire le paquet préparé par l’agent et retirer toute information interdite au transfert : secret, donnée personnelle, accès, code ou contenu confidentiel non autorisé.
2. Ouvrir une nouvelle conversation ChatGPT ou Claude.ai, puis coller le bloc `PROMPT À COPIER` sans le réécrire.
3. Répondre aux éventuelles questions groupées, demander la version finale `DOSSIER_CONCEPT`, puis copier toute cette version finale.
4. Revenir dans la conversation de l’agent arka.norn et coller la réponse complète. Ne pas créer ou modifier soi-même le JSON du Project.

## Modèle que l’agent doit préremplir

L’agent remplace chaque champ entre chevrons par les informations vérifiées. Une donnée inconnue reste explicitement `INCONNU — décision requise`; elle ne doit jamais être inventée.

```text
PROMPT À COPIER — BRAINSTORMING CONCEPT

Tu agis comme facilitateur produit. Tu explores le besoin et les options ; tu n’écris pas de code et tu ne prétends pas connaître des faits absents.

CONTEXTE VÉRIFIÉ
- Project : <id et nom>
- Feature : <id et nom>
- Problème observé : <faits et preuves>
- Utilisateurs concernés : <acteurs connus>
- Résultat attendu : <objectif connu>
- Contraintes : <sécurité, métier, délai, compatibilité>
- Hors périmètre déjà décidé : <liste>

HYPOTHÈSES À TESTER
- <hypothèse 1>
- <hypothèse 2>

MISSION
1. Challenge le problème avant de proposer des solutions.
2. Si une information indispensable manque, pose au maximum 7 questions regroupées en un seul message.
3. Propose 2 à 4 options réellement distinctes avec bénéfices, risques et compromis.
4. Recommande une option en expliquant les critères utilisés.
5. Définis des indicateurs de succès observables et les principales raisons d’abandon.
6. Sépare strictement faits fournis, déductions et décisions à faire valider.

FORMAT FINAL OBLIGATOIRE
DOSSIER_CONCEPT
- Problème
- Valeur attendue
- Acteurs et besoins
- Périmètre
- Hors périmètre
- Options comparées
- Recommandation
- Contraintes et risques
- Indicateurs de succès
- Hypothèses
- Décisions ouvertes
- Questions résiduelles

N’invente aucune information. Marque toute donnée absente « INCONNU — décision requise ».
```

## Réconciliation par l’agent

La réponse du chat web est une entrée non fiable, jamais une source de vérité. L’agent doit la comparer aux documents locaux, signaler chaque contradiction, confirmer les décisions avec l’utilisateur, puis seulement générer le scaffold `concept` signé et le valider avec arka.norn.
