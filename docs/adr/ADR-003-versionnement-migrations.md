# ADR-003 — Versionnement et migrations

- Statut : accepté
- Date : 2026-08-19

## Contexte

Les markers v1 utilisent `version`, n’enregistrent pas les relations et n’offrent ni prévisualisation ni sauvegarde formalisée.

## Décision

- Tous les nouveaux formats utilisent `schemaVersion`, entier strictement positif.
- La version courante des markers Project et Feature est `2`.
- Une migration est une suite ordonnée, déterministe et idempotente.
- `dry-run` est la valeur par défaut et ne modifie aucun octet.
- L’application crée une sauvegarde adjacente avant remplacement atomique.
- Un format futur ou inconnu provoque une erreur explicite ; aucun downgrade implicite.
- Une Feature v1 sans propriétaire ne peut migrer sans `projectId` fourni et validé.

## Conséquences

Les fixtures couvrent v1, v2 et version future. La CLI exposera ultérieurement le plan de migration puis une application explicite.
