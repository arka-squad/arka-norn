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

## Le Pilote assisté indique qu’aucun assistant n’est prêt

Ouvrir l’aperçu de la mission et lire la raison affichée pour chaque choix. Un
assistant doit avoir une version mémorisée dans le Project, être autorisé et
être prêt localement pour les capacités demandées. Refaire explicitement le
choix, puis l’aperçu :

```text
arka-norn orchestration configure --project <project-id> --provider <claude|codex|kimi|zai> --model <version>
arka-norn orchestration preview --project <project-id> --feature <feature-id>
```

Codex et Kimi apparaissent dans les choix, mais leurs adapters ACP ne sont pas
encore autorisés à écrire automatiquement dans une Feature lorsque leurs
permissions sont opaques. Z.AI Coding Plan ne devient disponible qu’après son
activation et la fourniture locale explicite de son identifiant ; son endpoint
ne se configure pas dans le Project. Le libellé Kimi Platform utilise aujourd’hui
Kimi Code ACP, pas une connexion directe à la plateforme.

## L’aperçu a changé avant le lancement

Arka refuse volontairement une confirmation devenue obsolète si le Pipeline,
le scope, l’assistant, la version ou la politique a changé. Relire le nouvel
aperçu, puis lancer uniquement avec son empreinte :

```text
arka-norn orchestration preview --project <project-id> --feature <feature-id>
arka-norn orchestration start --project <project-id> --feature <feature-id> --provider <assistant> --model <version> --preview <nouvelle-empreinte>
```

Ne réutilisez pas une ancienne empreinte et ne cherchez pas à contourner ce
contrôle : il garantit que l’assistant reçoit exactement la mission expliquée.

## Une mission est arrêtée en sécurité

Consultez `arka-norn orchestration status --project <project-id>`. Une
permission non prévue ou opaque, une preuve absente, un scope modifié ou une
erreur provider réclament une décision explicite. Annulez ou corrigez le
contexte puis relancez ; `approve` n’est possible que pour une demande
structurée avec une opération et un chemin connus. Après une mission réussie,
préparez une nouvelle mission : le Pilote assisté n’enchaîne jamais en silence.

Une interruption Codex ou Kimi ACP nécessite une nouvelle tentative ; elle ne
reprend pas exactement la session interrompue. Les smoke tests réels ne doivent
être utilisés qu’avec des identifiants explicitement fournis dans
l’environnement local, jamais copiés dans un Project ou un registre.

## Skill divergent

Utilisez le diagnostic complet :

```text
arka-norn skills doctor --target <repo> --profile all --global --json
arka-norn skills install --target <repo> --profile all --global --dry-run
```

Il inspecte les 18 skills et indique précisément si l’écart est dans le Project,
dans `~/.claude/skills/` ou dans `~/.codex/skills/`. Un même numéro de version
ne suffit pas : le diagnostic compare le rendu attendu. Conservez la
personnalisation si elle est voulue. Sinon, après décision explicite, exécutez
`arka-norn skills install --target <repo> --profile all --global --force` ; le
contenu remplacé est sauvegardé. Ne demandez jamais à un agent de lancer
`--force` de sa propre initiative.

## Marker disparu, entrée d’index encore présente

Conservez le dossier métier tel quel et retirez uniquement le cache orphelin avec
`arka-norn project forget <id> --yes --force` ou
`arka-norn feature forget <id> --yes --force`. Cette récupération est auditée et
ne tente pas de relire le marker absent.
