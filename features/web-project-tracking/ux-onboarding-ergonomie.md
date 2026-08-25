# Cadrage UX — onboarding et ergonomie des vues Norn Web

> Document de travail — 24 août 2026
>
> Périmètre : interface Web locale d'Arka Norn
>
> Nature : audit du code réel et proposition de parcours, hors document signé du pipeline

## 1. Intention produit

Norn Web doit permettre à une personne qui ne maîtrise ni le terminal ni les contrats JSON de répondre immédiatement à quatre questions :

1. Dans quel Projet et quelle Feature suis-je ?
2. Qu'est-ce qui demande réellement mon attention ?
3. Quelle est la prochaine action utile ?
4. Quelle preuve vérifiée justifie cet état ?

La hiérarchie d'information commune à toutes les vues est donc :

1. **Action ou décision attendue** ;
2. **état vérifié et fraîcheur de cet état** ;
3. **preuves, détails techniques et provenance**.

Principe directeur : **l'interface explique le Projet sans devenir une seconde source de vérité**.

## 2. Point de départ observé dans le code

L'expérience actuelle ne possède pas encore de véritable onboarding :

- si aucun profil humain n'existe, `web/src/App.tsx` affiche `ProfileDialog` au-dessus de la route courante ;
- cette modale demande un nom et un courriel, sans expliquer clairement le rôle de l'identité dans les décisions de gouvernance ;
- après validation, un nouvel utilisateur arrive sur la liste vide des Projets puis ouvre une seconde modale pour enregistrer un dossier ;
- l'étape suivante — créer une première Feature et choisir son workflow — est séparée de cette première expérience ;
- aucune progression d'onboarding, reprise de brouillon ou destination récente n'est persistée par le routeur ;
- la navigation repose sur le hash, mais ne remet pas la page en haut lors d'un changement de ressource ;
- sur mobile, les neuf entrées du rail deviennent une rangée horizontale dont une partie reste hors écran.

Le formulaire de préparation d'audit constitue en revanche un bon modèle de conception déjà présent dans Norn : il commence par la décision à éclairer, recommande une configuration, explique la lecture seule, permet l'ajustement, puis demande une confirmation avant l'exécution.

## 3. Ce que l'on reprend de Cortex Deck

Le dépôt Cortex Deck apporte quatre principes pertinents, observés dans son code d'onboarding et de navigation :

- **reprendre plutôt que recommencer** : l'étape et les choix sont persistés, et un rechargement ne ramène pas artificiellement à l'accueil ;
- **dire la vérité** : une destination ouvre exactement l'espace annoncé, un compteur représente un fait réel et une opération longue décrit ce qui se passe ;
- **divulguer progressivement** : l'utilisateur choisit d'abord une intention, les identifiants et réglages techniques restent secondaires ;
- **rendre les mutations immédiatement visibles** : après une création ou une modification, le rail et la vue active reflètent le nouvel état.

La forme actuelle de son tunnel en huit étapes ne doit pas être reproduite : l'audit de Cortex lui-même la considère trop technique pour une personne non spécialiste. Norn n'a notamment pas à demander la configuration d'un fournisseur IA, des workers ou d'un Agent dans son onboarding Web. L'interface Web observe les Agents mais ne les pilote pas.

## 4. Parcours d'onboarding cible

### 4.1 Règles d'entrée

L'onboarding ne doit apparaître que lorsqu'il apporte une décision utile.

| Situation détectée | Comportement attendu |
|---|---|
| Profil présent et Projet déjà enregistré | Ouvrir la dernière route encore valide ; ne pas afficher l'onboarding. |
| Profil absent mais Projet existant | Demander l'identité, expliquer son usage, puis reprendre le dernier contexte. |
| Aucun Projet enregistré | Démarrer le parcours guidé après l'identité. |
| Parcours interrompu | Reprendre l'étape exacte avec les champs déjà saisis. |
| Route récente devenue invalide | Ouvrir le Projet concerné et expliquer sobrement pourquoi la destination précédente n'existe plus. |

Un rechargement d'interface n'est pas un nouveau démarrage. Dans le doute, Norn privilégie la reprise du contexte valide.

### 4.2 Parcours recommandé en quatre étapes

#### Étape 1 — Vous et votre rôle

**Question affichée :** « Qui prendra les décisions dans Norn ? »

- Nom obligatoire ; courriel facultatif.
- Explication courte : cette identité signe les décisions humaines, elle n'est pas un compte en ligne.
- Aucun identifiant technique visible par défaut.
- Action principale : **Continuer**.

La promesse produit tient en une phrase : « Norn rassemble l'état vérifié de vos livraisons, les preuves produites et les décisions encore ouvertes. »

