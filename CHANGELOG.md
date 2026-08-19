# Changelog

Toutes les modifications notables d’arka-norn sont consignées ici. Le projet
utilise le versionnement sémantique ; les artefacts sont produits à partir des
tags `vX.Y.Z`.

## 1.0.0 — 2026-08-19

- cockpit local Project/Feature disponible en CLI et TUI ;
- pipeline documentaire v2 avec identité, relations, cardinalités et handoffs ;
- persistance durcie : locks avec ownership, écritures atomiques et index réparables ;
- diagnostic unifié des index, markers, locks, journal d’audit et skills ;
- catalogue de 14 skills multiprovider avec installation transactionnelle ;
- gates TypeScript, tests unitaires/intégration/E2E, couverture et packaging isolé.
- loader de tests portable Node 20/22/24 sur Linux, macOS et Windows ; actions CI basées sur Node 24.
