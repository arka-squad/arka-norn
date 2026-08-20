# Architecture d’arka-norn

arka-norn est un plan de contrôle local-first pour des Projects et leurs Features. Une même logique métier alimente la CLI, la TUI, les skills et les tests.

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
- Agent courant : `~/.arka-norn/context/agents.json`, contexte privé reconstructible.
- Documents : JSON de la Feature, validés par les schémas et le graphe Pipeline.
- Index : `~/.arka-norn/index/*.json`, caches privés reconstructibles.
- Catalogue pipelines : `pipelines/catalog.json`, résolu sans chemin fourni par l’utilisateur.
- Catalogue skills : `skills-src/catalog/skills.json` et les 17 sources JSON référencées.

Les marqueurs Project/Feature v3 ne stockent aucun chemin machine. Les adapters dérivent la racine runtime du dossier canonique qui contient le marqueur ; seuls les index locaux enregistrent des chemins absolus. Un clone ou un déplacement conserve ainsi sa source de vérité, puis un scan reconstruit le cache de la machine courante. Si l'ancien emplacement indexé n'est plus lisible, le cache est relocalisé atomiquement ; si les deux emplacements portent encore la même identité, le doublon actif est refusé.

Le `PipelineReport` sépare présence, conformité de schéma, verdict métier, dépendances, complétude et prochaines actions. Les politiques déclaratives `delivery`, `audit_then_fix` et `review_latest` sélectionnent le dernier CR, imposent les corrections et rendent les anciennes validations obsolètes. CLI, TUI et skills consomment la même résolution `Feature.pipelineId`.

Les documents historiques utilisent l’enveloppe v2. Tout nouveau scaffold utilise la v3 commune : `id`, `feature_id`, `author_agent_id`,
`schema_version`, `sequence`, `created_at` et relations explicites. Le moteur
rejette IDs dupliqués, cardinalités interdites, relations inconnues et cycles.

Le domaine Agent est séparé des marqueurs pour ne pas coupler leur version. Son adapter sérialise les inscriptions et remplacements sous un lock par Project ; les use cases CLI/TUI partagent exactement les mêmes transitions. `doctor` vérifie la chaîne session locale → Project indexé → marqueur → registre → Agent actif et contrôle aussi le contexte Project du répertoire ciblé.

## Transactions locales

Les écritures JSON utilisent un temporaire unique ouvert en exclusif, `fsync` du fichier et, lorsque la plateforme le supporte, du dossier, puis renommage atomique et permissions explicites. Les modes privés `0600` sont vérifiés sur POSIX ; Windows s'appuie sur les ACL du profil. Les index sont protégés par locks inter-processus avec token de propriétaire ; seul le détenteur peut libérer son lock. Un marker est écrit avant l’index reconstructible ; `doctor` et les scans réparent les caches sans supprimer les données métier.
