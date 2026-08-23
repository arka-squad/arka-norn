# Architecture d’arka.norn

arka.norn est un plan de contrôle local-first pour des Projects et leurs Features. Une même logique métier alimente la CLI, la TUI, les skills et les tests.

Pour installer l’environnement, étendre un contrat et choisir les bons tests, consultez le [guide développeur](guide-developpeur.md).

## Frontières

- `src/domain/` : entités, règles Pipeline et décisions pures, sans Node ni filesystem.
- `src/application/` et `src/use-cases/` : orchestration des cas d’usage.
- `src/ports/` : contrats entrants et sortants.
- `src/adapters/inbound/` : présentation CLI/TUI.
- `src/adapters/outbound/` : filesystem, validation, skills et système.
- `src/composition/` : câblage et contrôleurs de scènes TUI, sans règle métier.
- `src/adapters/inbound/cli/main-cli.ts` : routeur unique et typé des commandes.
- `bin/` et `scripts/` : frontières Node minces ; aucune logique d’installation,
  de migration ou de validation n’y est dupliquée.

## Sources de vérité

- Project : `<project>/.arka-norn/project.json`.
- Feature : `<feature>/.arka-norn/feature.json`.
- Registre Agents : `<project>/.arka-norn/agents.json`.
- Politique d’orchestration v2 : `<project>/.arka-norn/orchestration.json`, sans secret ni état de processus ; elle porte les assistants et modèles choisis par le Project.
- Registre d’exécutions v2 : `<project>/.arka-norn/executions.json`, séparé du marker et des états privés du worker ; il porte la cible immuable assistant/adapter/modèle de chaque mission.
- Agents courants par session : `~/.arka-norn/context/agents.json`, contexte privé reconstructible au format v2.
- État jetable du worker : `$ARKA_NORN_HOME/.arka-norn/workers/<project>/<execution>.json`, privé et reconstructible.
- Documents : JSON de la Feature, validés par les schémas et le graphe Pipeline.
- Index : `~/.arka-norn/index/*.json`, caches privés reconstructibles.
- Catalogue pipelines : `pipelines/catalog.json`, résolu sans chemin fourni par l’utilisateur ; il contient Standard, Essentiel et FastDev et désigne Essentiel comme défaut de création.
- Catalogue skills : `skills-src/catalog/skills.json` et les 21 sources JSON référencées.
- Audit transverse : `application/audit` orchestre les états et invariants, `domain/audit` porte les douze domaines, `LocalAuditCollector` réduit les observations et `FsAuditStore` persiste rapports, preuves et KB hors Pipeline.
- Exécution d’audit : le port `AuditToolRunner` est distinct des workers provider et des ordres Pipeline ; son adapter Docker/Podman n’accepte que le catalogue d’images épinglées et des arguments structurés.

Le marker Project v4 porte `orchestrationMode: manual | automatic`; le marker Feature reste v3. Aucun de ces markers ne stocke un chemin machine. Les adapters dérivent la racine runtime du dossier canonique qui contient le marker ; seuls les index locaux enregistrent des chemins absolus et restent des caches non fiables. Toute entrée indexée est rechargée puis comparée au marker avant lecture ou écriture. Un clone ou un déplacement conserve ainsi sa source de vérité, puis un scan reconstruit le cache de la machine courante. Si l'ancien emplacement indexé n'est plus lisible, le cache est relocalisé atomiquement ; si les deux emplacements portent encore la même identité, le doublon actif est refusé.

Le `PipelineReport` sépare présence, conformité de schéma, verdict métier, dépendances, complétude, documents sélectionnés et prochaines actions. Les politiques déclaratives `delivery`, `audit_then_fix` et `review_latest` sélectionnent le dernier CR, imposent les corrections et rendent les anciennes validations obsolètes. CLI, TUI et skills consomment la même résolution `Feature.pipelineId`. Essentiel et FastDev partagent le moteur guidé `guided-next` et `guided-feature-cli` ; leurs adapters ne portent que la configuration propre au workflow.

Les documents historiques utilisent l’enveloppe v2. Les documents de Feature
nouvellement scaffoldés utilisent la v3 commune : `id`, `feature_id`,
`author_agent_id`, `schema_version`, `sequence`, `created_at` et relations
explicites. `audit_etat_reel` accepte aussi l’enveloppe Project v4, réservée à
un audit de Project entier : elle porte `project_id`, jamais `feature_id`.
Cette extension ne modifie ni le graphe Pipeline d’une Feature ni la lecture
v2/v3. Son scaffold est autorisé à la racine du seul Project déclaré, jamais
dans une Feature, un Project enfant ou `.arka-norn`. Le moteur rejette IDs
dupliqués, cardinalités interdites, relations inconnues et cycles.

