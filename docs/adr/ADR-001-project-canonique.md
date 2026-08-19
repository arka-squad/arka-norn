# ADR-001 — Project est le terme canonique

- Statut : accepté
- Date : 2026-08-19

## Contexte

Le code utilise `Depot` pour la racine suivie alors que le produit, les références d’architecture et l’objectif utilisateur parlent de projet. La Feature n’enregistre pas son propriétaire et la relation repose sur un préfixe de chemin.

## Décision

`Project` désigne exclusivement une racine suivie. `Feature` appartient à un Project par `projectId` et doit rester dans sa racine canonique. Les nouveaux markers sont `project.json` et `feature.json`. `depot` et `depot.json` ne sont acceptés qu’en entrée de migration ; aucune nouvelle écriture ne les produit.

## Conséquences

- Le domaine, les use-cases, la CLI, la TUI et la documentation exposent `Project`.
- Les formats v2 rendent `projectId` obligatoire sur une Feature.
- La migration d’une Feature v1 exige le Project propriétaire pour éviter une association implicite erronée.
