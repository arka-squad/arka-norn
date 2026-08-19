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
- Documents : JSON de la Feature, validés par les schémas et le graphe Pipeline.
- Index : `~/.arka-norn/index/*.json`, caches privés reconstructibles.
- Catalogue skills : `skills-src/catalog/skills.json` et les 14 sources JSON référencées.

Le `PipelineReport` sépare présence, conformité de schéma, verdict métier, dépendances, complétude et prochaines actions. Une QA `pass` ne termine la Feature que si elle référence le dernier CR de développement valide.

Tous les documents utilisent l’enveloppe v2 commune : `id`, `feature_id`,
`schema_version`, `sequence`, `created_at` et relations explicites. Le moteur
rejette IDs dupliqués, cardinalités interdites, relations inconnues et cycles.

## Transactions locales

Les écritures JSON utilisent un temporaire unique ouvert en exclusif, `fsync`, renommage atomique et permissions explicites. Les index sont protégés par locks inter-processus avec token de propriétaire ; seul le détenteur peut libérer son lock. Un marker est écrit avant l’index reconstructible ; `doctor` et les scans réparent les caches sans supprimer les données métier.
