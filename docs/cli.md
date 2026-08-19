# CLI arka-norn

`arka-norn` sans argument ouvre la TUI. Toutes les lectures acceptent `--json`; stdout contient alors uniquement une enveloppe `{schemaVersion, ok, data, errors, warnings}`.

## Gestion

```text
arka-norn project list|add|import|scan|show|use|forget|reconcile
arka-norn feature list|create|import|scan|show|use|forget|reconcile
arka-norn pipeline status|next|scaffold|validate
arka-norn skills list|install|doctor
arka-norn doctor [--repair [--apply]]
arka-norn migrate [--target <path>] [--dry-run|--apply]
```

`forget` exige `--yes` et ne supprime jamais le dossier métier. `scaffold` et `skills install` refusent les écrasements ; `--force` est explicite et l’installateur sauvegarde les fichiers divergents.

Le parseur est commun à toutes les commandes : une option inconnue, répétée,
incompatible ou sans valeur retourne `64`. `ARKA_NORN_HOME` cible la même zone
d’index pour les commandes de gestion et `doctor`.

## Codes de sortie

| Code | Sens |
|---:|---|
| 0 | succès ou Pipeline complet |
| 2 | Pipeline incomplet, prochaine action disponible |
| 3 | état ou document invalide |
| 4 | ressource introuvable |
| 5 | conflit ou lock actif |
| 64 | usage invalide |
| 70 | erreur interne |

Les alias historiques `status`, `scaffold`, `validate`, `install` et `depot` restent disponibles pendant la transition.
