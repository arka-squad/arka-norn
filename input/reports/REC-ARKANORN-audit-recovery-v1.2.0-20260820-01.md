# Recette — ARKANORN / audit-recovery v1.2.0

| Champ | Valeur |
|---|---|
| Ref | REC-ARKANORN-audit-recovery-v1.2.0-20260820-01 |
| Date | 2026-08-20 |
| Testeur | `OpenAI-Codex_dev-audit_20260819` |
| Environnement | macOS local, Node.js v22.22.2 |
| Version | `1.2.0` sur branche `codex/audit-recovery-v1.2.0` |
| Statut global | PASS |

## Périmètre

Recette indépendante des corrections F01 à F10 : intégrité des auteurs,
diagnostic de santé, résilience TUI, audit Project v4, qualité CLI,
portabilité du selftest, documentation, build et paquet npm.

## Cas de recette

| ID | Cas | Résultat |
|---|---|---|
| CT-01 | Une Feature marquée avec auteur absent, hors scope ou registre inaccessible est bloquée sans rapport permissif. | PASS |
| CT-02 | Un répertoire sans marker Feature conserve explicitement le mode de compatibilité. | PASS |
| CT-03 | `doctor` échoue lorsque le socle core est incomplet et accepte les seules skills optionnelles absentes. | PASS |
| CT-04 | Le cockpit Feature affiche une erreur asynchrone et permet de réessayer ; les mutations concurrentes sont sérialisées. | PASS |
| CT-05 | La santé TUI se rafraîchit après l'installation des skills. | PASS |
| CT-06 | Le scaffold Project v4 est signé, confiné, autorisé par scope et distinct d'une Feature. | PASS |
| CT-07 | L'audit Project v4 réellement produit valide par `arka-norn validate`. | PASS |
| CT-08 | Le selftest, le test packaging isolé et la suite complète fonctionnent sans `npm_execpath`. | PASS |
| CT-09 | La couverture CLI est réellement collectée et dépasse 70/70/60. | PASS |
| CT-10 | L'aide CLI ne sur-promet pas la validation relationnelle. | PASS |
| CT-11 | Installation locale complète et `skills doctor` : 18/18 skills saines, 8/8 core, aucune divergence. | PASS |
| CT-12 | Build, couverture, benchmark, audit des dépendances et packaging passent dans `release:verify`. | PASS |
| CT-13 | Un index ou marker forgé/symbolique ne peut pas redéfinir le Project, la Feature ou la frontière Pipeline. | PASS |
| CT-14 | Un scaffold refuse les zones réservées et le journal d'audit refuse un symlink, fichier spécial ou hardlink externe avant écriture. | PASS |

## Résultats mesurés

| Mesure | Obtenu | Seuil | Verdict |
|---|---:|---:|---|
| Tests unitaires | 64/64 | 100 % | PASS |
| Tests intégration | 48/48 | 100 % | PASS |
| Tests E2E | 41/41 | 100 % | PASS |
| Selftest production | 55/55 | 100 % | PASS |
| Couverture globale | Seuil contractuel atteint | 70/70/60 | PASS |
| Couverture CLI | Seuil contractuel atteint | 70/70/60 | PASS |
| Benchmark total | Budget respecté | 5 000 ms | PASS |
| Audit runtime npm | 0 vulnérabilité | 0 | PASS |
| Packaging | Tarball contrôlé (357 fichiers) | sans sources/tests | PASS |

## Anomalie trouvée pendant recette

| ID | Description | Résolution | Vérification |
|---|---|---|---|
| ANO-01 | Le benchmark appelait le dashboard sans le résolveur de registre rendu obligatoire par F01. | Le dataset synthétique lui fournit explicitement un registre vide. | `npm run benchmark` et `npm run release:verify` passent. |

## Décision

Recette PASS. Aucun bloquant ouvert pour la version `1.2.0`. Le Project local
est prêt à être commité et poussé selon le contrôle Git Steward.
