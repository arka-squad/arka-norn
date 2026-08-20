# Catalogue de skills

Le profil `all` installe exactement 17 skills. `arka-norn`, `arka-fastdev`, `maitrise`, `audit`, `dev` et `recette-qa` sont obligatoires. `arka-norn` initialise un agent ; `arka-framework-maitrise` route ensuite le workflow standard ou délègue une Feature FastDev à `arka-fastdev`. Toutes interdisent de deviner Project, Feature, identité ou étape.

```text
arka-norn skills list --json
arka-norn skills install --target <repo> --profile all --dry-run
arka-norn skills install --target <repo> --profile all
arka-norn skills install --target <repo> --profile core --global
arka-norn skills doctor --target <repo> --json
arka-norn skills doctor --target <repo> --global --json
```

Profils : `core` (7), `delivery` (15), `all` (17, défaut). Le catalogue versionne chaque source et son SHA-256. `doctor` compare les rendus Claude/Codex attendus aux fichiers installés ; `--global` inclut `~/.claude/skills/` et `~/.codex/skills/`. Une divergence retourne le code 3 ; l'installation retourne le code 5 et n'écrase rien sans `--force`. En cas de remplacement forcé, un backup est créé sous `.arka-norn/backups/skills/`.

L'utilisateur déclenche le point d'entrée avec `/arka-norn` dans Claude Code ou `$arka-norn` dans Codex. Un provider sans syntaxe de skill dédiée reçoit la consigne `Utilise la skill arka-norn pour initialiser ce nouveau Project.` Le parcours et le contrat de sortie sont décrits dans [`agent-bootstrap.md`](agent-bootstrap.md).

Une installation locale écrit les rendus dans `.claude/skills/` et `.agents/skills/`. Avec `--global`, l'installateur ajoute les rendus utilisables avant l'ouverture d'un Project dans `~/.claude/skills/` et `~/.codex/skills/`.

`arka-fastdev` exécute exactement une action issue de `fastdev next`, produit un document v3 signé, le valide puis s’arrête. Elle couvre cadrage, livraison, audit du commit exact, corrections référencées et validation du dernier CR.

Le skill audit impose observation directe et absence de correction silencieuse. Le skill dev impose lecture de la spec, scope fichiers, tests, CR de dev et handoff. Le skill QA cible le dernier CR, conserve les preuves et sépare structure, verdict métier, anomalies et décision.

Le skill Concept propose, lorsque l’exploration le justifie, un brainstorming optionnel dans ChatGPT ou Claude.ai pour réserver le contexte de l’agent d’exécution. Il doit toujours fournir un prompt prérempli et un mode d’emploi ; la réponse externe est ensuite réconciliée avec les sources locales avant toute écriture. Le modèle est décrit dans [`concept-brainstorming-web.md`](concept-brainstorming-web.md).

Le catalogue, le rendu, le plan d’installation, les checksums, les backups et le
rollback sont implémentés dans les adapters TypeScript. La TUI et la CLI
consomment ce même installateur ; aucun module JS n’est chargé dynamiquement.
