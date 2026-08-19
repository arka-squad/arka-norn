# Vocabulaire canonique arka-norn

| Terme | Définition |
|---|---|
| Project | Racine de travail suivie par arka-norn. |
| Feature | Unité de livraison appartenant explicitement à un Project. |
| Pipeline | Définition ordonnée des étapes et gates d’une Feature. |
| Document | Artefact JSON versionné rattaché à une Feature et une étape. |
| Run | Exécution répétable, notamment développement ou recette QA. |
| Handoff | Transmission structurée entre agents ou humains. |
| Skill | Procédure installable et versionnée associée à une activité. |

Relation canonique : `Project -> Feature -> Pipeline -> Document/Run`.

`Depot` est un nom historique accepté uniquement pour migrer les données v1. Il ne doit apparaître dans aucune nouvelle commande, vue, entité ou écriture persistée.
