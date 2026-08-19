# ADR-005 — Registre Agents et identité documentaire

- Statut : accepté
- Date : 2026-08-19

## Contexte

Les noms d’agent n’étaient présents que dans quelques documents spécialisés. Un agent arrivant sur un Project devait deviner son identité, son périmètre et la manière de signer une production. Réutiliser un même nom après remplacement détruirait la traçabilité.

## Décision

- Chaque Project porte `.arka-norn/agents.json`, registre portable versionné séparément des markers Project/Feature.
- L’identifiant suit `Provider_role_YYYYMMDD[_NN]`.
- Le champ booléen `active` interdit toute nouvelle production après désactivation.
- Un remplacement est atomique et conserve les relations bidirectionnelles ancien/nouveau.
- La sélection courante est un contexte local reconstructible, pas une source métier.
- Les documents v3 exigent `author_agent_id`; les documents v2 restent lisibles.
- La CLI et la TUI refusent le scaffold géré sans agent courant actif.

## Conséquences

Les marqueurs v2 restent stables. L’historique des auteurs ne change jamais lors d’un remplacement. Le registre et la session utilisent écritures atomiques, locks, validation stricte et permissions adaptées à leur portabilité.
