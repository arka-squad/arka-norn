# Pilote assisté et orchestration contrôlée

Le mode `automatic` n’est pas une option technique ni une délégation aveugle.
Dans l’interface arka.norn, il s’appelle le **Pilote assisté** : arka.norn reste le
plan de contrôle, explique ce qui va se passer, puis attend le choix et la
confirmation de l’utilisateur avant de lancer chaque mission.

Mastra est un worker local durable par Project. Il exécute uniquement un ordre
de mission déjà validé par arka.norn ; il ne choisit jamais une étape de
Pipeline, un assistant, une version, une permission ou un périmètre.

## Ce que vous choisissez

Le Project conserve l’un de ces deux modes :

- `manual` : vous transmettez vous-même les prompts aux Agents.
- `automatic` : le Pilote assisté peut lancer une mission validée après votre
  confirmation explicite.

Ce choix est distinct de `prepare` et `execute`, qui décrivent ce qu’un Agent
spécialisé peut faire dans sa session.

Dans le Pilote assisté, le parcours est toujours le même :

```text
Feature
  → assistant et version choisis par l’utilisateur
  → aperçu lisible de la mission
  → confirmation de cet aperçu
  → exécution bornée
  → preuves vérifiées par Arka
```

L’aperçu indique au minimum la Feature, l’étape ouverte, le rôle attendu, ce
qui sera fait, les chemins concernés, les autorisations prévues et l’état de
chaque choix possible. Arka peut signaler une recommandation fondée sur la
politique du Project, mais ne substitue jamais son choix à celui de
l’utilisateur. Une empreinte relie la confirmation à cet aperçu exact : si le
Pipeline, le périmètre ou la politique a changé, il faut relire et confirmer
le nouvel aperçu.

Après une réussite, Arka vérifie les preuves puis exige un **nouvel aperçu et
une nouvelle confirmation**. Il n’enchaîne jamais une seconde mission en
silence. Revenir à `manual` bloque les lancements suivants sans annuler une
mission déjà active.

## Prérequis et assistants disponibles

Le worker Mastra requiert Node.js `>=22.13`. Les libellés présentés à
l’utilisateur sont :

| Assistant | Intégration locale | État de sécurité pour une mission qui écrit dans une Feature |
|---|---|---|
| Claude | worker Claude avec broker de permissions structuré | éligible si son identifiant local explicite et la politique sont valides |
| Codex | ACP | non éligible tant que le protocole ACP ne décrit pas une permission d’écriture prouvable |
| Kimi Platform | Kimi Code ACP | non éligible pour la même raison que Codex ; ce n’est pas encore une intégration directe de l’API Kimi Platform |
| Z.AI Coding Plan | worker compatible Claude, endpoint officiel fixé dans l’adapter | éligible seulement après activation locale explicite et identifiant local explicite |

Un assistant et une version peuvent être mémorisés dans la politique du
Project sans devenir automatiquement utilisables. Au moment de l’aperçu, Arka
vérifie de nouveau qu’ils sont autorisés, configurés localement, sains et
capables de réaliser précisément la mission. Une option indisponible reste
expliquée à l’écran au lieu de provoquer un fallback silencieux.

Z.AI n’accepte pas d’URL fournie par un Project ou par la CLI : son endpoint
compatible Claude est fixé par l’adapter. Kimi est présenté sous le nom
« Kimi Platform » pour rester compréhensible, mais le harness V1 invoque
Kimi Code ACP ; une boucle d’outils directe vers Kimi Platform n’est pas
promise par ce contrat.

## Utiliser le Pilote assisté

Le cockpit guide ces quatre choix. La CLI offre le même contrat explicite :

```text
arka-norn orchestration configure --project <project-id> \
  --provider <claude|codex|kimi|zai> --model <version>

arka-norn orchestration preview --project <project-id> --feature <feature-id>

arka-norn orchestration start --project <project-id> --feature <feature-id> \
  --provider <claude|codex|kimi|zai> --model <version> \
  --preview <empreinte-affichée>

arka-norn orchestration status --project <project-id>
arka-norn orchestration cancel <execution-id> --project <project-id>
arka-norn orchestration approve <execution-id> --project <project-id>
arka-norn orchestration retry <execution-id> --project <project-id>
```

1. `configure` ajoute ou active explicitement l’assistant et la version choisis
   dans la politique du Project. Il ne stocke aucun identifiant sensible.
2. `preview` ne lance rien et ne modifie pas le Pipeline. Il explique la
   prochaine mission et renvoie son empreinte.
3. `start` exige le même assistant, la même version et la même empreinte. Il
   arme le marker Project en `automatic` uniquement après cette confirmation,
   puis lance la mission validée.

Les commandes `status`, `cancel`, `approve` et `retry` sont volontaires et
journalisées. `status` montre l’action humaine attendue mais jamais un secret,
un PID ou l’état interne du processus. `approve` ne peut traiter qu’une
demande structurée, liée à une opération et un chemin autorisés. Une demande
ACP opaque est refusée en sécurité ; elle ne devient jamais une permission
par défaut.

## Données persistées et versions

