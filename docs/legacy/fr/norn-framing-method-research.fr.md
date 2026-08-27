# Méthode de cadrage Norn — recherche et conception

> Brouillon de travail. Ce document rassemble la réflexion en cours et les sources externes utiles. Il ne constitue pas encore un contrat de pipeline validé.

La traduction de cette méthode en contrat, états, commandes et découpage d'implémentation est maintenue dans [`norn-framing-contract-proposal.fr.md`](./norn-framing-contract-proposal.fr.md). Ce document-ci reste la source Product et UX ; le document compagnon est destiné à la future spécification et au code.

## Intention

Le moteur de cadrage est le point d'entrée concret de Norn. L'utilisateur invoque Norn depuis un Agent muni de la skill principale. Norn initialise un Project minimal ou reprend un Project connu, observe la nature réelle de son dossier, puis l'Agent conduit le cadrage sans exiger que l'utilisateur connaisse les notions internes de Feature, pipeline, session ou document.

Le même cadre sert à concevoir un Project complet et à cadrer une Feature. La différence intervient à la fin :

- un plan de Project se décompose en Features cohérentes ;
- un plan de Feature se décompose en Lots bornés ;
- les tâches techniques appartiennent ensuite à l'exécution des Lots.

La hiérarchie produit est donc :

```text
Project
└── Feature
    └── Lot
```

## Principe central : le plan vivant

Le plan n'est pas généré à la fin de la conversation. Il est sa mémoire de travail, maintenue silencieusement en arrière-plan.

La conversation comprend, confronte et tranche. Le plan enregistre seulement ce qui est établi. Il ne recopie ni le verbatim, ni les alternatives abandonnées, ni la négociation. Une reprise de contexte s'effectue depuis le plan vivant, pas depuis la mémoire d'un chat ou d'un provider.

Le concept est le premier état épistémique du plan. Avant lecture du code, il peut contenir uniquement :

- le problème observé ;
- les effets recherchés ;
- les règles incontournables ;
- l'objectif exact ;
- les capacités ou fonctionnalités attendues ;
- le hors périmètre ;
- les comportements fonctionnels ;
- les décisions établies et les décisions encore ouvertes avec recommandation.

À ce stade, le plan ne peut affirmer aucun fait sur les fichiers, l'architecture, l'existant ou les contraintes du dépôt.

## Entrée Norn et nature du dossier

L'entrée ne commence pas par le choix d'un workflow. Elle commence par l'établissement du contexte réel :

```text
Invocation de Norn par l'Agent
        ↓
Initialisation minimale ou reprise du Project
        ↓
Sonde locale déterministe
        ├── empty         → conception greenfield
        ├── skeleton      → lecture ciblée des contraintes présentes
        ├── implemented   → prise de connaissance du code
        └── indeterminate → aucune invention, capacité réduite
        ↓
Restitution de ce que l'Agent comprend
        ↓
Identification naturelle de la cible : Project ou Feature
        ↓
Même moteur de cadrage
```

Une sonde n'est pas un audit. Elle doit être rapide, déterministe, locale et sans provider. Elle établit uniquement s'il existe une matière auditable.

Sur un dossier vide, Norn ne doit lancer aucune exploration d'audit. Le second Agent intervient directement comme concepteur technique après stabilisation de l'intention. Sur un dépôt implémenté, il commence par une lecture du code sans recevoir l'intention, afin d'éviter une recherche de confirmation.

Les faits positifs sur l'existant sont ancrés en `fichier:ligne`. Les faits négatifs, impossibles à prouver par une ligne absente, sont ancrés dans une attestation d'inventaire liée au snapshot observé.

## Déroulé conversationnel

1. L'Agent ouvre en reformulant ce qu'il comprend et poursuit sur cette base.
2. Chaque tour enrichit le plan vivant. Les déductions sont dites à l'utilisateur dans le fil naturel de la réponse.
3. L'Agent ne pose une question que lorsqu'il rencontrerait sinon une contradiction, une substance qu'il ne doit pas inventer ou une décision qu'il s'apprête à figer.
4. Lorsqu'il possède une intention suffisamment cohérente, il annonce qu'il a de quoi poursuivre le plan. La première confirmation stabilise la matière produit.
5. Norn adapte la confrontation au dossier : preuve d'absence, lecture de squelette ou lecture aveugle du code existant.
6. L'Agent confronte l'intention au réel et met à jour le même plan avec les faits, l'existant réutilisable, les contraintes, l'architecture, les risques et les dépendances.
7. Lorsqu'il possède une solution suffisamment fondée, il l'annonce. La deuxième confirmation stabilise le plan consommable.
8. Le plan est finalisé. Un Project produit sa carte de Features ; une Feature produit ses Lots.

