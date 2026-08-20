# Architecture d’arka-norn

arka-norn est un plan de contrôle local-first pour des Projects et leurs Features. Une même logique métier alimente la CLI, la TUI, les skills et les tests.

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
- Agents courants par session : `~/.arka-norn/context/agents.json`, contexte privé reconstructible au format v2.
- Documents : JSON de la Feature, validés par les schémas et le graphe Pipeline.
- Index : `~/.arka-norn/index/*.json`, caches privés reconstructibles.
- Catalogue pipelines : `pipelines/catalog.json`, résolu sans chemin fourni par l’utilisateur.
- Catalogue skills : `skills-src/catalog/skills.json` et les 18 sources JSON référencées.

Les marqueurs Project/Feature v3 ne stockent aucun chemin machine. Les adapters dérivent la racine runtime du dossier canonique qui contient le marqueur ; seuls les index locaux enregistrent des chemins absolus et restent des caches non fiables. Toute entrée indexée est rechargée puis comparée au marker avant lecture ou écriture. Un clone ou un déplacement conserve ainsi sa source de vérité, puis un scan reconstruit le cache de la machine courante. Si l'ancien emplacement indexé n'est plus lisible, le cache est relocalisé atomiquement ; si les deux emplacements portent encore la même identité, le doublon actif est refusé.

Le `PipelineReport` sépare présence, conformité de schéma, verdict métier, dépendances, complétude et prochaines actions. Les politiques déclaratives `delivery`, `audit_then_fix` et `review_latest` sélectionnent le dernier CR, imposent les corrections et rendent les anciennes validations obsolètes. CLI, TUI et skills consomment la même résolution `Feature.pipelineId`.

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

## Transactions locales

Les écritures JSON utilisent un temporaire unique ouvert en exclusif, `fsync` du fichier et, lorsque la plateforme le supporte, du dossier, puis renommage atomique et permissions explicites. Les modes privés `0600` sont vérifiés sur POSIX ; Windows s'appuie sur les ACL du profil. Les index sont protégés par locks inter-processus avec token de propriétaire ; seul le détenteur peut libérer son lock. Un marker est écrit avant l’index reconstructible ; `doctor` et les scans réparent les caches sans supprimer les données métier. Les mutations Project, Feature, Agent et Pipeline écrivent d'abord une intention au journal d'audit, dont les répertoires et fichiers symboliques sont refusés.
