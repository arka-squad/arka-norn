# ADR-004 — Contrat de sortie CLI

- Statut : accepté
- Date : 2026-08-19

## Contexte

Une CLI de gestion doit être lisible par un humain et fiable dans les scripts, sans déduire l’état métier à partir de texte libre.

## Décision

La sortie humaine est concise par défaut. `--json` émet uniquement sur stdout l’enveloppe versionnée suivante :

```json
{"schemaVersion":1,"ok":true,"data":{},"errors":[],"warnings":[]}
```

Les diagnostics techniques vont sur stderr. Codes stables : `0` succès/complet, `2` incomplet actionnable, `3` état invalide, `4` introuvable, `5` conflit/verrou, `64` usage, `70` erreur interne. Une QA métier non passante ne retourne jamais `0`.

## Conséquences

CLI et TUI appellent les mêmes use-cases. Les presenters seuls choisissent texte ou JSON. Toute évolution incompatible de l’enveloppe incrémente `schemaVersion`.