Il existe deux types de confirmation, pas une confirmation par section ou document. Une correction renvoie simplement à la conversation ; elle ne crée pas une nouvelle étape méthodologique.

## Cohésion Project, Feature et Lot

Une Feature porte un seul résultat produit observable et un seul scénario cohérent de vérification de bout en bout. Plusieurs résultats pouvant être décidés, acceptés ou livrés indépendamment indiquent plusieurs Features.

Le moteur ne découpe pas une Feature par couches techniques. Base de données, API et interface restent des Lots d'une même Feature lorsqu'elles concourent au même effet utilisateur.

Une Feature trop large est reformulée par l'Agent en plusieurs résultats autonomes. L'Agent expose cette déduction et continue ; il ne transforme pas immédiatement la discussion en questionnaire de découpage.

Un Lot :

- contribue à l'objectif unique de sa Feature ;
- possède un périmètre d'exécution borné ;
- dépend explicitement d'autres Lots lorsque le code l'impose ;
- produit un effet constatable ou une preuve nécessaire à l'effet final ;
- ne peut introduire un nouvel objectif produit sans devenir une Feature distincte.

## Artefacts et consommateurs

Le plan vivant est la source de reprise et la future source de vérité. Ses vues et projections ne sont pas de nouveaux documents :

- la vue conversationnelle sert à conduire le cadrage ;
- la vue état courant sert à reprendre et corriger ;
- la vue preuves sert à vérifier les faits issus du dépôt ;
- la décomposition Project est consommée par l'initialisation des Features ;
- la décomposition Feature est consommée par la préparation des Lots ;
- l'annexe technique existe seulement lorsqu'une contrainte change réellement la forme ou l'exécution du plan.

Un document incomplet ne bloque pas le produit entier. Il autorise uniquement les suites dont les préconditions sont établies.

## Conversion des trois modèles fournis

Les modèles de Concept, Plan et Annexe technique définissent trois positions de connaissance utiles, mais leur succession sous forme de documents indépendants contredirait la reprise par le plan vivant. Norn doit donc séparer le **contrat de données persistant** de ses **projections lisibles**.

### Projection Concept

La projection Concept montre le plan avant lecture technique. Elle conserve les neuf matières proposées : définition, problématique, effet de la solution, règles incontournables, objectif exact, fonctionnalités, hors périmètre, comportements fonctionnels et décisions ouvertes avec recommandation.

Elle interdit correctement :

- les affirmations sur l'existant ;
- les fichiers, symboles et composants internes ;
- l'architecture présentée comme acquise ;
- le phasage technique et les Lots prématurés.

Cette projection n'est pas un fichier temporaire consommé puis détruit. C'est une lecture bornée du plan vivant lorsque `planAuthority` vaut `conversational`. Son contenu produit reste présent après confrontation ; seules les hypothèses contredites sont remplacées, avec leur trace dans l'historique.

### Projection Plan fondé

La projection Plan devient disponible après confrontation technique. Elle ajoute au même plan : contexte réel, faits vérifiés, existant réutilisable, architecture retenue, décisions fondées, décomposition, dépendances, preuve de bout en bout, risques, garde-fous, concessions et questions ouvertes.

Le principe `fichier:ligne` reste obligatoire pour toute affirmation positive sur du code observé. Il est complété par deux cas :

- l'absence est prouvée par un inventaire lié au snapshot ;
- sur un Project vide, une proposition d'architecture est identifiée comme `technical_design`, jamais comme fait lu dans le dépôt.

Le « chantier » du modèle n'est pas un niveau canonique supplémentaire :

- dans un plan de Project, il devient une **Feature candidate** ;
- dans un plan de Feature, il devient un **Lot** ;
- les tâches d'exécution restent internes au Lot.

Le plan fondé ne « remplace » donc pas le Concept au niveau du stockage. Il élève l'autorité du même artefact et offre une projection plus riche à ses consommateurs.

### Projection Annexe technique

L'annexe reste optionnelle. Elle est matérialisée seulement si une règle technique modifie effectivement la forme du plan et si son consommateur est nommé : contrôleur de validation, recette d'un Lot ou moteur d'orchestration.

