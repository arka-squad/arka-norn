# Catalogue de skills

Le profil `all` installe exactement 16 skills : six skills de socle et dix skills d'étape. `arka-norn`, `maitrise`, `audit`, `dev` et `recette-qa` sont obligatoires. La skill publique `arka-norn` initialise un agent sur un nouveau Project ; `arka-framework-maitrise` prend ensuite le relais pour le travail courant. Toutes deux interdisent de deviner le Project, la Feature, l'identité ou l'étape suivante.

```text
arka-norn skills list --json
arka-norn skills install --target <repo> --profile all --dry-run
arka-norn skills install --target <repo> --profile all
arka-norn skills install --target <repo> --profile core --global
arka-norn skills doctor --target <repo> --json
```

Profils : `core` (6), `delivery` (14), `all` (16, défaut). Le catalogue versionne chaque source et son SHA-256. `doctor` compare les rendus Claude/Codex attendus aux fichiers installés. Une divergence locale retourne le code 3 ; l'installation retourne le code 5 et n'écrase rien sans `--force`. En cas de remplacement forcé, un backup est créé sous `.arka-norn/backups/skills/`.

L'utilisateur déclenche le point d'entrée avec `/arka-norn` dans Claude Code ou `$arka-norn` dans Codex. Un provider sans syntaxe de skill dédiée reçoit la consigne `Utilise la skill arka-norn pour initialiser ce nouveau Project.` Le parcours et le contrat de sortie sont décrits dans [`agent-bootstrap.md`](agent-bootstrap.md).

Une installation locale écrit les rendus dans `.claude/skills/` et `.agents/skills/`. Avec `--global`, l'installateur ajoute les rendus utilisables avant l'ouverture d'un Project dans `~/.claude/skills/` et `~/.codex/skills/`.

Le skill audit impose observation directe et absence de correction silencieuse. Le skill dev impose lecture de la spec, scope fichiers, tests, CR de dev et handoff. Le skill QA cible le dernier CR, conserve les preuves et sépare structure, verdict métier, anomalies et décision.

Le skill Concept propose, lorsque l’exploration le justifie, un brainstorming optionnel dans ChatGPT ou Claude.ai pour réserver le contexte de l’agent d’exécution. Il doit toujours fournir un prompt prérempli et un mode d’emploi ; la réponse externe est ensuite réconciliée avec les sources locales avant toute écriture. Le modèle est décrit dans [`concept-brainstorming-web.md`](concept-brainstorming-web.md).

Le catalogue, le rendu, le plan d’installation, les checksums, les backups et le
rollback sont implémentés dans les adapters TypeScript. La TUI et la CLI
consomment ce même installateur ; aucun module JS n’est chargé dynamiquement.
