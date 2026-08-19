# Cockpit TUI

La commande `arka-norn` ouvre un cockpit interactif uniquement dans un TTY.

- Accueil : portfolio Projects, activité, scan, création/import et santé des 14 skills.
- Project : Features regroupées par état Pipeline, compteurs de dettes, anomalies QA, handoffs et documents invalides, création/import, scan et retrait sûr de l’index.
- Feature : état métier, progression, prochaine action, timeline des dix étapes, runs dev/QA, échecs, dettes et handoffs.
- Actions : statut, scaffold confiné à la Feature, validation et confirmations de retrait.

Flèches naviguent, Entrée sélectionne, `/` filtre et Échap revient. Les listes et rapports longs utilisent un viewport ; les rapports se parcourent avec `↑`/`↓`. Sous 60 colonnes, un écran explicite demande d’agrandir le terminal. Un redimensionnement déclenche automatiquement un nouveau rendu et la hauteur de frame est bornée aux lignes disponibles.

La TUI appelle directement les mêmes cas d’usage que la CLI ; aucun sous-processus CLI ne bloque la boucle de rendu. Les mutations sensibles demandent une confirmation et `forget` ne retire que l’entrée d’index.
