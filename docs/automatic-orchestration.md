# Orchestration automatique contrôlée

L’automatisation n’enlève pas la gouvernance du Project. Arka Norn reste le
**plan de contrôle** : il calcule l’étape réellement ouverte, vérifie les
préconditions et les preuves, puis décide si une autre mission peut être
proposée. Mastra est un **worker local durable par Project** : il exécute
uniquement un ordre de mission déjà validé par Arka Norn.

Cette frontière est importante : ni Mastra, ni Claude, ni Codex ne choisissent
librement une étape de Pipeline, un provider, une permission ou le périmètre
d’une mission.

## Prérequis

L’orchestration Mastra requiert Node.js `>=22.13`. Les providers supportés
sont Claude et Codex via ACP. Leur disponibilité locale et leurs capacités sont
vérifiées avant toute sélection ; le simple fait qu’un binaire soit installé ne
le rend pas automatiquement éligible. En V1, Codex ACP reste un adapter
supporté, mais il n’est pas candidat aux écritures Feature tant que son harness
ne fournit pas un contrat de permission structuré et vérifiable.

## Deux modes distincts

Le marker **Project** est en version 4 et porte :

```json
{ "orchestrationMode": "manual" }
```

Les seules valeurs possibles sont `manual` et `automatic`. Les markers
**Feature restent en version 3** : le mode Project ne change ni leur format ni
le graphe Pipeline.

- `manual` conserve le parcours habituel : le Product prépare et l’utilisateur
  transmet les prompts aux Agents spécialisés.
- `automatic` autorise le worker à recevoir les missions qu’Arka Norn vient de
  valider. Il ne permet pas une suite libre de tâches.

Ce mode Project ne doit pas être confondu avec `prepare`/`execute` :
ces derniers décrivent le comportement d’un Agent ou d’un prompt, tandis que
`manual`/`automatic` décrit la planification des missions du Project.

Les Projects v1, v2 et v3 migrent vers le marker v4 avec `manual` par défaut.
Une lecture ou un diagnostic ne réécrit rien. `migrate --apply` effectue la
mutation explicitement et conserve la sauvegarde adjacente de la version source.

## Commandes publiques

```text
arka-norn orchestration start --project <project-id> [--feature <feature-id>]
arka-norn orchestration status --project <project-id>
arka-norn orchestration cancel <execution-id> --project <project-id>
arka-norn orchestration approve <execution-id> --project <project-id>
arka-norn orchestration retry <execution-id> --project <project-id>
```

`start` arme explicitement le mode `automatic`, puis demande à Arka Norn de
valider une première mission. Chaque mission suivante nécessite une nouvelle
validation du plan de contrôle. Revenir à `manual` arrête la planification
suivante ; cela n’annule jamais silencieusement une exécution déjà active.

`status` expose le mode, la politique, les missions, le provider choisi, les
événements bornés et l’action humaine attendue. Il n’expose ni PID, ni
configuration de processus, ni secret. `cancel`, `approve` et `retry`
agissent sur une exécution identifiée et restent journalisés.

`approve` est réservé à une demande structurée que le broker peut associer à
une action et un scope. Une demande ACP opaque n’est jamais transformée en
grant : elle termine en `failed` avec `permission_not_preapproved` et demande
une inspection de la politique ou du provider.

La TUI présente les mêmes contrôles dans le Project : mode, mission active,
provider, événements, demande d’approbation, raison de suspension et action à
faire. Elle n’offre pas de lancement libre d’un worker interne.

## Données persistées

```text
<project>/.arka-norn/project.json        marker Project v4 et son mode
<project>/.arka-norn/orchestration.json  politique d’exécution v1
<project>/.arka-norn/executions.json     registre d’exécutions v1
<feature>/.arka-norn/feature.json        marker Feature v3

$ARKA_NORN_HOME/.arka-norn/workers/...   état de processus privé et jetable
```

La politique `orchestration.json` lie son `projectId`, les providers
autorisés, leurs capacités, leurs permissions et leur priorité. Elle ne
contient jamais de secret, token, budget, PID, session externe ou état Mastra.

Le registre `executions.json` conserve les ordres de mission, le provider
choisi, un identifiant de session externe lorsqu’il est sûr de l’exposer, les
tentatives, les événements bornés, les références aux preuves et les motifs de
suspension. Les états sont :

```text
planned | running | awaiting_approval | succeeded | failed
cancelled | interrupted | rejected
```

L’état de processus du worker est hors du Project, sous `ARKA_NORN_HOME`, avec
des permissions privées et une durée de vie jetable. Il est reconstructible et
ne constitue pas une source de vérité portable. En particulier, un PID ancien
ou réutilisé ne sert jamais à autoriser l’envoi d’un signal à un processus.

## Ordre de mission et sélection du provider

Un `MissionOrder` est immuable. Il porte un identifiant, le Project, la
Feature éventuelle, les chemins relatifs autorisés, le Pipeline attendu, la
prochaine étape attendue, les capacités et permissions nécessaires, ainsi
qu’un résumé sans secret. Avant le dispatch, le worker vérifie de nouveau ces
préconditions. Un changement de scope, de Pipeline ou de prochaine étape
suspend ou rejette la mission : il ne tente pas de l’adapter.

