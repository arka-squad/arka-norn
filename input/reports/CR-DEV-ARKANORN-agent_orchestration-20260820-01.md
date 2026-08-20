# CR Dev — ARKANORN / agent_orchestration

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-agent_orchestration-20260820-01 |
| Date | 2026-08-20 |
| Agent | `OpenAI-Codex_dev-audit_20260819` |
| Demande source | Organisation Product, Agents parallèles, reprise de contexte et sessions provider isolées |
| Statut | LIVRÉ |

## Résultat livré

Le premier Agent d’un Project devient le Product principal stable de la session `main`. Il calcule la prochaine responsabilité à partir du vrai Pipeline, conseille les rôles à lancer, distingue exécution bornée et préparation en lecture seule, puis génère un prompt autonome pour chaque nouvelle session provider. Une commande de reprise conserve son identité et recharge l’état réel avant saturation du contexte.

Chaque rôle spécialisé possède sa propre sélection Agent, son profil de skills, son provider, son périmètre Feature/chemins et son droit d’écriture. FastDev propage désormais la session jusque dans la commande de scaffold afin que les documents soient signés par le rôle responsable et jamais par le Product `main` par défaut.

## Exigences couvertes

| Domaine | Livraison |
|---|---|
| Product principal | Session `main` réservée, rôle Product obligatoire pour les nouvelles liaisons, conseil Project/Feature et reprise sans nouvelle identité |
| Sessions parallèles | Registre privé v2 `selectedBySession`, migration v1, variable `ARKA_NORN_SESSION`, commandes `current/use/scaffold --session` |
| Orchestration | Politiques de rôle par étape, modes `execute`/`prepare`, prompts autonomes, réutilisation exacte d’un Agent compatible |
| Sécurité | Session incompatible refusée, provider obligatoire à la création, scope Feature et chemin relatif, préparation strictement non mutante |
| FastDev | `fastdev next --session`, session obligatoire dans `$arka-fastdev`, contrôle de `author_agent_id` et refus d’une signature Product accidentelle |
| Skills | Nouvelle skill `$arka-product`, catalogue à 18 skills, profils Product/architecture/audit/dev/QA, préflight installé avant ouverture provider |
| CLI | `agent sessions`, `advise`, `prompt`, `handoff-prompt`/`resume-prompt`, sorties humaines et JSON additives |
| TUI | Conseil Product, organisation par Feature, saisie du provider, préflight visible et prompt de reprise guidé |
| Santé | Doctor tolérant les skills optionnelles absentes, mais bloquant toute divergence ; catalogue Pipeline contrôlé |

## Décisions techniques

- `/arka-norn` reste réservé au démarrage d’un Project et au Product principal ; un rôle spécialisé démarre avec `$arka-framework-maitrise`, puis sa skill métier.
- Le Product exécute le préflight d’installation avant d’ouvrir la session provider. Un Agent ne peut donc pas recevoir l’instruction d’appeler une skill encore absente.
- Une session déjà liée n’est réutilisée que si l’Agent est actif et si rôle, Project et Feature correspondent. Sinon la génération du prompt échoue explicitement.
- La sélection privée v1 reste lisible comme `main` et migre à la prochaine mutation ; les documents historiques des Agents remplacés restent valides.
- Les recommandations parallèles ne valent pas autorisation : `prepare` interdit toute modification de fichier et tout document Pipeline.

## Preuves de vérification

| Gate | Résultat |
|---|---|
| Test à blanc de la skill Product | PASS après correction de 6 constats : session FastDev, bootstrap spécialisé, préflight, provider/identité, scope chemin et reprise depuis la racine |
| TypeScript + ESLint + build | PASS — 0 erreur, 0 avertissement |
| Tests unitaires | PASS — 53/53 |
| Tests intégration | PASS — 40/40 |
| Tests E2E | PASS — 28/28 |
| Selftest production | PASS — 55/55 |
| Couverture | PASS — seuils globaux lignes/branches/fonctions respectés |
| Benchmark | PASS — sous le budget de 5 000 ms |
| Audit dépendances | PASS — 0 vulnérabilité |
| Packaging npm | PASS — tarball installable par un consumer vierge |
| Doctor | PASS — 11 PASS, 0 WARN, 0 FAIL |
| Installation skills | PASS — 18/18 locales et globales saines |
| Diff | PASS — `git diff --check` sans anomalie |

## Commits et état Git

- Lot principal poussé sur `main` : `dfbef16 feat: orchestrate Product and isolated agent sessions`.
- Le présent durcissement de passation est destiné à un second commit atomique sur `main`.
- La modification préexistante de `.arka-norn/project.json` reste hors scope et n’est pas stagée.

## Handoff

Le Product peut désormais lancer `arka-norn agent advise`, exécuter le préflight affiché, puis transmettre le prompt spécialisé dans une nouvelle session provider. Avant une nouvelle conversation principale, `arka-norn agent handoff-prompt` produit la procédure de reprise avec racine, Agent Product, sessions observées et prochaine responsabilité vérifiée.
