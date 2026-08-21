# Manuel utilisateur Arka Norn

Ce manuel explique Arka Norn sans supposer que vous savez programmer. Il s’adresse aux responsables produit, chefs de projet, fondateurs et utilisateurs qui veulent organiser le travail d’un ou plusieurs Agents IA sans perdre le fil.

Vous n’avez pas besoin de connaître le format des documents internes. Arka Norn vous indique où vous êtes, ce qui manque et quelle action effectuer ensuite.

## 1. À quoi sert Arka Norn ?

Un projet conduit avec plusieurs Agents peut vite devenir difficile à suivre : décisions dispersées, responsabilités floues, correction non vérifiée ou nouvelle conversation qui repart de zéro.

Arka Norn crée un espace de pilotage local pour éviter ces situations. Il permet de :

- retrouver tous les Projects et toutes les Features suivies ;
- donner une identité et un périmètre à chaque Agent ;
- choisir un parcours adapté au travail à réaliser ;
- connaître la prochaine action sans la deviner ;
- conserver les décisions, livrables, audits et validations ;
- reprendre le travail dans une nouvelle conversation avec une passation fiable.

Les informations restent sur votre machine et dans les dossiers que vous avez choisis.

## 2. Les six mots à connaître

| Mot | Explication simple |
|---|---|
| **Project** | Le produit ou dossier général que vous pilotez. |
| **Feature** | Un résultat précis à obtenir : nouvelle fonction, correction ou amélioration. |
| **Workflow** | Le parcours de préparation et de contrôle de cette Feature. |
| **Agent** | Une personne ou une IA identifiée, avec un rôle et un périmètre. |
| **Document** | La trace vérifiable produite à une étape : plan, audit, compte rendu ou validation. |
| **Handoff** | Une passation préparée pour poursuivre dans une autre conversation ou avec un autre Agent. |

## 3. Avant de commencer

Arka Norn doit être installé sur la machine. Si ce n’est pas le cas, demandez à la personne qui administre votre environnement d’installer l’artefact interne puis de vérifier :

```bash
arka-norn selftest
arka-norn doctor
```

Si ces deux commandes réussissent, vous pouvez utiliser Arka Norn de deux façons :

1. **Depuis le cockpit** : lancez `arka-norn` dans le terminal et suivez les écrans.
2. **Depuis votre Agent** : envoyez `/arka-norn` dans Claude Code, ou `$arka-norn` dans Codex.

Le cockpit est adapté à la navigation et à la vue d’ensemble. L’Agent est adapté à l’accompagnement, à la préparation des prompts et à la production des livrables. Les deux lisent le même état.

## 4. Votre premier Project en dix minutes

### Étape 1 — Ouvrir le bon dossier

Placez-vous dans le dossier principal du produit, puis lancez :

```bash
arka-norn
```

Le cockpit propose de retrouver un Project existant, d’en créer un ou d’importer un dossier déjà présent. Rien n’est envoyé sur Internet par cette action.

### Étape 2 — Déclarer le Project

Choisissez **Créer un Project** si ce travail n’a jamais été suivi par Arka Norn. Choisissez **Importer** si le dossier contient déjà un Project ou une Feature à retrouver.

Le Project reçoit un identifiant stable. Vous continuerez à voir son nom lisible dans l’interface.

### Étape 3 — Initialiser le Product principal

Dans la conversation principale de votre Agent, envoyez :

```text
Claude Code : /arka-norn
Codex       : $arka-norn
```

Cet Agent devient le **Product principal**. Il reste dans la conversation principale, vérifie le contexte et vous conseille. Il ne doit pas s’attribuer silencieusement les rôles spécialisés.

### Étape 4 — Créer une Feature

Une Feature doit exprimer un résultat observable, par exemple :

- `Permettre la réinitialisation du mot de passe` ;
- `Corriger les erreurs de navigation mobile` ;
- `Réduire le temps de chargement du tableau de bord`.

Évitez les titres vagues comme `Améliorations diverses` : ils rendent le périmètre et la validation ambigus.

### Étape 5 — Choisir le bon parcours

| Votre situation | Workflow conseillé |
|---|---|
| Le besoin est nouveau, incertain ou structurant | **Standard** |
| L’architecture ou une migration critique est concernée | **Standard** |
| Le problème est connu et le périmètre est borné | **FastDev** |
| Il s’agit d’une correction, d’un refactor ciblé ou d’une amélioration UX précise | **FastDev** |

