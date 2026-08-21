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
| Mode d’orchestration Project | Décision persistée `manual` ou `automatic` qui règle la planification des missions ; elle est distincte de `prepare`/`execute` d’un Agent. |
| Politique d’exécution | Configuration Project déterministe des providers autorisés, de leurs capacités, permissions et priorités, sans secret ni état de processus. |
| Ordre de mission | `MissionOrder` immuable dérivé d’un Pipeline courant : scope, préconditions, capacités, permissions et résumé sans secret. |
| Exécution | `ExecutionRecord` séparé du marker, qui retrace provider choisi, états, tentatives, événements, preuves et suspensions. |
| Worker d’orchestration | Runtime Mastra local qui exécute un ordre validé ; ses métadonnées de processus restent privées et reconstructibles sous `ARKA_NORN_HOME`. |
| Skill | Procédure installable et versionnée associée à une activité. |

Relation canonique : `Project -> Product principal + Sessions Agent + Politique d’exécution + Feature -> Pipeline -> MissionOrder -> Exécution -> Document/Run`.

`Depot` est un nom historique accepté uniquement pour migrer les données v1. Il ne doit apparaître dans aucune nouvelle commande, vue, entité ou écriture persistée.
