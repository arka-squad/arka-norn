# Référentiel des domaines d’audit

Ce référentiel décrit ce que chaque module peut établir. La skill ne charge que les sections sélectionnées. M00 est toujours exécuté et reste invisible dans le questionnaire utilisateur.

## M00 — Cadrage et provenance

- Observe : Project, Feature éventuelle, scope, commit, état Git, fingerprint du workspace, sandbox, outils et sources autorisées.
- Profondeurs : inventaire.
- Produit : manifeste de périmètre et limites initiales.
- Ne conclut pas : qualité, conformité ou absence de risque.

## M01 — Dépôt et historique Git

- Observe : intégrité, commit, historique, activité, churn et concentration des contributions via commandes Git durcies.
- Profondeurs : inventaire, statique.
- Permissions : lecture locale.
- Ne conclut pas : identité réelle ou pérennité d'une personne depuis son seul nom Git.

## M02 — Code et tests

- Observe : langages, volumes, organisation, tests et couvertures existantes.
- Collecteurs : inventaire local; runners Node, Python, Go, Rust, Maven ou Gradle uniquement en sandbox dynamique.
- Permissions : lecture locale; exécution du dépôt confirmée pour le dynamique.
- Ne conclut pas : correction fonctionnelle depuis la seule présence de tests.

## M03 — Architecture

- Observe : composants, frontières, flux, cycles, état partagé et points uniques de défaillance.
- Profondeurs : statique; dynamique pour des probes explicitement prévues.
- Produit : carte et diagrammes Mermaid, chaque élément marqué observé ou inféré.
- Ne conclut pas : intention architecturale non documentée.

## M04 — Stack et dépendances

- Observe : manifests, lockfiles, runtimes, frameworks, dépendances et SBOM.
- Collecteurs : inventaire; Syft en conteneur officiel épinglé.
- Profondeurs : inventaire, statique, connectée.
- Ne conclut pas : exploitabilité d'une vulnérabilité depuis sa seule présence dans un SBOM.

## M05 — Sécurité

- Observe : secrets exposés, vulnérabilités, mauvaises configurations, posture du dépôt et résultats GitHub disponibles.
- Collecteurs : Gitleaks, Trivy, Grype, Scorecard et APIs GitHub; ZAP baseline uniquement sur cible autorisée.
- Permissions : images confirmées; réseau et credentials read-only explicitement autorisés.
- Ne conclut pas : sécurité globale lorsqu'un scanner manque, échoue ou ne couvre qu'une partie.

## M06 — CI/CD et publication

- Observe : workflows locaux, permissions, provenance, statuts, runs et releases GitHub.
- Profondeurs : statique, connectée.
- Permissions : GitHub read-only pour les données distantes.
- Ne conclut pas : succès futur depuis le seul dernier run vert.

## M07 — Observabilité

- Observe : logs, métriques, traces, alertes, runbooks et SLO détectables.
- Sources : dépôt, imports structurés et URLs explicitement autorisées.
- Profondeurs : inventaire, statique, connectée.
- Ne conclut pas : qualité opérationnelle sans données de production suffisantes.

## M08 — Conformité et licences

- Observe : licences, notices, composants, indices de données personnelles et applicabilité déclarée.
- Collecteurs : inventaire local, SBOM et imports structurés.
- Profondeurs : inventaire, statique, connectée.
- Ne conclut pas : avis juridique ou conformité réglementaire définitive.

## M09 — Produit, concept et UX

- Observe : README, documentation, Features, issues, releases, npm et sources produit fournies; cible, valeur, parcours et hypothèses.
- Collecteurs : lecture structurée; Lighthouse et axe uniquement en sandbox dynamique sur cible autorisée.
- Profondeurs : inventaire, statique, connectée, dynamique.
- Ne conclut pas : validation marché sans recherche utilisateur ou données appropriées.

## M10 — Opérations, infrastructure et coûts

- Observe : IaC, environnements, capacité, déploiement et données de coûts disponibles.
- Collecteurs : inventaire; Terraform validate/plan en sandbox, jamais apply ou destroy; données cloud par import.
- Profondeurs : inventaire, statique, connectée, dynamique.
- Ne conclut pas : coût réel sans données de consommation et hypothèses explicites.

## M11 — Risques business et pérennité

- Observe : corrélations des autres domaines et contexte fourni sur continuité, dépendances, supportabilité, propriété intellectuelle et décisions.
- Profondeurs : inventaire à connectée selon les sources des modules amont.
- Produit : risques et décisions, sans score global.
- Ne conclut pas : valeur business, probabilité ou impact financier inventés.
