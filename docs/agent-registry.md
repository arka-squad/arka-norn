# Registre des agents

Chaque Project porte une source de vérité portable :

```text
<project-root>/.arka-norn/agents.json
```

Une entrée relie une identité humaine, son provider, son rôle et son périmètre. L’identifiant est lisible et stable : `Provider_role_YYYYMMDD`, avec suffixe `_02` à `_99` en cas de collision le même jour. Ce n’est ni un UUID opaque ni un nom de session réutilisable.

## Périmètre

Le scope contient toujours le `projectId` et peut borner :

- les `featureIds` ;
- les chemins relatifs au Project ;
- les responsabilités confiées.

Une liste Features/chemins vide signifie tout le Project. Les chemins absolus et traversals `..` sont refusés.

## Cycle de vie

- `register` crée une identité active et la sélectionne localement ;
- `use` sélectionne une identité active existante ;
- `deactivate` positionne `active: false` et interdit toute nouvelle production ;
- `replace` crée le successeur, désactive l’ancien et écrit les deux relations `replacesAgentId` / `replacedByAgentId`.

Le registre est écrit atomiquement sous lock. La sélection courante reste locale dans `~/.arka-norn/context/agents.json` : elle ne modifie pas l’identité partagée du Project.

## Documents produit

Tout nouveau scaffold produit un document `schema_version: 3` avec :

```json
{
  "feature_id": "ma-feature",
  "author_agent_id": "Codex-CLI_dev_20260819"
}
```

Les documents v2 restent lisibles pour assurer la compatibilité. Une v3 sans `author_agent_id`, avec un identifiant mal formé ou produite par un agent inactif via la CLI est refusée. Le remplacement ne réécrit jamais les documents historiques.

## Commandes

```text
arka-norn agent list --project <project-id> --active
arka-norn agent register --project <project-id> --provider "Codex CLI" --role dev
arka-norn agent current --project <project-id>
arka-norn agent use <agent-id> --project <project-id>
arka-norn agent replace <ancien-id> --project <project-id> --provider "Claude Code" --role dev
arka-norn agent deactivate <agent-id> --project <project-id> --yes
```

La TUI expose les mêmes transitions dans Project → Gérer les agents.
