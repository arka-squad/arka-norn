# Changelog

Toutes les modifications notables d’arka-norn sont consignées ici. Le projet
utilise le versionnement sémantique ; les artefacts sont produits à partir des
tags `vX.Y.Z`.

## Unreleased

- marker Project porté en v4 avec le mode persistant `manual|automatic`, tandis que les markers Feature restent en v3 ; les migrations Project v1/v2/v3 choisissent `manual` sans mutation lors d’une lecture ;
- politique d’exécution et registre de missions séparés sous `.arka-norn/`, sans secret, token, PID ni état de processus portable ;
- orchestration Mastra locale contrôlée par Arka Norn : ordres de mission immuables, assistants Claude, Codex, Kimi Platform et Z.AI Coding Plan évalués par politique, permissions deny-by-default, suspension vérifiable et absence de fallback après démarrage ;
- mode `automatic` présenté comme un **Pilote assisté** : pour chaque mission, l’utilisateur choisit explicitement l’assistant et sa version, relit un aperçu borné puis le confirme ; aucune mission suivante n’est enchaînée silencieusement ;
- commandes et cockpit d’orchestration pour armer, consulter, annuler, approuver et relancer une mission sans exposer le worker interne ;
- Codex ACP documenté en annulation/relance contrôlée, sans promesse de reprise générique d’une exécution interrompue ;
- prérequis et CI portés à Node.js 22.13+ (matrices 22/24) ; tests CI avec providers fake et smoke réels opt-in avec identifiants explicitement fournis.
- durcissement post-audit : le worker ne peut pas accéder aux zones de contrôle
  Feature, les preuves sont liées à l’étape, l’Agent et le provider attendus,
  la sélection est historisée et les permissions shell/commandes ne sont plus
  préautorisées par défaut ;
- l'échec avant dispatch devient terminal et audité, le smoke ACP réutilise la
  configuration runtime et l'annulation POSIX termine aussi les descendants du
  worker.
- `skills doctor --profile all --global` contrôle désormais les 19 skills
  locales et globales Claude/Codex avant un point d'entrée, signale les
  entrées `arka-*` non gérées et installe `arka-git-steward` comme discipline
  Git partagée des runs multi-agents.
- les schémas `concept` et `plan` exigent au moins une hypothèse tranchée, un
  concept source et un critère de fin : le scaffold guide déjà ces tableaux
  par des sentinelles, et la validation rejette désormais un document vide sur
  ces champs ; `sections` reste volontairement vide-possible.

## 1.2.0 — 2026-08-20

- les inspections et commandes Pipeline d'une Feature marquée refusent désormais toute vérification d'auteur sans registre Agent valide ;
- les markers et index Project/Feature sont réconciliés avant usage ; les racines forgées, les répertoires de markers symboliques et les chemins de migration symboliques sont refusés ;
- `doctor` traite l'absence d'une skill cœur comme un échec bloquant ;
- les actions asynchrones de la TUI sont capturées et sérialisées pour éviter les erreurs non gérées et les mutations concurrentes ;
- la TUI rafraîchit son diagnostic de santé après installation d'une skill ;
- la gate de release couvre explicitement le code CLI, en complément de la couverture globale ;
- l'audit Project `audit_etat_reel` dispose d'une enveloppe v4 ciblée, avec `project_id` exclusif de `feature_id` et scaffold CLI autorisé strictement ;
- les scaffolds sont journalisés avant mutation, refusent toute zone `.arka-norn` et un audit Project v4 ne peut pas écrire dans une Feature ou un Project enfant ; le journal refuse aussi les symlinks, fichiers spéciaux et hardlinks ;
- `selftest` fonctionne hors npm ;
- l'aide de `validate` distingue validation structurelle et complétude métier.

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