Elle pointe vers :

- la commande de vérification qui fait foi ;
- les règles du dépôt et leur effet sur le plan ;
- les défaillances agentiques couvertes ;
- les patrons existants à réutiliser ;
- les zones sous contrainte ;
- ce que les vérifications automatiques ne couvrent pas ;
- les règles importantes absentes, toujours présentées comme propositions.

Une simple règle applicable mais sans effet sur la forme du plan reste une preuve ou un lien dans le plan ; elle ne justifie pas l'annexe.

### Correspondance dans le contrat persistant

| Matière fournie | Position dans le plan vivant | Consommateur |
|---|---|---|
| Concept produit | `intent` et `behaviors` | Agent de confrontation |
| Règles incontournables | `invariants` | Planificateur et validations |
| Décisions et recommandations | `decisions` | Reprise et arbitrage |
| Faits vérifiés | `evidence.sourceFacts` | Architecture et contrôleur d'autorité |
| Absences vérifiées | `evidence.inventoryFacts` | Sonde et architecture |
| Existant réutilisable | `solution.reuse` | Décomposition et exécution |
| Architecture et risques | `solution.design`, `risks` | Lots et validations |
| Features ou Lots | `decomposition` discriminée par la cible | Initialisation de Feature ou orchestration |
| Contrat technique | `technicalContractRef` facultatif | Validateur nommé |

Cette table décrit une future forme JSON ; elle ne fige pas encore les noms de champs publics.

## Premiers enseignements externes

### Shape Up — retenir les frontières, rejeter la mécanique de cycles

Shape Up sépare le problème, l'appétit, la solution, les risques majeurs et les exclusions. La méthode insiste aussi sur les « grab-bags », ces projets qui accumulent des demandes sans frontière cohérente.

Norn doit retenir :

- un problème explicite avant la solution ;
- une frontière nette et des exclusions ;
- la recherche des « rabbit holes » avant exécution ;
- la décomposition d'une Feature fourre-tout en résultats significatifs.

Norn ne doit pas importer comme obligations les cycles fixes, la betting table ou une nouvelle cérémonie de validation.