Le domaine Agent est séparé des marqueurs pour ne pas coupler leur version. Son adapter sérialise les inscriptions et remplacements sous un lock par Project ; les use cases CLI/TUI partagent exactement les mêmes transitions. La sélection privée v2 est indexée par `AgentSessionId` puis `ProjectId`, avec lecture compatible du format v1 dans `main`. Le Product principal occupe `main`; chaque provider spécialisé possède sa propre session. Une Feature marquée est toujours inspectée avec son registre Project : une erreur de Project ou de registre échoue, elle ne déclenche jamais un rapport permissif. `doctor` vérifie chaque chaîne session locale → Project indexé → marqueur → registre → Agent actif et contrôle aussi le contexte Project du répertoire ciblé.

La politique pure `application/agents/agent-orchestration` mappe la prochaine étape au rôle autorisé, distingue exécution et préparation, choisit la skill/profil et construit les prompts sans mutation. Le runtime compose Projects, Features, registre, sessions et `PipelineReport`; la CLI et le contrôleur TUI ne réimplémentent aucune règle.

## Pilote assisté

arka.norn reste le plan de contrôle. Il transforme une évaluation fraîche du
Pipeline en aperçu non mutante puis en `MissionOrder` immuable, et vérifie à
nouveau Project, Feature, chemins, Pipeline et prochaine étape avant le
dispatch. Mastra est un worker local derrière un port d’exécution : il n’a pas
le droit de choisir une étape, un assistant, un modèle ou un périmètre.

Le marker Project v4 porte `manual|automatic`; dans l’expérience utilisateur,
`automatic` est le **Pilote assisté**. Pour chaque mission, le port entrant
exige une Feature, une cible assistant/modèle et l’empreinte de l’aperçu que
l’utilisateur vient de confirmer. La politique Project v2 évalue les candidats
autorisés, activés, sains et capables, selon la priorité puis un départage
stable, afin de recommander un candidat éligible. Elle ne remplace jamais le
choix explicite. La cible est figée dans l’`ExecutionRecord`; aucun fallback ni
enchaînement silencieux ne survient après le début d’une mission. Le registre
d’exécutions conserve les tentatives, événements bornés, preuves et
suspensions, tandis que les PID et autres détails de processus restent privés
sous `ARKA_NORN_HOME`.

Le broker de permissions est deny-by-default. Seules les actions à chemin
structuré prouvables dans la racine Feature peuvent être préautorisées ; shell,
sous-processus, réseau et demandes ACP opaques sont refusés. Claude et Z.AI
passent par le worker à permissions structurées ; Codex ACP et Kimi Code ACP
restent non éligibles aux écritures Feature tant que leur transport ne prouve
pas ce scope. Z.AI n’accepte qu’un endpoint fixé dans l’adapter et requiert une
activation/identifiant locaux explicites. Avant le dispatch, le `MissionOrder`
est revalidé deux fois. Une mission qui écrit demande un marqueur lié à
l’exécution, une transition Pipeline et un document valide nouveau ; une
mission d’audit est dérivée en lecture seule, conserve seulement une conclusion
fermée et attend une validation humaine du livrable officiel. Le workspace
Mastra n’est pas une sandbox ; l’isolation effective dépend du runtime local.
Le contrat complet est documenté dans
[le Pilote assisté et l’orchestration contrôlée](automatic-orchestration.md).

## Transactions locales

Les écritures JSON utilisent un temporaire unique ouvert en exclusif, `fsync` du fichier et, lorsque la plateforme le supporte, du dossier, puis renommage atomique et permissions explicites. Les modes privés `0600` sont vérifiés sur POSIX ; Windows s'appuie sur les ACL du profil. Les index sont protégés par locks inter-processus avec token de propriétaire ; seul le détenteur peut libérer son lock. Un marker est écrit avant l’index reconstructible ; `doctor` et les scans réparent les caches sans supprimer les données métier. Les mutations Project, Feature, Agent et Pipeline écrivent d'abord une intention au journal d'audit, dont les répertoires et fichiers symboliques sont refusés.
