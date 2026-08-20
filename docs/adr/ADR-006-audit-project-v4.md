# ADR-006 — Audit Project v4 ciblé

- Statut : accepté
- Date : 2026-08-20

## Contexte

Un audit d'état réel peut porter sur un Project entier, sans Feature associée.
L'enveloppe documentaire v2/v3 est centrée sur `feature_id` et ne pouvait donc
pas représenter ce périmètre sans déclarer une Feature artificielle.

## Décision

- Seul le document `audit_etat_reel` admet une enveloppe Project v4.
- Cette enveloppe exige `schema_version: 4`, `project_id` et
  `author_agent_id` ; `feature_id` y est interdit. Les deux périmètres sont
  exclusifs.
- Les autres documents restent sur l'enveloppe Feature v2/v3 ; aucune migration
  générale de leur format n'est introduite.
- Le scaffold Project est explicite :
  `arka-norn scaffold audit_etat_reel <output.json> --project <id> --agent <id>`.
  La CLI vérifie le Project, l'Agent actif, son scope de chemin et que la sortie
  reste sous la racine du Project avant toute écriture. Elle refuse les zones
  réservées `.arka-norn`, une Feature et un Project enfant, puis écrit les
  événements d'intention et de résultat dans le journal d'audit.

## Conséquences

Les lecteurs existants de Pipeline Feature restent rétrocompatibles v2/v3.
L'audit Project est traçable par un identifiant Project et un auteur validé,
sans élargir silencieusement les droits de scaffold. Les tests et la release
vérifient séparément la couverture du code CLI afin de préserver ce contrat.
