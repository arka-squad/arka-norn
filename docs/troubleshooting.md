# Dépannage

## La TUI refuse de démarrer

Elle exige stdin et stdout TTY. En CI, utiliser les sous-commandes et `--json`.

Si elle affiche « Terminal trop étroit », agrandir la fenêtre à au moins 60 colonnes. La vue se redessine automatiquement.

## Code 5

Un fichier existe, un skill diverge ou un lock est actif. Inspecter avant d’utiliser `--force`. Un lock périmé est repris automatiquement après son délai de sûreté.

## Index illisible

Exécuter `arka-norn doctor --json`, puis `arka-norn doctor --repair --json`. Vérifier le plan ; appliquer avec `--repair --apply`. Rescanner ensuite le dossier Project/Feature concerné.

## Pipeline bloqué après QA

Vérifier `pipeline status`. Une QA `fail` retourne vers `cr_dev`; une QA `pass` liée à un ancien CR est obsolète. Produire une nouvelle QA qui référence exactement le dernier `cr_dev_id`.

## Skill divergent

`arka-norn skills doctor --target <repo> --json` montre les fichiers concernés. Conserver la personnalisation ou utiliser `skills install --force`; le contenu remplacé est sauvegardé.
