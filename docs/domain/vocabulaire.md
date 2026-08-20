# Vocabulaire canonique arka-norn

| Terme | Définition |
|---|---|
| Project | Racine de travail suivie par arka-norn. |
| Feature | Unité de livraison appartenant explicitement à un Project. |
| Pipeline | Définition ordonnée des étapes et gates d’une Feature. |
| Document | Artefact JSON versionné rattaché à une Feature et une étape. |
| Run | Exécution répétable, notamment développement ou recette QA. |
| Handoff | Transmission structurée entre agents ou humains. |
| Agent | Identité humaine d’un provider et d’un rôle, bornée par un scope Project/Feature et un état actif. |
| Session Agent | Contexte privé d’un provider portant une sélection Agent par Project ; `main` est réservé au Product principal. |
| Product principal | Premier Agent stable du Project, responsable de l’organisation, des décisions utilisateur et des passations, sans exécuter les rôles spécialisés. |
| Skill | Procédure installable et versionnée associée à une activité. |

Relation canonique : `Project -> Product principal + Sessions Agent + Feature -> Pipeline -> Document/Run`.

`Depot` est un nom historique accepté uniquement pour migrer les données v1. Il ne doit apparaître dans aucune nouvelle commande, vue, entité ou écriture persistée.