Une mission d’écriture exige aussi une identité Agent active, liée à la session
requise, compatible avec le rôle et déjà scoped sur la Feature. Le worker ne
crée pas d’Agent, ne modifie pas la session Product et ne touche pas le
registre Agent : le `author_agent_id` est fourni par le plan de contrôle dans
le prompt borné.

Le sélecteur déterministe ne considère que les providers :

1. présents dans la politique du Project et activés ;
2. sains localement ;
3. capables d’exécuter la mission ;
4. autorisés pour toutes les permissions demandées.

Il choisit ensuite la plus haute priorité du Project, avec un départage stable
par nom de provider. Le provider retenu est inscrit dans l’exécution avant son
démarrage, avec un événement borné qui consigne les candidats, leur éligibilité
et leur priorité. Il n’y a **aucun fallback après le début d’une exécution** ;
une relance conserve ce choix pour garder une trace explicable.

## Permissions et isolation

Le broker de permissions est **deny-by-default**. Les seules autorisations
préautorisables sont les lectures et écritures dont le provider expose
structurellement le chemin et que le worker peut prouver dans la racine
Feature. Le shell, les sous-processus et le réseau ne font jamais partie de
l’autorisation automatique. Toute permission non prévue, opaque ou impossible
à prouver de façon portable est refusée (`permission_not_preapproved`) ; une
demande structurée future pourra se placer en `awaiting_approval`. Une erreur
provider, une preuve manquante ou un écart de scope suspend également le flux.

Les chemins du `MissionOrder` restent relatifs au Project pour l’audit. Le
processus worker démarre, lui, à la racine Feature vérifiée et reçoit seulement
`.` comme scope local ; cette conversion évite de confondre les deux repères.
Même dans ce scope entier, `.arka-norn/**` et `.git/**` restent structurellement
refusés. `Glob` et `Grep` doivent fournir un chemin relatif explicite : un motif
seul, un chemin absolu, un traversal ou un lien symbolique sortant est refusé.

Le workspace exposé à Mastra n’est pas une sandbox de sécurité. L’adapter
réduit l’environnement du processus, n’hérite pas les variables arbitraires ni
les identifiants ambiants, crée un runtime temporaire privé et nettoie ses
processus, mais ces mesures ne remplacent pas une isolation OS ou conteneur.
Un identifiant provider peut être fourni explicitement (`ARKA_NORN_MASTRA_CLAUDE_API_KEY`
ou `ARKA_NORN_MASTRA_CODEX_API_KEY`) : il est transmis seulement au processus
provider correspondant, en mémoire, jamais au `MissionOrder`, au payload JSON,
au journal ni au registre. Ne placez donc jamais de secret dans le Project, la
politique, le registre, l’ordre de mission, les arguments de commande ou les
événements.

Avant le dispatch puis après la préparation du prompt, le plan de contrôle
revalide les préconditions immuables. L’identité Agent active doit aussi
correspondre au provider sélectionné. Pour réussir, le provider doit rendre le
marqueur `ARKA_NORN_PROOF:<execution-id>:<step-id>` et Arka Norn doit observer
une transition de Pipeline ainsi qu’un document valide nouveau de **cette étape**
signé par **cet Agent**. La sortie brute provider n’est jamais persistée. Si le
heartbeat privé d’un worker expire, une prochaine action explicite le marque
`interrupted` ou `rejected` ; aucun PID enregistré ne sert à envoyer un signal.

## Annuler, interrompre et relancer

Une annulation demandée par l’utilisateur arrête le worker et laisse une trace
`cancelled`. Sur POSIX, le worker est lancé dans son propre groupe de processus
afin que l’annulation atteigne aussi ses descendants ; Windows conserve le
repli sur le processus direct. Une interruption de processus est enregistrée
comme `interrupted`, jamais comme une réussite partielle.

Pour Codex ACP, une exécution interrompue se relance comme une **nouvelle
exécution provider** : elle ne promet aucune reprise exacte de session. Cette
règle est générique au port d’exécution, même si un provider conserve ses
propres snapshots. Ne supposez pas qu’un `retry` reprend un contexte ACP
interrompu ; relisez toujours l’ordre, le scope et la prochaine étape.

## Tests et smoke tests réels

La CI utilise des adapters/providers fake afin de tester la sélection, les
permissions refusées, les annulations, les registres concurrents et les
relances sans identifiants réels.

Le smoke test réel est volontairement opt-in :

```text
ARKA_MASTRA_SMOKE=1 npm run smoke:mastra
```

Il ne doit être exécuté que lorsque l’identifiant explicite du provider est
fourni (`ARKA_NORN_MASTRA_CLAUDE_API_KEY` ou
`ARKA_NORN_MASTRA_CODEX_API_KEY`), ainsi que, pour Codex ACP, le chemin absolu
d’un harness déjà installé, configuré avec `ARKA_NORN_CODEX_ACP_COMMAND` et,
si nécessaire, `ARKA_NORN_CODEX_ACP_ARGS` (tableau JSON). Les secrets ne sont ni lus depuis les fichiers
Project, ni persistés par le registre d’orchestration.

Pour les détails de sécurité, voir [Sécurité locale](security.md). Pour les
options et codes de sortie, voir la [référence CLI](cli.md).
