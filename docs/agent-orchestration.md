# Orchestration Product et sessions Agent

Le premier Agent d’un Project est toujours le **Product principal**. Il organise la priorité, explique la prochaine étape, prépare les autres rôles et conserve les décisions utilisateur. Il produit dans `main` les documents de cadrage et de gouvernance qui lui sont attribués par le Pipeline (`concept`, `plan`, `registre_dettes`, `tache_agent`) ; il ne réalise pas l’architecture, l’audit, le développement ou la QA.

## Une session provider, une sélection Agent

Chaque conversation ou processus provider utilise un identifiant de session lisible :

```text
main                         Product principal
architecte-navigation-tui    architecture de la Feature
audit-navigation-tui         audit de la Feature
dev-navigation-tui           développement de la Feature
qa-navigation-tui            recette de la Feature
```

La session `main` est réservée au Product principal. Les autres rôles ne doivent jamais la sélectionner ni remplacer son Agent. La sélection privée est stockée dans `~/.arka-norn/context/agents.json` au format v2, séparément pour chaque couple session/Project. Le format v1 historique est lu comme la session `main`, puis migré lors de la prochaine mutation.

La session peut être transmise par `--session <id>` ou par `ARKA_NORN_SESSION`. L’option explicite reste préférable dans un prompt de passation.

## Conseil calculé

```text
arka-norn agent advise --project <project-id> [--feature <feature-id>]
```

Le conseil vérifie le Product principal, lit le vrai `pipelineId`, la phase et la prochaine action. Il distingue :

- `MAINTENANT` : le rôle peut produire exactement l’étape calculée ;
- `PRÉPARATION` : lecture seule en parallèle, sans document Pipeline ni modification de code.

Si plusieurs Features existent, `--feature` est obligatoire pour éviter une priorité implicite.

## Prompt autonome d’un rôle

```text
arka-norn agent prompt audit --project product --feature navigation --provider "Claude Code" --mode execute
arka-norn agent prompt dev --project product --feature navigation --provider "Codex" --mode prepare
```

Le prompt rendu contient la racine, le workflow, le rôle, la session isolée, le profil de skills, l’étape attendue, les permissions, les commandes d’enregistrement et les preuves de fin. Un mode `execute` incohérent avec `pipeline next` est refusé. Pour Essentiel et FastDev, les rôles audit/dev/QA invoquent respectivement `arka-essentiel` ou `arka-fastdev`, qui exécutent une seule phase calculée. Le workflow standard conserve les skills spécialisées par phase.

La sortie sépare un **préflight Product** et le **prompt à transmettre**. Le Product installe d’abord le profil de skills indiqué, puis ouvre la nouvelle session provider : une skill absente n’est ainsi jamais invoquée avant son installation. Le `provider` est obligatoire lors de la création d’une nouvelle identité ; si la session est déjà liée à un Agent compatible, la commande générée réutilise directement son identifiant exact.

Le Product transmet ensuite le prompt tel quel. Un Agent spécialisé démarre avec `arka-framework-maitrise`, jamais avec `/arka-norn` qui reste réservé au Product principal. Son enregistrement est borné à la Feature et, lorsque sa racine est interne au Project, à son chemin relatif. L’Agent destinataire vérifie toutes les valeurs avec la CLI avant d’écrire.

En Essentiel et FastDev, `essentiel next <feature> --session <session-id>` ou `fastdev next <feature> --session <session-id>` injecte la session dans la commande de scaffold. La skill guidée exige la même session pour `agent current`, `next` et la production du document afin d’empêcher une signature accidentelle par le Product `main`.

## Reprise du Product principal

Avant saturation du contexte ou changement de conversation :

```text
arka-norn agent handoff-prompt --project <project-id> [--feature <feature-id>]
```

Le prompt de reprise embarque la racine et la commande `cd`, l’identité Product à réutiliser, la session `main`, les sessions spécialisées observées, les documents valides, la phase et les commandes de contrôle. Une reprise relit le registre des sessions et ne crée pas un suffixe `_02` : l’identité ne change que lors d’un remplacement explicite.

## Boucle d’organisation

```text
Product main
  → agent advise
  → agent prompt <rôle> --mode execute
  → Agent spécialisé dans sa session
  → preuves + document validé
  → Product relit agent advise
  → rôle suivant ou clôture
```

Une préparation parallèle peut anticiper les risques et questions, mais n’acquiert jamais implicitement le droit d’écrire. Le registre partagé conserve les identités et périmètres ; le fichier de sessions reste privé à la machine.

## Pilote assisté du Project

Le mode d’orchestration du **Project** est indépendant du mode de prompt :
`manual|automatic` règle la planification des missions, alors que
`prepare|execute` règle le droit d’action d’un Agent spécialisé. Dans les
interfaces, le mode `automatic` est nommé **Pilote assisté** : il ne représente
jamais un droit pour le Product ou Mastra d’enchaîner le travail sans vous.

En `manual`, le Product prépare les prompts comme décrit ci-dessus. Dans le
Pilote assisté, il lit d’abord le Pipeline puis vous fait parcourir la même
séquence à chaque mission :

```text
Feature → assistant et version → aperçu expliqué → confirmation → worker local
```

L’aperçu explique la prochaine étape, le rôle, les chemins concernés, les
preuves et les autorisations prévues. Le Product doit demander explicitement
quel assistant et quelle version lancer. Les options lisibles sont **Claude**,
**Codex**, **Kimi Platform** et **Z.AI Coding Plan**. Arka peut recommander une
option éligible d’après la politique du Project, mais l’utilisateur confirme la
cible exacte ; il n’existe ni choix libre par Mastra ni fallback après le
démarrage.

Le même contrat est disponible en CLI :

```text
arka-norn orchestration configure --project <project-id> --provider <assistant> --model <version>
arka-norn orchestration preview --project <project-id> --feature <feature-id>
arka-norn orchestration start --project <project-id> --feature <feature-id> --provider <assistant> --model <version> --preview <empreinte>
arka-norn orchestration status --project <project-id>
```

Une permission non préautorisée, une preuve absente, un scope modifié ou une
erreur suspend le flux. Le Product présente alors la raison et l’action
appropriée (`approve`, `cancel` ou `retry`) ; il ne contourne ni la suspension
ni le broker deny-by-default. Après une mission réussie, le Product demande un
nouvel aperçu et une nouvelle confirmation au lieu d’en lancer une autre.

Codex et Kimi utilisent ACP et restent non éligibles aux écritures automatiques
tant que leurs permissions sont opaques. Kimi Platform est actuellement porté
par Kimi Code ACP, non par une intégration directe à l’API Platform. Z.AI Coding
Plan utilise un endpoint fixé dans l’adapter et ne devient disponible qu’avec
son activation et son identifiant local explicites. Pour Codex ou Kimi ACP, une
interruption est une nouvelle tentative, pas une reprise générique de session.

Le détail des données persistées, des permissions et de la TUI se trouve dans
[le Pilote assisté et l’orchestration contrôlée](automatic-orchestration.md).
