# CR-DEV — ARKANORN D1 — Contrats de capacités Web

## Résultat

Le registre partagé expose les 15 capacités publiques attendues avec leurs autorités, préconditions, surfaces et invalidations. Le TUI consomme ce registre et l'API Web publie son contrat sans annoncer les mutations D2–E3 qui ne sont pas encore livrées.

Les mutations Web existantes valident désormais le type de contenu, la taille et les champs de premier niveau. Les invalidations SSE sont émises après persistance et une connexion interrompue ne peut pas faire échouer la réponse métier. Les jetons de concurrence optimiste sont disponibles pour les prochains lots.

## Fichiers structurants

- `src/application/capabilities/capability-registry.ts`
- `src/application/web/web-mutation-concurrency.ts`
- `src/adapters/inbound/web/api-router.ts`
- `src/adapters/inbound/web/sse-hub.ts`
- `src/adapters/inbound/tui/views/project-detail-view.ts`
- `web/src/bridge/http-bridge.ts`
- `web/src/generated/contracts.ts`

## Vérifications

- `npm run typecheck` : PASS
- ESLint ciblé : PASS
- `npm run check:max-lines` : PASS
- `npm run build` : PASS
- contrats et projections ciblés : 3/3 PASS
- `npm run test:web -- --reporter=dot` : 9 fichiers, 21/21 PASS
- `npm run test:web:e2e` : 3/3 PASS
- `git diff --check` : PASS

## Portée et suite

Ce lot livre le socle de capacités et de mutation, pas les écrans ni commandes absents. D2 doit brancher le changement de mode réel, D3 la gestion des Agents, D4 Doctor, puis E1–E3 l'orchestration.
