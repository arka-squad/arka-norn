# CR Dev — ARKANORN / fastdev_pipeline

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-fastdev_pipeline-20260820-01 |
| Date | 2026-08-20 |
| Agent | `OpenAI-Codex_dev-audit_20260819` |
| Demande source | Plan utilisateur « Pipeline FastDev pour les reworks » |
| Statut | LIVRÉ |

## Résultat livré

Le pipeline `arka-norn-fastdev` est disponible à côté du pipeline standard inchangé. Il pilote le cycle `cadrage_rework → cr_dev → audit_rework → [cr_dev correctif] → validation_fastdev`, choisit la prochaine action à partir des documents réels et refuse les transitions obsolètes ou incomplètes.

Les interfaces CLI, TUI et Agent consomment le même catalogue sécurisé et le même rapport métier. La skill globale `arka-fastdev` exécute une seule action calculée, puis valide son livrable.

## Exigences couvertes

| Domaine | Livraison |
|---|---|
| Moteur | Catalogue explicite standard/FastDev, résolution sans chemin arbitraire, politiques `delivery`, `audit_then_fix` et `review_latest` |
| Documents | Schémas v3 `cadrage_rework`, `audit_rework`, `validation_fastdev` et extension corrective de `cr_dev` |
| Sécurité | Pipeline inconnu refusé ; auteur v3 contrôlé contre le registre et le périmètre de la Feature ; historique inactif conservé |
| CLI | Commandes `workflow`, sélection immuable de workflow et parcours `fastdev start/status/next` humain ou JSON |
| Agent | Skill `arka-fastdev`, routage depuis `/arka-norn` et `arka-framework-maitrise`, catalogue porté à 17 skills |
| TUI | Créations séparées, confirmation FastDev, badge/phase/progression, action guidée et cockpit des itérations/corrections |
| Compatibilité | Dossiers historiques sans marqueur maintenus sur le pipeline standard avec avertissement |

## Preuves de vérification

| Gate | Résultat |
|---|---|
| TypeScript + ESLint | PASS — 0 erreur, 0 avertissement |
| Tests unitaires | PASS — 47/47 |
| Tests intégration | PASS — 36/36 |
| Tests E2E | PASS — 26/26 |
| Couverture | PASS — lignes 71,58 %, fonctions 75,49 %, branches 75,76 % |
| Selftest production | PASS — 54/54 |
| Benchmark | PASS — 149,34 ms total pour un budget de 5 000 ms |
| Audit dépendances | PASS — 0 vulnérabilité |
| Packaging npm | PASS — 333 fichiers, pipeline/catalogue/schémas/skill FastDev inclus |
| Doctor | PASS — 11 PASS, 0 WARN, 0 FAIL ; pipelines 2/2 ; skills 17/17 |
| Installation skills | PASS — locale et globale, profils `core`, `delivery` et `all` cohérents |
| Diff | PASS — `git diff --check` sans anomalie |

## Compatibilité et risques résiduels

- Le pipeline standard conserve ses dix étapes et ses commandes historiques.
- `set-workflow` devient volontairement impossible après le premier document Pipeline reconnu.
- Le doctor nécessite l’accès à son journal global ; en bac à sable, ce contrôle peut échouer avec `EPERM` sans indiquer une corruption.
- Le cache npm utilisateur présent sur cette machine possède des droits historiques incorrects ; le contrôle du paquet a été exécuté avec un cache temporaire isolé, sans modifier ce cache.

## État Git

Le fichier `.arka-norn/project.json`, modifié avant cette livraison, reste explicitement hors scope et ne doit pas entrer dans les commits FastDev.

## Handoff

La livraison est prête pour commit et push sur `main`. Aucune correction connue ne reste ouverte.