#### Étape 2 — Relier un Projet

**Question affichée :** « Quel produit voulez-vous suivre ? »

Deux choix orientés par l'intention :

- **Ouvrir un dossier produit existant** — choix principal ;
- **Créer un nouveau dossier produit** — choix secondaire si cette capacité est réellement prise en charge par le contrat.

Le nom est dérivé du dossier puis reste modifiable. L'identifiant stable est rangé dans « Détails techniques ». Avant validation, Norn affiche précisément ce qu'il va écrire dans le dossier et rappelle qu'aucun fichier produit n'est déplacé ni envoyé en ligne.

Action principale : **Enregistrer et analyser le Projet**.

L'opération doit produire un état honnête : analyse en cours, Projet reconnu, permissions insuffisantes, marqueur incompatible ou échec récupérable. Un message de succès ne doit être affiché qu'après relecture de la projection créée.

#### Étape 3 — Premier résultat à livrer

**Question affichée :** « Quel résultat voulez-vous obtenir en premier ? »

- Le nom décrit un résultat attendu, pas une tâche technique.
- Le dossier est proposé selon la convention réelle du Projet.
- Le workflow est choisi par cartes d'intention localisées :
  - **FastDev** : correction ou amélioration UX bornée ;
  - **Essential** : Feature comprise et livraison produit complète ;
  - **Complete** : transformation structurelle, incertaine ou fortement dépendante.
- Le workflow recommandé explique « pourquoi ce choix » et peut être changé.
- Les alias techniques (`default`, `complete`, identifiants `arka-norn-*`) ne sont jamais présentés comme des libellés utilisateur.

Si le Projet contient déjà des Features détectées, cette étape devient une confirmation : ouvrir une Feature existante ou en ajouter une. Elle ne recrée jamais une ressource existante.

Action principale : **Créer la Feature** ou **Ouvrir la Feature sélectionnée**.

#### Étape 4 — Prêt à avancer

La dernière vue n'est pas une célébration vide. Elle récapitule :

- le Projet relié et son dossier ;
- le nombre de Features et de documents réellement détectés ;
- la Feature sélectionnée ;
- son workflow, son état vérifié et sa prochaine étape ;
- les éventuelles anomalies ou limites de couverture.

Action principale : **Ouvrir la vue d'ensemble**.

Action contextuelle : **Voir la prochaine étape de la Feature**.

### 4.3 Reprise et persistance

Le parcours nécessite un état durable minimal, versionné et lié à l'identité locale :

- statut : `not_started`, `in_progress`, `completed` ;
- étape courante ;
- brouillons de formulaire non sensibles ;
- identifiants du Projet et de la Feature déjà créés ;
- dernière route valide ;
- date de dernière mise à jour.

Les ressources créées restent autoritaires : l'état d'onboarding ne duplique ni leur santé, ni leurs documents, ni leur workflow. Après chaque mutation, Norn relit la ressource, mémorise son identifiant et rend l'opération idempotente pour éviter les doublons lors d'une reprise.

« Reprendre plus tard » est disponible après l'enregistrement de l'identité. Il ferme le tunnel pour la session sans marquer l'onboarding comme terminé.

## 5. Ergonomie du shell et de la navigation

### 5.1 Rail de navigation sur ordinateur

Les neuf destinations actuelles sont regroupées par intention :

- **Piloter** : Vue d'ensemble ;
- **Livrer** : Features, Documents ;
- **Décider et vérifier** : Décisions, Audits ;
- **Observer** : Agents, Activité ;
- **Explorer** : Relations ;
- **Configurer** : Réglages.

Le rail respecte les règles suivantes :

- le Projet actif est un sélecteur de contexte, pas seulement un libellé ;
- le clic sur un nom ouvre exactement la ressource nommée ;
- seuls les compteurs utiles et issus du modèle réel sont affichés ;
- le compteur « Décisions » porte uniquement les éléments ouverts ;
- l'état « En direct » ne doit pas être confondu avec l'activité d'un Agent ;
- après création d'une Feature ou d'une décision, les compteurs sont rafraîchis immédiatement ;
- le rail peut devenir compact, mais chaque icône conserve un nom accessible et une infobulle.

### 5.2 Navigation mobile

La rangée horizontale actuelle n'est pas une solution suffisante : à 390 px, plusieurs destinations sont invisibles sans indice de débordement.

Recommandation : une barre contextuelle limitée à **Vue**, **Features**, **Documents** et **Plus**, où « Plus » ouvre une feuille regroupant Décisions, Audits, Agents, Activité, Relations et Réglages. Le Projet actif reste visible dans l'en-tête et permet de changer de Projet.

