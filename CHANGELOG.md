# Changelog

Toutes les modifications notables d’arka-norn sont consignées ici. Le projet
utilise le versionnement sémantique ; les artefacts sont produits à partir des
tags `vX.Y.Z`.

## 1.1.0 — 2026-08-19

- registre Agents portable par Project, identités lisibles, scopes, activation et remplacement traçable ;
- documents v3 signés par `author_agent_id`, avec lecture rétrocompatible des documents v2 ;
- commandes Agent et guide CLI, scaffold lié à l’agent courant actif ;
- espace TUI Agents et aide contextuelle `?`, actions recommandées, formulaires expliqués et suites explicites ;
- skill `arka-framework-maitrise`, catalogue porté à 15 skills et réparation avec backup depuis la TUI ;
- `doctor` vérifie les registres Agents en plus des index, markers, locks, audit et skills.

## 1.0.0 — 2026-08-19

- cockpit local Project/Feature disponible en CLI et TUI ;
- pipeline documentaire v2 avec identité, relations, cardinalités et handoffs ;
- persistance durcie : locks avec ownership, écritures atomiques et index réparables ;
- diagnostic unifié des index, markers, locks, journal d’audit et skills ;
- catalogue de 14 skills multiprovider avec installation transactionnelle ;
- gates TypeScript, tests unitaires/intégration/E2E, couverture et packaging isolé.
- loader de tests portable Node 20/22/24 sur Linux, macOS et Windows ; actions CI basées sur Node 24.
