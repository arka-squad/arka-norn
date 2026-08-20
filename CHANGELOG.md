# Changelog

Toutes les modifications notables d’arka-norn sont consignées ici. Le projet
utilise le versionnement sémantique ; les artefacts sont produits à partir des
tags `vX.Y.Z`.

## Non publié

- README refondu en porte d’entrée produit, guide développeur de référence et manuel utilisateur non technique garantis dans le package ;
- Product principal stable dans la session `main`, conseil de prochaine étape et orchestration des profils spécialisés ;
- sélections Agent v2 isolées par session provider, avec migration transparente du format v1 ;
- commandes `agent sessions|advise|prompt|handoff-prompt`, prompts autonomes `execute|prepare` et reprise après saturation du contexte ;
- skill `arka-product`, profils `product|architecture|audit|dev|qa` et catalogue porté à 18 skills ;
- TUI enrichie avec conseil Product, lancement guidé des rôles et prompt de reprise ;
- workflow `arka-norn-fastdev` catalogué, avec boucle audit/correction et validation du dernier CR ;
- commandes `workflow`, `feature --workflow`, `feature set-workflow` et `fastdev start|status|next` ;
- schémas `cadrage_rework`, `audit_rework`, `validation_fastdev` et fermetures de constats dans `cr_dev` ;
- cockpit TUI FastDev guidé et skill `arka-fastdev`, catalogue alors porté à 17 skills ;
- marqueurs Project/Feature v3 réellement portables, sans chemin machine, avec migration v1/v2 sauvegardée ;
- scans Project/Feature capables de reconnaître directement la racine transmise par les skills ;
- `doctor` vérifie le contexte Project et les références de session jusqu'à l'Agent actif, sans mutation silencieuse de `agent current` ;
- `skills doctor --global` contrôle les installations Claude/Codex et les rendus Claude utilisent la version exacte du catalogue ;
- diagnostics de marqueur et documentation du catalogue corrigés.

## 1.1.0 — 2026-08-19

- registre Agents portable par Project, identités lisibles, scopes, activation et remplacement traçable ;
- documents v3 signés par `author_agent_id`, avec lecture rétrocompatible des documents v2 ;
- commandes Agent et guide CLI, scaffold lié à l’agent courant actif ;
- espace TUI Agents et aide contextuelle `?`, actions recommandées, formulaires expliqués et suites explicites ;
- skills `arka-norn` et `arka-framework-maitrise`, catalogue porté à 16 skills et réparation avec backup depuis la TUI ;
- point d'entrée provider `/arka-norn` pour Claude et `$arka-norn` pour Codex, avec installation globale dans les deux environnements ;
- parcours Concept optionnel via un kit prérempli ChatGPT/Claude.ai, avec garde de confidentialité et réconciliation locale ;
- `doctor` vérifie les registres Agents en plus des index, markers, locks, audit et skills.

## 1.0.0 — 2026-08-19

- cockpit local Project/Feature disponible en CLI et TUI ;
- pipeline documentaire v2 avec identité, relations, cardinalités et handoffs ;
- persistance durcie : locks avec ownership, écritures atomiques et index réparables ;
- diagnostic unifié des index, markers, locks, journal d’audit et skills ;
- catalogue de 14 skills multiprovider avec installation transactionnelle ;
- gates TypeScript, tests unitaires/intégration/E2E, couverture et packaging isolé.
- loader de tests portable Node 20/22/24 sur Linux, macOS et Windows ; actions CI basées sur Node 24.