En cas de doute, choisissez Standard. FastDev fait gagner des étapes de préparation, pas des contrôles de qualité.

### Étape 6 — Suivre l’action recommandée

Ouvrez la Feature. Le cockpit affiche sa phase, sa progression et l’action principale. Sélectionnez **Continuer** ou **Continuer le rework**.

L’écran guidé doit toujours répondre à cinq questions :

1. Que faut-il faire ?
2. Pourquoi maintenant ?
3. Quelles preuves sont attendues ?
4. Quel document sera produit ?
5. Quelle commande ou quel Agent utiliser ?

Si l’une de ces réponses manque, ouvrez l’aide avec `?` ou demandez au Product principal de recalculer la prochaine action.

## 5. Se repérer dans le cockpit

Le cockpit s’ouvre avec `arka-norn`. Les touches réellement disponibles sont rappelées au bas de chaque écran ; la touche `?` ouvre une aide adaptée au contexte.

### Espace Project

Il rassemble :

- l’identité et la santé du Project ;
- les Features et leur workflow ;
- les Agents actifs ou remplacés ;
- les sessions de travail ;
- les actions de création, d’import et de diagnostic.

Pour une nouvelle Feature, choisissez explicitement entre :

- **Créer une Feature standard** ;
- **Démarrer un rework FastDev** ;
- **Importer une Feature existante**.

### Espace Feature

Le badge indique le workflow. La phase et la progression décrivent l’état réel, par exemple `Audit · 3/4` ou `Corrections · itération 2`.

L’action principale poursuit le parcours. Les outils de diagnostic, le scaffold manuel et la validation restent disponibles comme actions secondaires.

### Cockpit FastDev

Il montre en particulier :

- les différentes livraisons de développement ;
- le dernier commit audité ;
- les constats encore ouverts ;
- les corrections accompagnées de leurs preuves ;
- la validité de la dernière validation.

Un audit ou une validation visant une ancienne livraison ne termine jamais le rework.

## 6. Travailler avec plusieurs Agents

### Le Product principal

Le Product principal conserve la vue d’ensemble. Il doit rester dans la session `main`. Il peut :

- expliquer la prochaine étape ;
- recommander le rôle à mobiliser ;
- préparer un prompt autonome pour ce rôle ;
- vérifier les prérequis ;
- préparer une reprise de contexte avant de changer de conversation.

### Les Agents spécialisés

Selon le workflow, vous pouvez faire intervenir un Agent d’architecture, d’audit, de développement ou de QA. Chacun reçoit :

- un identifiant humain, comme `Codex_dev_20260820` ;
- un rôle ;
- une session distincte ;
- les Features et chemins qu’il est autorisé à modifier ;
- des responsabilités explicites.

Un Agent remplacé devient inactif, mais ses anciens documents restent valides et attribués à leur auteur historique.

### Préparer ou exécuter

Le Product peut proposer deux modes :

- **prepare** : l’Agent lit le contexte et prépare son intervention sans produire l’étape ;
- **execute** : l’étape est ouverte et l’Agent peut créer le livrable attendu.

Ce découpage permet de mobiliser une autre conversation à l’avance sans contourner l’ordre du workflow.

### Choisir votre niveau de délégation

Le Project possède aussi un mode d’organisation, distinct de `prepare` et
`execute` :

- **manuel** : vous transmettez vous-même les prompts aux Agents ;
- **Pilote assisté** : la valeur technique persistée est `automatic`, mais
  Arka Norn reste à vos côtés et ne lance jamais une mission sans vous.

Le Pilote assisté vous accompagne toujours dans le même ordre :

1. vous choisissez la **Feature** à faire avancer ;
2. vous choisissez l’**assistant** et sa **version** ;
3. Arka explique clairement ce qui va être fait, pourquoi maintenant, les
   fichiers concernés et ce qui peut être modifié ;
4. vous confirmez cet aperçu exact ;
5. Arka vérifie le résultat avant de proposer, sans lancer, une mission
   suivante.

Les assistants apparaissent sous des noms simples : **Claude**, **Codex**,
**Kimi Platform** et **Z.AI Coding Plan**. Arka peut en recommander un, mais le
choix vous appartient. Si le choix n’est pas sûr ou pas prêt sur votre machine,
il l’explique et ne lance rien. Après chaque mission, il vous montre un nouvel
aperçu : il n’existe pas de succession silencieuse d’actions.

