# CR-DEV — Norn 2.3 / remplacement de l’orchestration automatique

| Champ | Valeur |
|---|---|
| Ref | `CR-DEV-NORN-orchestration-v2.3.0-20260826-01` |
| Date | 2026-08-26 |
| Branche | `codex/norn-2.3-orchestration` |
| Base | `origin/main@1896e98943572311522e43a38390074444c50a80` |
| Worktree | `/private/tmp/arka-norn-2.3` |
| Version | `2.3.0` |
| Statut | PRÊT POUR RECETTE ET DÉPLOIEMENT CONTRÔLÉ |

## Résultat livré

L’ancien moteur automatique 2.2 est remplacé par une orchestration 2.3 fondée sur un plan de campagne signé, un DAG de tâches, un profil d’exécution explicite par rôle et un worktree Git isolé par tâche. Les agents n’obtiennent ni shell Git ni autorité de commit : ils produisent leurs changements et leurs preuves dans un périmètre borné, puis Norn vérifie et crée le commit si le lancement l’a autorisé.

Le mode manuel reste disponible. Les campagnes automatiques 2.2 ne sont ni reprises ni relancées : les anciennes surfaces de lancement sont refusées et l’état legacy est seulement inspectable, archivable, importable comme profils désactivés et restaurable sur confirmation d’empreinte.

Le travail a été effectué dans un worktree propre créé depuis la base demandée. Les working trees Norn et Cortex Deck préexistants, leurs index, fichiers non suivis et worktrees tiers n’ont pas été modifiés.

## Contrats publics 2.3

| Domaine | Livraison |
|---|---|
| Profils | `ExecutionProfile` sépare transport, gateway, provider, modèle, référence de credential, capacités, réseau et coût. OpenCodex est pris en charge avec catalogue contrôlé et HOME privé minimal. |
| Planification | `TaskPlan`, `CampaignPlan`, `RunAuthorization` et `TaskAttempt` figent snapshot, DAG, scopes, preuves, profils, budget, parallélisme, commit et politique d’application. |
| États | Tentatives `prepared`, `running`, `succeeded`, `failed`, `blocked`, `budget_stopped`, `cancelled`; journal immuable par révision et projection reconstructible. |
| Configuration | Schéma Project d’orchestration `4`; les états antérieurs sont réservés à l’inspection et à l’import explicite. |
| CLI | `orchestration profile register|show|doctor`, `preview`, `start`, `status`, `apply`, `recovery inspect|quarantine|restore|import-legacy`. |
| Interface Web | Vue humaine des campagnes : DAG, tâches, dépendances, scopes, profils, preuves, risque et raison durable du gate d’application. Aucun JSON brut n’est imposé dans la vue principale. |

## Isolation, exécution et intégration

- Le snapshot privé utilise un index Git temporaire et n’altère ni la branche, ni l’index, ni le working tree utilisateur.
- Seuls les fichiers suivis, les modifications locales autorisées et les fichiers non suivis explicitement déclarés entrent dans le snapshot.
- Git est invoqué avec arguments structurés, configuration globale neutralisée, hooks désactivés et contrôles contre filtres externes, symlinks, submodules et métadonnées Git.
- Les branches et worktrees de tâche résident sous `$ARKA_NORN_HOME/worktrees/<campaign>/<task>`.
- Le scheduler exécute réellement jusqu’à trois tâches prêtes à scopes disjoints par défaut. Les chevauchements non ordonnés sont refusés.
- Les tests/builds délégués passent par des recettes Docker/Podman épinglées et sans réseau ; aucun fallback hôte silencieux n’est autorisé.
- Les commits Norn portent les trailers de campagne, tâche, rôle, profil, exécution et empreinte des preuves.
- L’intégration suit l’ordre du DAG. Un conflit crée une tentative d’intégration dédiée ; son échec produit un candidat prioritaire déterministe, inventorie les commits, chemins et hunks écartés, puis impose une décision humaine.

## Préflight, coût et sécurité

Le préflight reproduit l’environnement du futur worker : HOME, PATH, worktree, scopes, gateway, provider, modèle, credential, egress et commande réelle. Les diagnostics conservent le code de sortie et un extrait borné et expurgé de `stderr`. Les causes structurées couvrent notamment l’absence de profil gateway, de modèle, de credential, de dépendance runtime et le dépassement des limites workspace.

Les références de credential sont résolues depuis une variable autorisée ou le trousseau ; aucune valeur secrète n’est persistée. Un changement de profil, provider, modèle, budget ou scope invalide l’empreinte et exige une nouvelle autorisation.

Les modes budgétaires `admission`, `hard-stop` et `observe` sont implémentés. La mesure indisponible reste explicitement inconnue. Le mode sans plafond exige une allowlist de profils, une politique explicite et une confirmation humaine.

Le score de risque applique les facteurs prévus, bornés par les interdictions globales. Secret, sortie de scope, symlink, submodule, métadonnée Git, preuve manquante et opération non déclarée ne sont jamais contournables. L’analyse modèle peut seulement augmenter le score. Le seuil maximal d’auto-application reste `20`.

L’application automatique est impossible si le run ne l’autorise pas, si le snapshot était sale, si le dépôt a divergé, si une validation manque, si le risque dépasse le seuil, si un interdit ou un fallback prioritaire existe, ou si l’avance n’est pas un fast-forward. La raison est stockée dans un `applicationGate` signé avec le résultat de campagne.

## Récupération et état legacy

