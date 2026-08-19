# Cockpit TUI

La commande `arka-norn` ouvre un cockpit interactif uniquement dans un TTY.

- Accueil : portfolio Projects, action recommandée, démarrage guidé, scan, création/import, écran de santé détaillé et installation/réparation des 15 skills.
- Project : Features regroupées par état Pipeline, registre Agents, identité courante, périmètres et remplacements, compteurs de dettes, anomalies QA, handoffs et documents invalides.
- Feature : identité auteur, état métier, progression, prochaine action expliquée, timeline des dix étapes, runs dev/QA, échecs, dettes et handoffs.
- Actions : statut, scaffold confiné à la Feature, validation et confirmations de retrait.

Chaque écran principal expose l’action recommandée et `?` ouvre une aide contextuelle qui explique le but, les prérequis, les étapes et les raccourcis. Flèches naviguent, Entrée sélectionne, `/` filtre et Échap revient. Les formulaires donnent un exemple, la portée de l’écriture et la manière d’annuler. Les résultats indiquent toujours une suite.

Le parcours nominal est : `Project → Agent actif → Feature → statut Pipeline → scaffold signé → validation`. Une tentative de scaffold sans agent courant affiche le chemin de résolution au lieu de laisser l’utilisateur deviner.

La TUI appelle directement les mêmes cas d’usage que la CLI ; aucun sous-processus CLI ne bloque la boucle de rendu. Les contrôleurs Project, Feature, pipeline, santé et skills sont séparés du container. Les actions asynchrones sont sérialisées ; un test clavier pilote le parcours complet Home → Project → Feature → scaffold réel. Les mutations sensibles demandent une confirmation et `forget` ne retire que l’entrée d’index.