Sources : [Set Boundaries](https://basecamp.com/shapeup/1.2-chapter-03), [Risks and Rabbit Holes](https://basecamp.com/shapeup/1.4-chapter-05), [Write the Pitch](https://basecamp.com/shapeup/1.5-chapter-06).

### Example Mapping et BDD — retenir règles, exemples et inconnues

Example Mapping distingue la règle, l'exemple concret et la question encore ouverte. Les questions peuvent rester visibles sans empêcher tout le reste d'avancer. L'accumulation de règles ou d'exemples est également un signal qu'une story est trop large.

Norn doit retenir :

- les comportements exprimés par règles et exemples concrets ;
- les inconnues rendues explicites sans interrompre artificiellement la conversation ;
- les règles comme lignes naturelles de découpage ;
- la transformation ultérieure des exemples retenus en preuves exécutables.

Norn ne doit pas obliger l'utilisateur à rédiger du Gherkin ni reproduire un atelier à cartes.

Sources : [Example Mapping](https://cucumber.io/docs/bdd/example-mapping/), [Behaviour-Driven Development](https://cucumber.io/docs/bdd/).

### Interaction humain–IA — rendre le système corrigeable et prévisible

Les recommandations Microsoft et Google convergent sur plusieurs besoins : rendre visibles les capacités et limites, montrer ce que le système a compris, permettre une correction efficace, conserver le contrôle humain et prévoir une sortie robuste lorsque l'IA échoue.

Norn doit retenir :

- une ouverture qui expose immédiatement la compréhension courante ;
- des déductions visibles et corrigeables ;
- une explication locale des incertitudes et de leur impact ;
- aucune impasse lorsque le provider échoue ;
- une reprise fondée sur l'artefact et non sur la session du modèle ;
- une action suivante toujours intelligible, sans masquer les opérations en cours.

Sources : [Guidelines for Human-AI Interaction](https://www.microsoft.com/en-us/research/wp-content/uploads/2019/01/Guidelines-for-Human-AI-Interaction-camera-ready.pdf), [PAIR Mental Models](https://pair.withgoogle.com/guidebook-v2/chapter/mental-models/), [PAIR Feedback + Control](https://pair.withgoogle.com/guidebook-v2/chapter/feedback-controls/), [PAIR Errors + Graceful Failure](https://pair.withgoogle.com/chapter/errors-failing/).

### Systèmes agentiques — commencer par le mécanisme le plus simple

Anthropic distingue les workflows prédéfinis des Agents qui dirigent dynamiquement leur travail et recommande de n'ajouter de la complexité que lorsqu'elle améliore effectivement le résultat.

Norn doit employer :

- du code déterministe pour l'identité, la sonde, les transitions, les permissions et les validations ;
- un Agent conversationnel pour comprendre, déduire et animer ;
- un Agent spécialisé uniquement lorsqu'une matière technique réelle justifie son intervention.

Source : [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents).

### Double Diamond — retenir les convergences, pas les phases visibles

Le Double Diamond distingue les mouvements de divergence et de convergence autour du problème puis de la réponse. Le Design Council précise cependant que ce travail n'est pas linéaire : les apprentissages peuvent ramener vers une compréhension précédente.

Norn doit retenir :

- un premier mouvement qui élargit puis stabilise l'intention produit ;
- un second mouvement qui confronte puis stabilise une réponse fondée ;
- la possibilité de corriger localement une hypothèse antérieure sans recommencer le parcours.

Ces deux convergences correspondent aux deux confirmations déjà prévues. Norn ne doit pas exposer quatre nouvelles phases, un diagramme obligatoire ou des portes supplémentaires.

Source : [Framework for Innovation](https://www.designcouncil.org.uk/our-resources/framework-for-innovation/).

### Story Mapping — découper par parcours et effets obtenus

Le Story Mapping conserve le parcours de l'utilisateur comme colonne vertébrale et recherche des tranches capables de conduire réellement une personne à son objectif. Cette logique évite de transformer la carte du produit en inventaire de composants.

Norn doit retenir :

- la décomposition d'un Project à partir des résultats et parcours cohérents ;
- des Features livrables ou décidables indépendamment ;
- des Lots verticaux dès que possible, plutôt qu'une succession base de données → API → interface ;
- une carte dérivée du plan vivant, sans atelier ni document de mapping supplémentaire.

Sources : [The New User Story Backlog Is a Map](https://jpattonassociates.com/the-new-backlog/), [Story Mapping Quick Reference](https://www.jpattonassociates.com/wp-content/uploads/2015/03/story_mapping.pdf).

### Navigation de service — simplifier avant d'ajouter un parcours à étapes

Le GOV.UK Design System déconseille les listes de tâches lorsque le service peut être achevé dans une séquence simple et les parcours « pas à pas » lorsqu'il n'existe pas un ordre unique. Son pattern de vérification des réponses favorise en revanche un résumé corrigeable par section avant engagement.

Norn doit retenir :

- aucune task-list ou wizard comme représentation principale du cadrage ;
- un résumé humain du plan accessible à tout moment ;
- une correction locale qui revient ensuite au front courant de la conversation ;
- une reprise qui conduit directement à ce qui reste à établir, sans rejouer l'historique ;
- aucune exposition de l'organisation interne des pipelines, documents ou Agents.

Sources : [Task list](https://design-system.service.gov.uk/components/task-list/), [Check answers](https://design-system.service.gov.uk/patterns/check-answers/), [Step by step navigation](https://design-system.service.gov.uk/patterns/step-by-step-navigation/), [Designing good government services](https://www.gov.uk/service-manual/design/introduction-designing-government-services).

### Statuts non intrusifs — rendre le travail de fond perceptible

Les recommandations d'accessibilité du W3C demandent que les messages de succès, de progression, d'attente ou d'erreur soient perceptibles sans déplacer inutilement le focus. Cette distinction est particulièrement importante lorsque le plan est rédigé en arrière-plan.

Norn doit distinguer clairement :

- le plan enregistré ;
- le travail de fond en cours ;
- la décision humaine réellement nécessaire ;
- l'échec récupérable ;
- la reprise disponible.

Ces statuts ne doivent ni interrompre la saisie, ni faire croire qu'une information a été enregistrée lorsque l'écriture a échoué.

Source : [WCAG — Status Messages](https://www.w3.org/WAI/WCAG21/Understanding/status-messages.html).

## Proposition de méthode Norn

La méthode Norn n'est pas un pipeline que l'utilisateur doit apprendre. C'est une boucle de conduite maintenue par l'Agent et garantie par un contrôleur déterministe :

```text
comprendre → enregistrer → poursuivre
     ↑              ↓
  corriger ← confronter au réel
```

La boucle accumule de la substance dans le plan vivant. Deux stabilisations seulement changent l'autorité de ce plan : la première autorise la confrontation technique ; la seconde autorise sa consommation par la suite du produit.

### Répartition des responsabilités

Le code déterministe :

- identifie ou initialise le Project ;
- sonde la nature du dossier ;
- charge et versionne atomiquement le plan ;
- valide la forme et les transitions d'autorité ;
- choisit la capacité permise par les faits disponibles ;
- conserve l'identité de la cible et la prochaine action ;
- empêche une affirmation technique sans provenance appropriée.

L'Agent principal :

- reformule et anime la discussion ;
- déduit ce qui peut l'être et rend la déduction visible ;
- tranche les choix réversibles en exposant son choix ;
- ne questionne que ce qu'il ne peut légitimement inventer ;
- maintient le mouvement vers un résultat consommable.

L'Agent spécialiste du code :

- n'intervient que si une matière technique existe réellement ;
- lit le code avant de recevoir l'intention produit sur un dépôt implémenté ;
- produit des constats ancrés, pas une solution cachée ;
- n'est ni créé ni simulé sur un dossier vide.

### Une surface de conduite unique

L'expérience principale reste la conversation. Elle est accompagnée d'un bandeau compact et d'une vue humaine du plan, tous deux dérivés du même état :

```text
Project / Feature éventuelle              Enregistré · il y a quelques secondes
Objectif courant                          Ce que Norn fait maintenant
Dernier élément établi                    Suite prévue
```

Le bandeau ne compte pas des étapes. Il répond en permanence à quatre questions :

1. Sur quoi travaillons-nous ?
2. Qu'est-ce qui est désormais établi ?
3. Que fait Norn maintenant ?
4. Qu'est-ce qui fera avancer la suite ?

La vue du plan est lisible pour un humain. Elle regroupe l'intention, les règles, les exemples, les limites, les décisions, les preuves et la décomposition disponible. Le JSON est un format de persistance et d'échange, jamais l'interface principale.

### Un état dérivé, pas un parcours imposé

Norn ne persiste pas un numéro d'étape qui pourrait devenir faux après une correction. Il dérive son état de quelques axes indépendants :

- `target` : Project ou Feature ;
- `repositoryNature` : empty, skeleton, implemented ou indeterminate ;
- `productClarity` : emerging ou stabilized ;
- `grounding` : not_applicable, pending, in_progress, complete ou degraded ;
- `planAuthority` : conversational, intent_stabilized, grounded, consumable ou degraded ;
- `nextAction` : l'action exacte calculée depuis le contenu présent.

Ces valeurs servent au contrôleur et à la reprise. L'interface les traduit en phrases humaines ; elle n'affiche ni enums ni terminologie de pipeline.

### Forme naturelle d'un tour de conversation

Une réponse de cadrage suit une cadence reconnaissable sans devenir un formulaire :

1. elle répond ou reformule la correction reçue ;
2. elle énonce la nouvelle compréhension et les déductions utiles ;
3. elle montre le mouvement suivant ;
4. elle ajoute une seule question uniquement si poursuivre obligerait à inventer.

Une déduction réversible n'est pas une question. L'Agent la pose clairement — « j'en déduis que… » — et continue. Une contradiction est rapprochée des deux faits incompatibles. Une décision structurante est présentée avec son effet concret, puis laissée à l'utilisateur.

### Les deux stabilisations

La première stabilisation résume uniquement :

- le problème ;
- l'effet recherché ;
- les règles essentielles ;
- le hors périmètre ;
- les décisions produit structurantes encore visibles.

Elle ne demande pas de valider une architecture que personne n'a encore confrontée au réel. L'utilisateur peut confirmer librement ou corriger un élément précis.

La seconde stabilisation résume :

- la réponse proposée ;
- ce qui existe et sera réutilisé ;
- les contraintes et risques établis ;
- les preuves qui fondent ces affirmations ;
- la décomposition en Features ou en Lots ;
- ce que la confirmation autorisera ensuite.

Ces moments sont des vérifications de compréhension, pas des modales binaires. Une correction modifie localement le plan puis la conversation reprend. Aucun découpage, document ou Agent ne crée une troisième confirmation.

### Conduite de la reprise

À chaque ajout établi, Norn écrit une nouvelle révision atomique du plan et garde la précédente. Une nouvelle session, un autre Agent ou un autre provider commence par une restitution courte :

```text
Nous cadrons [cible] pour obtenir [effet].
Sont établis : [faits et décisions structurants].
Le dernier travail portait sur [front courant].
Je reprends par [action suivante].
```

L'utilisateur ne doit ni rechercher une ancienne session Product, ni répéter le contexte. Depuis le Project ou la Feature, une action « Reprendre le cadrage » retrouve le plan actif. Les sessions de modèle deviennent des exécutions remplaçables, pas des lieux de stockage du produit.

### Provenance et autorité plutôt qu'un faux score de confiance

Chaque affirmation du plan porte une origine et un effet sur ce que Norn peut autoriser :

- `human_decision` : tranché explicitement dans la conversation ;
- `agent_deduction` : proposé par l'Agent et toujours corrigeable ;
- `source_fact` : ancré dans le code ou un artefact observé ;
- `inventory_fact` : ancré dans l'inventaire d'un snapshot ;
- `technical_design` : proposition de conception fondée sur l'intention et les contraintes connues, sans être présentée comme existante ;
- `recommendation` : choix conseillé, non encore décidé ;
- `open` : substance manquante que Norn ne peut inventer.

L'interface emploie des libellés humains comme « décidé ensemble », « déduit », « vérifié dans le code » ou « encore à trancher ». Elle n'affiche pas un pourcentage de confiance opaque. Une information incomplète autorise moins ; elle ne rend pas tout le plan inutilisable.

### Décomposition sans Feature fourre-tout

La cohésion d'une Feature est évaluée par son indépendance, pas par un nombre arbitraire de fichiers ou de jours. L'Agent cherche :

- un effet principal observable ;
- un scénario de bout en bout qui permet de l'accepter ;
- une décision de livraison cohérente ;
- des règles qui se renforcent plutôt que des résultats juxtaposés.

Si une partie peut être livrée, refusée, reportée ou comprise sans les autres, elle est probablement une Feature distincte. Si elle n'a de valeur ou de preuve qu'en contribuant au même résultat, elle devient un Lot.

Pour un Project, la carte suit les résultats et le parcours global. Pour une Feature, les Lots recherchent des tranches constatables et bornées. Les tâches techniques restent internes au Lot et ne créent pas un quatrième niveau documentaire.

### Comportement en cas d'échec

Un échec ne doit jamais laisser l'utilisateur dans une session sans issue :

- échec du provider : le plan reste lisible et la reprise peut changer de profil sans changer la cible ;
- échec d'écriture : Norn annonce que le dernier ajout n'est pas enregistré et conserve le brouillon pour réessai explicite ;
- dépôt indéterminé : Norn réduit la portée de ses affirmations et indique la vérification manquante ;
- lecture technique interrompue : les preuves déjà validées restent utilisables, les autres restent ouvertes ;
- contradiction nouvelle : seule l'autorité des conclusions dépendantes est rétrogradée.

Il n'existe aucun fallback silencieux de provider, aucune confirmation simulée et aucune progression déclarée sur la seule base d'une réponse de modèle.

## Navigation et vues dérivées

La navigation conserve toujours la filiation produit :

```text
Project
├── Cadrage du Project
├── Feature A
│   ├── Cadrage de la Feature
│   └── Lots
└── Feature B
```

Une Feature ouverte depuis la carte du Project ne perd pas l'intention parente. Le plan de Feature pointe vers les décisions de Project qui la contraignent ; il ne les recopie pas. Modifier une décision parente signale les plans dépendants à reconfronter sans les réinitialiser.

Les vues suivantes sont des projections calculées :

- **Conduite** : conversation, état courant et suite ;
- **Plan** : contenu humain structuré et corrigeable ;
- **Preuves** : inventaires, fichiers et lignes sources ;
- **Carte** : Features d'un Project ou Lots d'une Feature ;
- **Historique** : révisions, décisions remplacées et causes de rétrogradation.

Une vue n'est jamais un nouveau document à signer. L'utilisateur revient après une correction au front courant de la conversation, pas au début du cadrage.

## Robustesse du moteur

Le modèle peut proposer un delta de plan, mais seul le contrôleur le persiste. Chaque delta doit :

- viser la cible active et la révision lue ;
- déclarer les éléments ajoutés, remplacés ou invalidés ;
- porter la provenance de chaque affirmation ;
- respecter ce que la nature du dépôt permet d'affirmer ;
- conserver les décisions non concernées ;
- recalculer l'autorité et l'action suivante ;
- être idempotent en cas de reprise après interruption.

La persistance utilise une comparaison de révision : si deux sessions tentent d'écrire, la seconde doit relire et confronter son delta au nouvel état. Le plan n'est jamais écrasé par la dernière réponse arrivée.

Les statuts visibles sont produits par le contrôleur à partir des écritures et exécutions réelles, pas par le discours de l'Agent. Le moteur conserve un historique minimal permettant de reconstruire l'état courant et d'expliquer pourquoi une conclusion a changé.

## Critères d'adoption à mesurer

Le succès du cadrage ne se mesure ni au nombre de documents produits ni au nombre d'étapes franchies. Les indicateurs utiles sont :

- délai jusqu'à la première reformulation réellement utile ;
- nombre de questions posées avant la première stabilisation ;
- capacité à reprendre sans demander à l'utilisateur de réexpliquer ;
- proportion de corrections locales par rapport aux redémarrages ;
- absence d'audit déclenché sur un dossier vide ;
- détection des Features à résultats indépendants ;
- proportion de Lots vérifiables de bout en bout ;
- abandons, impasses et changements de provider subis ;
- capacité d'un autre Agent à poursuivre depuis le plan seul ;
- compréhension par l'utilisateur de ce que Norn fait et de ce qui arrivera ensuite.

## Scénarios UX de référence

1. **Project vide** : Norn constate l'absence de matière, ouvre la conception et ne simule aucun audit.
2. **Dépôt existant, nouvelle Feature** : l'intention est stabilisée, un Agent lit le code aveuglément, puis les deux matières sont confrontées.
3. **Reprise dans une autre session** : l'Agent restitue la cible, les décisions et le front courant sans question de contexte.
4. **Correction tardive** : une décision produit change, les seules conclusions dépendantes repassent à confronter.
5. **Feature fourre-tout** : l'Agent rend visibles les résultats indépendants et propose plusieurs Features sans questionnaire de tri.
6. **Échec de provider** : le plan enregistré reste exploitable et Norn propose une reprise bornée.
7. **Squelette de dépôt** : Norn lit les contraintes présentes sans prétendre auditer une implémentation inexistante.
8. **Plan de Project finalisé** : la carte de Features est créée sans générer prématurément leur cadrage complet.
9. **Plan de Feature finalisé** : les Lots sont préparés comme unités d'exécution, les tâches restant internes.

## Principes UX provisoires

1. **Une conversation, pas un formulaire déguisé.** L'Agent conduit et expose ses décisions ; il ne déroule pas une checklist de questions.
2. **Toujours savoir où l'on en est.** La cible, la compréhension courante, le dernier fait établi et la prochaine action restent accessibles.
3. **Le progrès est une accumulation de substance, pas un nombre d'étapes.** Aucun faux pourcentage ni stepper rigide.
4. **Deux engagements visibles.** Stabilisation de l'intention, puis stabilisation du plan fondé.
5. **Reprise immédiate.** Le plan vivant permet à un autre Agent de restituer l'état avant de continuer.
6. **Correction locale.** L'utilisateur corrige une décision ou une déduction sans recommencer le parcours.
7. **Aucune activité vide.** Pas d'audit sans matière, pas d'annexe sans contrainte, pas de document sans consommateur.
8. **Une conduite perceptible.** L'Agent indique ce qu'il vient d'établir et ce qu'il fait ensuite, sans exposer le bruit interne des outils.
9. **Une sortie utile en cas d'échec.** Le plan reste lisible et reprenable même si un provider, une sonde ou un Agent spécialisé échoue.
10. **La complexité apparaît au moment où elle devient utile.** Les notions de Feature, Lot, scope ou preuve ne sont introduites qu'au moment où elles aident l'utilisateur à décider.

## Points restant à éprouver

- vocabulaire utilisateur exact du bandeau de conduite et des deux stabilisations ;
- granularité minimale du delta que le contrôleur doit pouvoir valider ;
- règle de propagation lorsqu'une décision de Project invalide plusieurs Features ;
- seuil à partir duquel une correction devient explicitement un changement de périmètre ;
- recette avec des utilisateurs non techniques sur dossier vide et dépôt existant ;
- forme JSON finale du plan vivant et de ses deux décompositions discriminées.
