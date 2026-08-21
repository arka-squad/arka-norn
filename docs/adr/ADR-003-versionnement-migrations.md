# ADR-003 — Versionnement et migrations

- Statut : accepté
- Date : 2026-08-20

## Contexte

Les markers v1 utilisent `version`, n’enregistrent pas les relations et n’offrent ni prévisualisation ni sauvegarde formalisée.

## Décision

- Tous les nouveaux formats utilisent `schemaVersion`, entier strictement positif.
- La version courante du marker Project est `4` et porte `orchestrationMode: manual | automatic`.
- La version courante du marker Feature reste `3`.
- Les markers v3/v4 omettent `root` : leur racine runtime est dérivée de leur emplacement canonique afin de rester portable entre machines.
- La version courante des documents de Feature est `3`; le validateur conserve la lecture v2.
- `audit_etat_reel` accepte une enveloppe Project `4` dédiée, avec `project_id` et sans `feature_id`; elle ne s’applique à aucun autre type de document.
- La version du registre Agents est `1`, indépendante des markers.
- La politique d’orchestration et le registre d’exécutions sont chacun en version `1`, séparés du marker Project ; ils n’emportent ni secret ni état de processus.
- Une migration est une suite ordonnée, déterministe et idempotente.
- `dry-run` est la valeur par défaut et ne modifie aucun octet.
- L’application crée une sauvegarde adjacente avant remplacement atomique.
- Un format futur ou inconnu provoque une erreur explicite ; aucun downgrade implicite.
- Une Feature v1 sans propriétaire ne peut migrer sans `projectId` fourni et validé.
- Les Projects v1/v2/v3 migrent vers v4 en supprimant le chemin machine et en choisissant `manual` par défaut ; une lecture ne matérialise jamais cette migration.
- Les Features v1/v2 migrent vers v3 en supprimant le chemin machine ; une v3 valide est idempotente.

## Conséquences

Les fixtures couvrent v1, v2, v3, Project v4, l’audit Project v4 et version
future. La CLI expose le plan de migration en dry-run et ne l'applique qu'avec
`--apply`, après sauvegarde adjacente de la version source. Le marker Project
v4 est une extension ciblée : les lecteurs de Pipeline Feature continuent à
consommer v2/v3. Les migrations ne confondent pas les données portables du
Project avec les PID, sessions ou autres détails privés du worker.