- `recovery inspect` produit un manifeste à empreinte des campagnes, identités, worktrees, fichiers et artefacts connus sans mutation.
- `quarantine` archive l’état 2.2 en lecture seule après confirmation de l’empreinte ; aucun emplacement seul ne justifie un déplacement ou une suppression.
- `restore` vérifie l’empreinte et exige que la destination soit libre, notamment pour `.gitnexus/lbug`.
- `import-legacy` crée uniquement des profils 2.3 désactivés, sans credential résolu ni reprise de campagne.
- Les identités strictement identiques peuvent être rapprochées ; les ambiguïtés et divergences de scope sont suspendues.
- Les journaux d’événements et tentatives sont autoritaires. Une projection d’index obsolète est reconstruite ; une séquence non contiguë ou un artefact altéré est refusé.
- Un arrêt brutal conserve branches, worktrees et preuves pour inspection. Aucun nettoyage legacy automatique n’est réintroduit.

## Fichiers principaux

- Domaine : `src/domain/orchestration/execution-profile.ts`, `orchestration-plan.ts`, `orchestration-event.ts`, `orchestration-budget.ts`, `orchestration-risk.ts`, `orchestration-configuration.ts`.
- Runtime : `src/composition/orchestration-v23-plan-builder.ts`, `src/composition/orchestration-v23-runtime.ts`.
- Git et workers : `src/adapters/outbound/execution/git-workspace-adapter.ts`, `execution-profile-runtime-adapter.ts`, `mastra-task-worker-adapter.ts`.
- Persistance et reprise : `src/adapters/outbound/filesystem/fs-orchestration-configuration-store.ts`, `fs-orchestration-campaign-v23-store.ts`, `fs-orchestration-event-store.ts`, `fs-orchestration-recovery.ts`.
- CLI : `src/adapters/inbound/cli/orchestration-v23-actions.ts`, `orchestration-cli.ts`.
- Interface : `src/application/web/project-tracking-service.ts`, `web/src/views/live-view.tsx`, `web/src/styles/views.css`.
- Contrat JSON : `schemas/orchestration-configuration.schema.json`.
- Déploiement : `docs/release-2.3.md`.
- Les artefacts versionnés `dist/`, catalogues et locales ont été régénérés.

## Preuves de vérification

| Gate | Résultat |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS — zéro avertissement |
| `npm run check:max-lines` | PASS — plafond 700 lignes |
| `npm run check:language` | PASS |
| `npm run check:js-syntax` | PASS — 35 fichiers JavaScript vérifiés |
| `npm run build` | PASS — 2 240 modules Web transformés et `dist/` régénéré |
| Suite ciblée orchestration 2.3 | PASS — 33/33 |
| `npm test` | PASS — 304/304 |
| `npm run test:web` | PASS — 22/22 |
| `npm run test:web:e2e` | PASS — 2/2 |
| Selftest de release | PASS — 57/57 |
| Couverture globale | PASS — tous les seuils lignes, branches et fonctions |
| Couverture CLI | PASS — 78,65 % lignes, 63,19 % branches, 71,25 % fonctions |
| Benchmark | PASS — 318,02 ms pour un budget de 5 000 ms |
| Audit dépendances | PASS — aucune vulnérabilité non exemptée ; allowlist documentée pour deux avis transitifs faibles |
| Packaging | PASS — `arka-norn@2.3.0`, 727 fichiers, 2,0 MB compressé, shasum `40c6d27a8b10362b050232eba0f1788de447468b` |
| `npm run release:verify` final | PASS — code de sortie 0 |
| `git diff --check` | PASS |

Les scénarios couvrent notamment : dépôt propre/sale, non suivis acceptés/refusés, cache GitNexus, worktree tiers, trois tâches réellement parallèles, collisions de scope, intégrateur et fallback, OpenCodex avec `zai/glm-5.2`, wrapper npm dont `node` est hors du répertoire CLI, secrets, symlinks, submodules, hooks, filtres externes, diagnostics expurgés, budgets, refus d’application, import legacy, corruption d’artefact et reprise après crash.

La première matrice distante a en outre révélé des hypothèses POSIX que les contrôles locaux ne montraient pas. Le candidat corrige désormais la résolution de Git sous Windows sans réintroduire la configuration globale, utilise des répertoires privés portables pour les hooks et la configuration Git, résout les shims npm Windows vers leur entrée Node bornée sans `shell`, exécute les wrappers JavaScript via `process.execPath`, et transporte les répertoires temporaires et variables système minimales dans le HOME isolé. Les assertions de chemins et de modes de fichier distinguent les séparateurs et le modèle ACL Windows. La suite locale post-correction est de nouveau PASS — 304/304.

## Frontière de livraison et déploiement

Le moteur, ses contrats, sa CLI, son interface, ses tests et le runbook de release sont livrés. La branche et son premier commit candidat ont été poussés et la PR de livraison a été ouverte. Les opérations suivantes restent volontairement non exécutées tant que la matrice distante corrigée n’est pas verte : quarantaine de l’état réel de l’utilisateur, campagne réelle multi-provider, campagne documentaire Cortex Deck, activation d’un Project, fusion sur `main`, tag `v2.3.0` et publication npm.

Ces opérations nécessitent les validations humaines et l’ordre de déploiement du runbook : preview hostile, dépôt témoin mono-tâche, DAG synthétique multi-provider, copie propre de Cortex Deck, activation Project par Project, puis publication après une nouvelle exécution de `release:verify` sur le commit candidat.

## Handoff

Le lot est prêt pour une recette indépendante sur la branche isolée. Le reviewer doit commencer par `docs/release-2.3.md`, contrôler le manifeste produit par `orchestration recovery inspect`, puis suivre les six étapes de déploiement sans reprendre une campagne 2.2. Le worktree `/private/tmp/arka-norn-2.3` et toutes ses preuves doivent être conservés jusqu’à décision explicite de commit, fusion ou abandon.
