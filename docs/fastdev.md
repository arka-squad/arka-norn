# Reworks FastDev

FastDev est un workflow court pour une correction, un refactor ou une amélioration UX dont le périmètre est déjà borné. Une nouvelle architecture, une migration critique ou un besoin incertain reste en pipeline standard.

```text
cadrage_rework → cr_dev → audit_rework → [cr_dev correctif] → validation_fastdev
```

Le second CR n’existe que si l’audit demande des corrections ou si la validation vaut `fail`/`partial`. Le même Agent actif et autorisé peut exécuter toutes les phases, mais chaque document reste séparé, signé et fondé sur des preuves.

## Démarrer

```bash
arka-norn workflow show fastdev
arka-norn fastdev start "Corriger la navigation" --project product
arka-norn fastdev next <feature> --session <session-id> --json
```

Pour une Feature vide existante :

```bash
arka-norn feature set-workflow <feature> --workflow fastdev
```

Le choix devient immuable au premier document reconnu.

## Boucle contrôlée

- `audit_rework: pass` ouvre directement la validation.
- `corrections_requises` exige un CR livré qui dépend de l’audit et ferme chaque constat `corriger` via `corrections_apportees`.
- Une correction partielle est refusée.
- Une validation ancienne devient obsolète après un nouveau CR.
- Seul `validation_fastdev: pass` visant le dernier CR termine le workflow.

La commande `fastdev next` donne phase, itération, prérequis, raison, instructions, livrable et commande exacte. Elle propage `--session` jusque dans le scaffold afin que `author_agent_id` soit celui du rôle spécialisé, pas celui du Product `main`. La skill `$arka-fastdev` exécute une seule de ces actions puis valide le document produit.

Pour une Feature neuve au périmètre connu (et non un simple rework), préférez [Essentiel](essentiel.md), le workflow par défaut ; les schémas d'audit et de validation sont partagés entre les deux pipelines.
