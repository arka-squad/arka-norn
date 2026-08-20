# ADR-003 — Versionnement et migrations

- Statut : accepté
- Date : 2026-08-20

## Contexte

Les markers v1 utilisent `version`, n’enregistrent pas les relations et n’offrent ni prévisualisation ni sauvegarde formalisée.

## Décision

- Tous les nouveaux formats utilisent `schemaVersion`, entier strictement positif.
- La version courante des markers Project et Feature est `3`.
- Les markers v3 omettent `root` : leur racine runtime est dérivée de leur emplacement canonique afin de rester portable entre machines.
- La version courante des nouveaux documents produit est `3`; le validateur conserve la lecture v2.
- La version du registre Agents est `1`, indépendante des markers.
- Une migration est une suite ordonnée, déterministe et idempotente.
- `dry-run` est la valeur par défaut et ne modifie aucun octet.
- L’application crée une sauvegarde adjacente avant remplacement atomique.
- Un format futur ou inconnu provoque une erreur explicite ; aucun downgrade implicite.
- Une Feature v1 sans propriétaire ne peut migrer sans `projectId` fourni et validé.
- Les v1/v2 migrent vers v3 en supprimant le chemin machine ; une v3 valide est idempotente.

## Conséquences

Les fixtures couvrent v1, v2, v3 et version future. La CLI expose le plan de migration en dry-run et ne l'applique qu'avec `--apply`, après sauvegarde adjacente de la version source.
