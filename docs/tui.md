# Cockpit TUI

La commande `arka-norn` ouvre un cockpit interactif uniquement dans un TTY.

Pour un parcours accompagné sans prérequis technique, commencez par le [manuel utilisateur](manuel-utilisateur.md).

- Accueil : portfolio Projects, action recommandée, démarrage guidé, scan, création/import, écran de santé détaillé et installation/réparation des 19 skills.
- Project : conseil du Product principal, choix de niveau de délégation manuel/Pilote assisté, entrées séparées pour rework FastDev, Feature standard et import, puis registre Agents et métriques.
- Feature : identité et session auteur, badge de workflow, phase, progression, prochaine action expliquée, timeline et runs.
- Actions : statut, scaffold confiné à la Feature, validation et confirmations de retrait.

L’accueil distingue la santé des skills du **Project** de celle des points
d’entrée **globaux Claude/Codex** : chaque compteur porte sur 19 skills. Si une
copie globale est absente ou divergente, l’écran Santé le signale séparément.
L’action de réparation globale montre ce diagnostic, puis demande une seconde
confirmation avant toute sauvegarde ou tout remplacement ; elle ne remplace
jamais une personnalisation globale au premier appui.

Chaque écran principal expose l’action recommandée et `?` ouvre une aide contextuelle qui explique le but, les prérequis, les étapes et les raccourcis. Flèches naviguent, Entrée sélectionne, `/` filtre et Échap revient. Les formulaires donnent un exemple, la portée de l’écriture et la manière d’annuler. Les résultats indiquent toujours une suite.

Le parcours nominal est : `Project → Agent actif → Feature → statut Pipeline → scaffold signé → validation`. Une tentative de scaffold sans agent courant affiche le chemin de résolution au lieu de laisser l’utilisateur deviner.

« Conseil Product — organiser la suite » indique la priorité et le rôle requis. Dans une Feature, « Organiser les agents / préparer une reprise » ouvre les prompts `MAINTENANT`, les préparations parallèles en lecture seule et le prompt de reprise du Product principal. Chaque prompt affiche sa session isolée, son droit d’écriture et son livrable ; l’utilisateur peut le transmettre sans reconstruire le contexte.

L’écran **Pilote assisté** présente le mode persistant `manual|automatic` sous
des mots simples : manuel ou Pilote assisté. Avant de lancer quoi que ce soit,
il guide le parcours **Feature → assistant et version → aperçu → confirmation**.
L’aperçu rend visibles l’étape, le rôle, ce qui va être fait, les dossiers et
autorisations prévus, ainsi que les choix compatibles. Arka peut indiquer une
recommandation, mais l’utilisateur choisit et confirme toujours l’assistant et
sa version.

Les assistants apparaissent comme Claude, Codex, Kimi Platform et Z.AI Coding
Plan. Un assistant absent ou incompatible est expliqué plutôt que caché ou
remplacé. Après une réussite, la vue demande de préparer une nouvelle mission :
elle n’enchaîne pas silencieusement. Elle propose aussi de rafraîchir, annuler,
approuver ou relancer selon l’état réel. Une demande de permission structurée
peut être approuvée ; une demande opaque est refusée et demande une inspection.
Un écart de scope reste suspendu jusqu’à une décision explicite. Revenir au
mode manuel empêche la planification suivante sans annuler silencieusement la
mission active. Le cockpit n’affiche ni secrets ni PID du worker.

FastDev affiche une confirmation avant création, un badge `FASTDEV`, la phase réelle et l’itération. « Continuer le rework » ouvre le travail, sa raison, les preuves, le document et la commande. Le cockpit montre constats ouverts, corrections fermées, commit audité et validation ; diagnostic, scaffold manuel et validation restent secondaires.

La TUI appelle directement les mêmes cas d’usage que la CLI ; aucun sous-processus CLI ne bloque la boucle de rendu. Les contrôleurs Project, Feature, pipeline, santé et skills sont séparés du container. Les actions asynchrones sont sérialisées ; un test clavier pilote le parcours complet Home → Project → Feature → scaffold réel. Les mutations sensibles demandent une confirmation et `forget` ne retire que l’entrée d’index.
