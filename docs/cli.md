# CLI arka-norn

`arka-norn` sans argument ouvre la TUI. Toutes les lectures acceptent `--json`; stdout contient alors uniquement une enveloppe `{schemaVersion, ok, data, errors, warnings}`.

`arka-norn guide` affiche le parcours complet sans prérequis implicite.

Pour initialiser un provider avant de choisir une Feature, l'utilisateur lui envoie `/arka-norn` dans Claude Code ou `$arka-norn` dans Codex. La skill publique vérifie le socle, résout le Project et enregistre l'identité active. Voir [`agent-bootstrap.md`](agent-bootstrap.md).

## Gestion

```text
arka-norn project list|add|import|scan|show|use|forget|reconcile
arka-norn feature list|create|import|scan|show|use|forget|reconcile
arka-norn agent list|register|show|current|use|deactivate|replace
arka-norn pipeline status|next|scaffold|validate
arka-norn skills list|install|doctor [--global]
arka-norn doctor [--repair [--apply]]
arka-norn migrate [--target <path>] [--dry-run|--apply]
```

`arka-norn skills install --target <repo> --profile core --global` installe le point d'entrée et le socle dans `~/.claude/skills/` et `~/.codex/skills/`, en plus des copies locales au Project.

`arka-norn skills doctor --target <repo> --global --json` vérifie dans un même rapport les trois artefacts locaux et les trois artefacts globaux attendus pour chaque skill. Sans `--global`, le contrôle reste strictement local.

`project scan <racine>` et `feature scan --path <racine>` reconnaissent directement un marqueur porté par la cible ; si la cible n'en porte pas, ils inspectent uniquement ses enfants immédiats. Un déplacement remplace atomiquement l'ancien chemin devenu illisible dans l'index. Une copie qui laisserait deux marqueurs actifs avec le même identifiant est refusée comme conflit d'identité.

Avant un scaffold géré, enregistrez ou sélectionnez une identité active :

```text
arka-norn agent register --project product --provider "Codex CLI" --role dev --features secure-cockpit
arka-norn agent current --project product
arka-norn pipeline next secure-cockpit
arka-norn pipeline scaffold concept --feature secure-cockpit
```

Le scaffold écrit automatiquement `schema_version: 3`, `feature_id` et `author_agent_id`. L’alias bas niveau `scaffold` exige `--agent <id>` explicitement.

Lorsque la prochaine étape est `concept`, la skill `arka-framework-concept` peut proposer un brainstorming dans ChatGPT ou Claude.ai. L’agent fournit alors le mode d’emploi et un prompt autonome prérempli ; l’utilisateur rapporte la réponse complète, qui est vérifiée avant la génération du document signé.

`forget` exige `--yes` et ne supprime jamais le dossier métier. `scaffold` et `skills install` refusent les écrasements ; `--force` est explicite et l’installateur sauvegarde les fichiers divergents.

Le parseur est commun à toutes les commandes : une option inconnue, répétée,
incompatible ou sans valeur retourne `64`. `ARKA_NORN_HOME` cible la même zone
d’index pour les commandes de gestion et `doctor`.

## Codes de sortie

| Code | Sens |
|---:|---|
| 0 | succès ou Pipeline complet |
| 2 | Pipeline incomplet, prochaine action disponible |
| 3 | état, registre ou document invalide ; agent inactif |
| 4 | ressource introuvable |
| 5 | conflit ou lock actif |
| 64 | usage invalide |
| 70 | erreur interne |

Les alias historiques `status`, `scaffold`, `validate`, `install` et `depot` restent disponibles pendant la transition.