Les actions de page ne doivent pas pousser le titre hors écran. Une modale complexe devient une feuille plein écran sur mobile, avec une action principale fixe en bas et une zone de contenu qui défile indépendamment.

### 5.3 Navigation et défilement

- Une nouvelle route commence en haut de sa zone de contenu.
- Les boutons retour et précédent du navigateur conservent leur comportement attendu.
- Un rechargement restaure la route et, pour une lecture longue, peut restaurer la position de lecture.
- Ouvrir un autre document remet en haut ; revenir au document précédent restaure sa position.
- Les fils d'Ariane sont cliquables et montrent aussi la Feature et le document lorsqu'ils sont actifs.

## 6. Ergonomie vue par vue

| Vue | Question principale | À conserver | Évolution prioritaire |
|---|---|---|---|
| **Projets** | Quel produit dois-je ouvrir ? | Liste sobre, dossier et santé. | Transformer l'état vide en entrée d'onboarding ; ajouter recherche/récents lorsque le volume le justifie ; distinguer « enregistrer un dossier » de « créer un dossier ». |
| **Vue d'ensemble** | Que dois-je regarder maintenant ? | Métriques, signaux et accès aux Features. | Rendre le titre d'attention conditionnel ; présenter d'abord la prochaine action, puis la santé et les preuves ; ne pas donner la même importance aux zéros sains et aux anomalies. |
| **Features** | Quelle livraison avance ou bloque ? | Tableau synthétique et création guidée. | Libellés de workflows localisés ; filtres par attention/état ; prochaine étape lisible ; corriger la proposition de dossier pour suivre la convention réelle du Projet. |
| **Détail Feature** | Quelle est la prochaine étape et pourquoi ? | Rail du pipeline, documents et anomalies. | Faire de la prochaine étape l'action principale ; traduire les identifiants ; regrouper les documents par étape ; expliquer les prérequis et les preuves attendues. |
| **Documents** | Quelle preuve dois-je lire ? | Index, filtres, vue humaine et JSON technique. | Ajouter une table des matières, une recherche dans le document, des liens précédent/suivant et une provenance repliée ; remettre la lecture en haut à l'ouverture. |
| **Décisions** | Quelle décision humaine reste ouverte ? | Registre append-only et historique. | Remplacer les enums bruts par des intentions humaines ; sélectionner une cible parmi les ressources réelles plutôt que saisir son identifiant ; rendre résolution et effet attendus explicites. |
| **Audits** | Quelle décision l'audit doit-il éclairer ? | Le parcours actuel orienté intention, la recommandation et la confirmation du plan. | Pour un audit terminé, afficher verdict, constats, sévérité, preuves et rapport ; distinguer clairement planifié, en collecte, interrompu, partiel et terminé. |
| **Agents** | Qui est déclaré pour intervenir ? | Frontière honnête entre enregistrement et connexion. | Afficher rôle, périmètre et dernières productions ; ne jamais déduire une disponibilité ou une connexion absente du contrat. |
| **Activité** | Que se passe-t-il réellement maintenant ? | Ledger durable, fraîcheur et invalidations. | Distinguer actif, dernier état connu et interrompu ; donner accès à la Feature et aux productions liées ; ne pas inventer de pourcentage, coût ou durée restante. |
| **Relations** | De quoi cette ressource dépend-elle ? | Vue transversale séparée du pipeline. | La rendre contextuelle à une Feature ou un document ; navigation clavier ; clic vers la ressource exacte ; vue liste de repli sur petits écrans. |
| **Réglages** | Qu'est-ce que je peux réellement configurer ici ? | Langue, thème et profil local. | Séparer préférences d'affichage, identité de gouvernance et informations techniques ; expliquer l'impact de chaque modification. |

## 7. Système ergonomique transversal

### 7.1 Densité et lisibilité

La base actuelle à `12px` et plusieurs métadonnées entre `8px` et `9px` donnent une apparence précise mais fatiguent la lecture et deviennent fragiles sur mobile.

- Texte courant : cible de 14 à 16 px selon la densité de la vue.
- Métadonnées : jamais indispensables à la compréhension si elles sont affichées sous 12 px.
- Cibles tactiles : au moins 44 × 44 px pour les actions principales sur mobile.
- Une couleur ne porte jamais seule un état ; elle est accompagnée d'un libellé ou d'une icône nommée.
- Les identifiants techniques utilisent la police monospace uniquement dans les détails secondaires.

### 7.2 États d'interface

Chaque vue possède des états explicites : chargement, vide, erreur, données périmées, déconnexion et succès confirmé.

