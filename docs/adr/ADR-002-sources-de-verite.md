# ADR-002 — Sources de vérité et frontières de stockage

- Statut : accepté
- Date : 2026-08-19

## Contexte

Les markers portables et les index locaux ont des responsabilités différentes. Les confondre rend les scans, réparations et migrations risqués.

## Décision

- `<project>/.arka-norn/project.json` est la source de vérité du Project.
- `<feature>/.arka-norn/feature.json` est la source de vérité de la Feature.
- `<project>/.arka-norn/agents.json` est la source de vérité des identités, scopes, états actifs et remplacements.
- Les documents du pipeline sous la Feature sont des données métier versionnées.
- `~/.arka-norn/index/*.json` est un cache local reconstructible.
- `~/.arka-norn/context/agents.json` sélectionne l’agent courant localement et reste reconstructible.
- Locks, sauvegardes et journaux restent locaux et ne sont jamais des sources métier.
- `.input/` est un espace de travail local ignoré par Git.

## Conséquences

Un index absent ou corrompu se reconstruit depuis les markers valides. Oublier une ressource retire uniquement son entrée d’index. Toute suppression de données métier est une opération distincte et explicitement confirmée.