Dans le cockpit Project, ouvrez **Pilote assisté**. Vous y voyez le mode, la
dernière mission, l’assistant et sa version, les événements et surtout
l’action attendue de votre part. Vous pouvez annuler une mission ou demander
une relance. Repasser en manuel empêche seulement les missions suivantes ; une
mission déjà lancée n’est jamais annulée sans vous le dire.

Arka s’arrête en sécurité si une permission imprévue, une erreur, une preuve
manquante ou un changement de périmètre apparaît. Une approbation ne peut être
donnée que pour une action précisément décrite ; une demande vague n’est jamais
autorisée automatiquement.

Un **audit** lancé par le Pilote assisté ne modifie pas vos fichiers. Il vous
indique seulement une conclusion courte et sûre, puis vous demande de produire
ou valider le document d’audit officiel avant de préparer la suite. Le texte
libre retourné par l’assistant n’est pas conservé dans Arka : cela évite qu’un
secret ou une donnée sensible soit copié dans le suivi.

À ce stade, Codex et Kimi ne peuvent pas écrire automatiquement dans une
Feature car leur mécanisme de permission ne fournit pas encore les détails
nécessaires. Le choix Kimi Platform utilise actuellement Kimi Code, pas une
connexion directe à la plateforme. Z.AI Coding Plan demande une activation et
un identifiant configurés localement par votre équipe. Le guide complet est
[Pilote assisté et orchestration contrôlée](automatic-orchestration.md).

### Changer de conversation sans perdre le contexte

Avant qu’une conversation Product devienne trop longue, demandez une passation. Le prompt généré contient les identifiants, l’état, les décisions, les points ouverts et les commandes de reprise. Collez-le dans la nouvelle conversation principale.

## 7. Comprendre le workflow Standard

Le parcours Standard sert aux travaux qui nécessitent une conception et des contrats solides :

1. **Concept** — définir le besoin, la valeur et les limites.
2. **Plan** — découper le travail en lots ordonnés.
3. **Contrats techniques** — figer les échanges externes nécessaires.
4. **Audit réel** — vérifier l’état du produit, preuves à l’appui.
5. **Invariants** — fixer les règles non négociables.
6. **Dettes** — rendre visibles les écarts acceptés pour plus tard.
7. **Tâches** — attribuer des travaux bornés aux Agents.
8. **Spécification** — décrire précisément l’intégration attendue.
9. **Développement** — réaliser et documenter les changements.
10. **Recette QA** — vérifier le résultat avant clôture.

Chaque étape dépend des précédentes. Arka Norn refuse une conclusion prématurée ou un document incomplet.

## 8. Comprendre FastDev

FastDev est le parcours court pour un rework bien délimité :

```text
Cadrage → Développement → Audit → [Correction] → Validation
```

Le cadrage couvre toujours le code, le fonctionnement, l’UX et la sécurité. L’audit peut :

- accepter la livraison et ouvrir la validation ;
- demander des corrections et renvoyer au développement ;
- déclarer un blocage à résoudre.

Chaque correction obligatoire doit citer le constat d’origine et fournir une preuve. Une validation échouée ou partielle renvoie également au développement. Seule une validation réussie portant sur la dernière livraison clôt le rework.

Consultez le [guide FastDev](fastdev.md) pour les commandes et formats détaillés.

## 9. Brainstorming avec ChatGPT ou Claude.ai

Pendant la phase Concept, Arka Norn peut préparer un kit à transmettre à un chat web. Cette option économise le contexte de l’Agent de travail tout en séparant l’exploration de la décision.

Le déroulé recommandé est :

1. demander au Product principal de préparer le template ;
2. vérifier et retirer toute information confidentielle ;
3. coller le template dans ChatGPT ou Claude.ai ;
4. récupérer la réponse ;
5. la rendre à l’Agent responsable du Concept ;
6. laisser cet Agent vérifier, arbitrer et produire le document officiel.

La réponse du chat web est une matière de réflexion, jamais une preuve ni une décision automatique. Le mode d’emploi complet se trouve dans [Brainstorming Concept avec un chat web](concept-brainstorming-web.md).

## 10. Lire les états sans jargon