- Un état vide explique ce qui manque, pourquoi cela compte et l'action possible.
- Une erreur indique l'opération rejetée et la prochaine action ; « action impossible » seule ne suffit pas.
- « Dernier état connu » reste visible tant que la fraîcheur n'est pas confirmée.
- Une opération longue explique ce que Norn vérifie et permet l'annulation uniquement si le contrat la prend en charge.
- Le succès vient d'une relecture du modèle durable, pas uniquement de la résolution d'une requête.

### 7.3 Accessibilité

- Ordre de focus identique à l'ordre visuel.
- Focus piégé puis restauré pour les modales.
- Titres et régions structurent chaque page ; les tableaux disposent d'une alternative lisible sur mobile.
- Les actions iconiques ont un nom accessible.
- Les animations respectent `prefers-reduced-motion`.
- Le contraste des textes secondaires et des états est testé dans les deux thèmes.

## 8. Priorités de livraison proposées

### Lot 1 — Première expérience cohérente

- Remplacer la modale de profil isolée par le gate d'onboarding.
- Persister étape, brouillons et dernière route valide.
- Relier profil, Projet, première Feature et récapitulatif.
- Corriger le démarrage, le retour en haut et la reprise après rechargement.
- Remplacer la navigation mobile débordante.

### Lot 2 — Pilotage quotidien

- Recentrer la vue d'ensemble sur la prochaine action.
- Humaniser workflows, étapes, anomalies et dossiers de Feature.
- Améliorer la lecture des documents avec sommaire et navigation.
- Harmoniser densité, états vides, erreurs et fraîcheur.

### Lot 3 — Décision et preuve

- Reconcevoir la saisie de gouvernance autour de cibles réelles et de libellés humains.
- Compléter la vue de résultat d'audit avec verdict, constats et preuves.
- Relier décisions, audits, Features et documents par navigation directe.

### Lot 4 — Observation et finition

- Clarifier Agents, Activité et Relations sans dépasser les contrats disponibles.
- Finaliser accessibilité clavier, responsive 390 px, thèmes et réduction des animations.
- Tester les parcours sur jeux de données vide, sain, bloqué, invalide et déconnecté.

## 9. Critères d'acceptation UX

1. Un nouvel utilisateur peut atteindre la vue d'ensemble de son premier Projet en quatre étapes explicites au maximum.
2. Une interruption puis un rechargement reprennent l'étape exacte sans dupliquer le Projet ni la Feature.
3. Un utilisateur déjà configuré retrouve sa dernière route encore valide sans revoir l'onboarding.
4. À 390 px, toutes les destinations restent découvrables sans rangée de navigation ambiguë hors écran.
5. Aucun enum, alias de pipeline ou identifiant interne n'est utilisé comme libellé principal.
6. La prochaine étape d'une Feature est compréhensible et accessible depuis la vue d'ensemble et le détail de la Feature.
7. L'ouverture d'un nouveau document commence en haut et offre un sommaire pour les contenus longs.
8. Un audit terminé expose son verdict, ses constats et ses preuves, ou signale explicitement que ces données ne sont pas disponibles dans le contrat.
9. Une décision cible une ressource sélectionnée dans le modèle réel, sans saisie manuelle obligatoire de son identifiant.
10. Les statuts Agent, Activité et fraîcheur ne promettent jamais plus que ce que les données durables prouvent.

## 10. Décisions à confirmer avant spécification

- Convention par défaut du dossier de Feature : directement sous le Projet ou sous `features/`.
- Possibilité réelle de créer un dossier Projet depuis le Web, ou enregistrement d'un dossier existant uniquement.
- Caractère obligatoire ou facultatif de la première Feature pour terminer l'onboarding.
- Portée de la restauration de lecture : route seule ou route et position de défilement.
- Navigation mobile cible : barre contextuelle avec « Plus » ou tiroir unique.

## 11. Sources de code inspectées

Arka Norn :

- `web/src/App.tsx`
- `web/src/app/router.ts`
- `web/src/layout/app-shell.tsx`
- `web/src/views/profile-dialog.tsx`
- `web/src/views/projects-view.tsx`
- `web/src/views/features-view.tsx`
- `web/src/views/feature-view.tsx`
- `web/src/views/project-overview.tsx`
- `web/src/views/governance-view.tsx`
- `web/src/views/audits-view.tsx`
- `web/src/components/document-renderer.tsx`
- `web/src/styles/base.css`
- `src/application/web/contracts.ts`

Référence Cortex Deck :

- `src/ui/chat/views/Onboarding.tsx`
- `src/ui/chat/views/onboardingModel.ts`
- `src/ui/components/LayoutRails.tsx`
- `docs/spec-rail-navigation-20260819.md`
- `docs/spec-demarrage-et-reprise-20260819.md`
- `docs/plan-emergence-cortex-produit-20260823.md`
