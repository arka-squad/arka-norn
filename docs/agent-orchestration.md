# Orchestration Product et sessions Agent

Le premier Agent d’un Project est toujours le **Product principal**. Il organise la priorité, explique la prochaine étape, prépare les autres rôles et conserve les décisions utilisateur. Il ne réalise pas lui-même l’architecture, l’audit, le développement ou la QA.

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

Le prompt rendu contient la racine, le workflow, le rôle, la session isolée, le profil de skills, l’étape attendue, les permissions, les commandes d’enregistrement et les preuves de fin. Un mode `execute` incohérent avec `pipeline next` est refusé. En FastDev, les rôles audit/dev/QA invoquent `arka-fastdev`, qui exécute une seule phase calculée.

La sortie sépare un **préflight Product** et le **prompt à transmettre**. Le Product installe d’abord le profil de skills indiqué, puis ouvre la nouvelle session provider : une skill absente n’est ainsi jamais invoquée avant son installation. Le `provider` est obligatoire lors de la création d’une nouvelle identité ; si la session est déjà liée à un Agent compatible, la commande générée réutilise directement son identifiant exact.

Le Product transmet ensuite le prompt tel quel. Un Agent spécialisé démarre avec `arka-framework-maitrise`, jamais avec `/arka-norn` qui reste réservé au Product principal. Son enregistrement est borné à la Feature et, lorsque sa racine est interne au Project, à son chemin relatif. L’Agent destinataire vérifie toutes les valeurs avec la CLI avant d’écrire.

En FastDev, `fastdev next <feature> --session <session-id>` injecte la session dans la commande de scaffold. La skill exige la même session pour `agent current`, `fastdev next` et la production du document afin d’empêcher une signature accidentelle par le Product `main`.

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