| État | Ce qu’il signifie | Votre action |
|---|---|---|
| `PASS` | Le contrôle a réussi. | Continuer. |
| `WARN` | Le travail peut continuer, mais un point mérite votre attention. | Lire l’avertissement. |
| `FAIL` | Une condition obligatoire n’est pas satisfaite. | Corriger le point indiqué. |
| `incomplete` | L’étape n’a pas encore toutes ses preuves. | Produire ou compléter le livrable. |
| `blocked` | Une dépendance ou une décision extérieure manque. | Lever le blocage avant de poursuivre. |
| `obsolete` | Le document vise une ancienne livraison. | Refaire le contrôle sur la dernière livraison. |

Un échec de `doctor` ne signifie pas forcément que votre code produit est cassé. Il indique qu’un élément de l’espace de gestion demande une correction. Le détail nomme le contrôle concerné.

## 11. Les routines utiles

### Au début d’une session

```bash
arka-norn doctor
arka-norn
```

Vérifiez ensuite le Project, la Feature, l’Agent actif et l’action recommandée.

### Avant de confier une étape

- vérifiez que le rôle proposé correspond à l’étape ;
- ouvrez une session spécialisée ;
- donnez à l’Agent le prompt préparé par le Product ;
- ne lui demandez pas de deviner les identifiants ou son périmètre.

### Avant d’accepter une livraison

- ouvrez les preuves annoncées ;
- vérifiez que l’audit ou la QA vise le dernier CR ;
- lisez les limites et constats encore ouverts ;
- confirmez que la Feature est réellement marquée terminée.

### Avant de changer de conversation

Générez un handoff Product. Ne vous contentez pas d’un résumé libre : la passation doit conserver les identifiants et l’état vérifiable.

## 12. Actions sensibles et sécurité

- `doctor` observe ; il ne modifie rien.
- `doctor --repair` prépare un plan de réparation ; seul `--repair --apply` l’applique.
- `project forget` ou `feature forget` retire un élément de l’index local, sans supprimer votre dossier métier. Si son marker a disparu, ajoutez `--yes --force` pour une récupération index-only explicitement confirmée.
- N’utilisez `--force` que si vous comprenez précisément le conflit signalé.
- Ne copiez pas de secrets, données personnelles ou code confidentiel dans un chat web public.
- Vérifiez toujours le Project et la Feature affichés avant de lancer une mutation.

Les fichiers de travail d’Arka Norn ne doivent pas être modifiés à la main sauf procédure documentée. Utilisez le cockpit, la CLI ou les skills pour préserver la cohérence et la trace d’audit.

## 13. Dépannage rapide

### « Le Project ou la Feature est introuvable »

Ouvrez le bon dossier puis relancez le scan depuis le cockpit. Un déplacement de dossier ne change pas l’identité : les marqueurs sont portables et les index peuvent être reconstruits.

### « Aucun Agent actif n’est sélectionné »

Retournez dans l’espace Agents. Sélectionnez un Agent actif pour cette session ou demandez au Product principal de vous guider. Un Agent inactif ne peut pas signer de nouveau document.

### « L’étape suivante semble incorrecte »

Vérifiez que le bon workflow est affiché, puis consultez l’état du Pipeline. Un document invalide, une dépendance manquante ou un ancien CR explique généralement le retour à une étape antérieure.

### « Les skills sont divergentes »

Lancez le diagnostic des skills. Une divergence signifie qu’une copie installée ne correspond pas au catalogue attendu. Consultez le plan proposé avant de réinstaller afin de ne pas écraser une personnalisation sans accord.

### « Le cockpit est difficile à lire »

Agrandissez la fenêtre du terminal. Sous la largeur minimale, Arka Norn affiche un mode dégradé et indique les informations qui ne peuvent pas être rendues correctement.

Pour les messages détaillés et les procédures de réparation, consultez le [guide de dépannage](troubleshooting.md).

## 14. Aide-mémoire

```bash
arka-norn                                      # ouvrir le cockpit
arka-norn guide                                # afficher le parcours guidé
arka-norn doctor                               # contrôler la santé
arka-norn project list                         # lister les Projects
arka-norn feature list --project <project-id>  # lister les Features
arka-norn workflow list                        # comparer les workflows
arka-norn fastdev status <feature-id>          # état d’un rework
arka-norn pipeline next <feature-id>            # prochaine action calculée
```

Depuis un Agent :

```text
/arka-norn   dans Claude Code
$arka-norn   dans Codex
```

Pour aller plus loin : [cockpit TUI](tui.md), [orchestration des Agents](agent-orchestration.md), [référence CLI](cli.md) et [guide développeur](guide-developpeur.md).