```text
<project>/.arka-norn/project.json        marker Project v4, avec manual|automatic
<project>/.arka-norn/orchestration.json  politique d’exécution v2
<project>/.arka-norn/executions.json     registre d’exécutions v2
<feature>/.arka-norn/feature.json        marker Feature v3

$ARKA_NORN_HOME/.arka-norn/workers/...   état de processus privé et jetable
```

Le marker Project reste en v4 ; les markers Feature restent en v3. La
politique et le registre sont volontairement séparés du marker afin de garder
les décisions de lancement, les tentatives et les preuves traçables sans y
mêler les données d’identité du Project.

La politique v2 contient notamment les assistants autorisés, leurs modèles
explicitement choisis, leurs capacités, permissions et priorités. Le registre
v2 conserve l’ordre de mission immuable, la cible exacte
assistant/version/adapter, les tentatives, les événements bornés, les preuves
et les raisons d’arrêt. Ni l’un ni l’autre ne contient de secret, token, budget,
PID, session de processus ou snapshot Mastra.

Les formats v1 existants restent lisibles pour la migration ; une nouvelle
mission ne peut toutefois être confirmée qu’avec une cible assistant/modèle
explicite du format v2. Une lecture ou un diagnostic ne transforme pas le
marker Project et `migrate --apply` conserve la sauvegarde adjacente existante.

## Sélection, ordre de mission et permissions

Un `MissionOrder` est immuable. Il porte le Project, la Feature, les chemins
relatifs autorisés, le Pipeline et l’étape attendus, les capacités,
autorisations et un résumé sans secret. Le worker le revalide avant son
dispatch : un changement de scope, de Pipeline ou de prochaine étape suspend
ou refuse la mission au lieu de l’adapter.

Pour construire l’aperçu, Arka évalue les candidats selon la politique du
Project, leur santé locale, leurs capacités et leurs permissions. La priorité
du Project et un départage stable servent uniquement à recommander un candidat
éligible. L’utilisateur confirme toujours la cible exacte. Une fois la mission
démarrée, sa cible est immuable : il n’existe aucun fallback vers un autre
assistant ou modèle. Une relance garde la même cible ; une exécution historique
sans modèle explicite ne peut pas être relancée automatiquement.

Le broker de permissions est **deny-by-default**. Les lectures et écritures ne
sont admises que si l’adapter expose une opération et un chemin structurels,
prouvables dans la racine Feature. Shell, sous-processus et réseau ne font
jamais partie d’une autorisation automatique. Même dans un scope Feature,
`.arka-norn/**` et `.git/**` sont refusés. Une erreur, une preuve absente, une
permission non prévue ou un écart de scope arrête le flux en sécurité.

Le workspace Mastra n’est pas une sandbox. L’adapter réduit l’environnement,
utilise un runtime temporaire privé et nettoie ses processus, sans prétendre
remplacer une isolation système ou un conteneur. Un identifiant d’assistant est
fourni uniquement par l’environnement local explicite au processus concerné,
en mémoire ; il n’est jamais mis dans le Project, un ordre de mission, un
payload JSON, un journal ou un registre.

Une mission qui écrit exige un marqueur de preuve lié à l’exécution, une
transition Pipeline et un nouveau document valide de l’étape attendue, signé
par l’Agent compatible avec l’assistant sélectionné. La sortie brute de
l’assistant n’est pas persistée.

Une mission d’**audit** est différente : elle reçoit uniquement la lecture du
scope Feature. Elle rend une conclusion fermée (`aucun blocage`, `éléments à
vérifier`, `périmètre à revoir` ou `conclusion impossible`) que le registre
conserve sans texte libre. Arka ne fait pas progresser le Pipeline et bloque
la relance de cette même étape tant qu’une personne n’a pas produit ou validé
le livrable d’audit officiel. C’est volontaire : un rapport détaillé du
provider ne doit pas devenir un journal public susceptible de contenir des
données sensibles.

## Annuler, interrompre et relancer

`cancel` arrête explicitement le worker et inscrit une trace. Une interruption
est enregistrée comme `interrupted`, jamais comme une réussite partielle.
Codex ACP et Kimi Code ACP ne promettent pas de reprise exacte : une relance
est une nouvelle exécution qui relit l’ordre, le scope et la prochaine étape.

Sur POSIX, les workers sont placés dans leur propre groupe de processus afin
que l’annulation atteigne les descendants. Sous Windows, le repli s’applique au
worker direct. Les métadonnées de processus restent privées et jetables sous
`ARKA_NORN_HOME`; un PID ancien ou réutilisé ne sert jamais à autoriser un
signal.

## Tests et smoke tests réels

La CI utilise des providers fake pour tester le choix de cible, les
préconditions obsolètes, les permissions refusées, l’annulation, les registres
concurrents, les relances et le retour au mode manuel. Elle n’emploie aucun
identifiant réel.

Les smoke tests Claude, Codex, Kimi ou Z.AI sont volontairement opt-in. Ils ne
doivent être exécutés qu’avec un identifiant explicitement fourni dans
l’environnement local et, pour les adapters ACP, un harness local déjà
installé et configuré. Ils ne sont jamais une gate de release ordinaire et ne
lisent pas de secret depuis le Project.

Pour les options précises, voir la [référence CLI](cli.md). Pour la frontière
de sécurité, voir [Sécurité locale](security.md).
