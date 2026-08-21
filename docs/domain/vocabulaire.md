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
| Product principal | Premier Agent stable du Project, responsable de l’organisation, des décisions utilisateur et des passations. Il produit dans `main` les livrables de cadrage/gouvernance attribués par le Pipeline et ne remplace pas les rôles architecture, audit, développement ou QA. |
| Mode d’orchestration Project | Décision persistée `manual` ou `automatic` qui règle la planification des missions ; `automatic` est présenté à l’utilisateur comme le **Pilote assisté** et reste distinct de `prepare`/`execute` d’un Agent. |
| Politique d’exécution | Configuration Project v2 des assistants autorisés, de leurs modèles explicitement choisis, capacités, permissions et priorités, sans secret ni état de processus. |
| Cible d’exécution | Couple immuable assistant/adapter/modèle confirmé par l’utilisateur pour une mission. Les assistants visibles sont Claude, Codex, Kimi Platform et Z.AI Coding Plan. |
| Aperçu de mission | Explication non mutante de la prochaine mission : Feature, étape, rôle, périmètre, capacités, permissions, candidats et empreinte de confirmation. |
| Ordre de mission | `MissionOrder` immuable dérivé d’un Pipeline courant : scope, préconditions, capacités, permissions et résumé sans secret. |
| Exécution | `ExecutionRecord` v2 séparé du marker, qui retrace la cible choisie, états, tentatives, événements, preuves et suspensions. |
| Worker d’orchestration | Runtime Mastra local qui exécute un ordre validé ; ses métadonnées de processus restent privées et reconstructibles sous `ARKA_NORN_HOME`. |
| Skill | Procédure installable et versionnée associée à une activité. |

Relation canonique : `Project -> Product principal + Sessions Agent + Politique d’exécution + Feature -> Pipeline -> Aperçu de mission -> MissionOrder -> Exécution -> Document/Run`.

`Depot` est un nom historique accepté uniquement pour migrer les données v1. Il ne doit apparaître dans aucune nouvelle commande, vue, entité ou écriture persistée.
