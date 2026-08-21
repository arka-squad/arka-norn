# Catalogue de skills

Le profil `all` installe exactement 18 skills. `arka-norn` initialise le Product principal, `arka-product` organise les rôles et la reprise, `arka-framework-maitrise` guide une session spécialisée et `arka-fastdev` exécute une phase de rework. Toutes interdisent de deviner Project, Feature, identité ou étape.

```text
arka-norn skills list --json
arka-norn skills install --target <repo> --profile all --dry-run
arka-norn skills install --target <repo> --profile all
arka-norn skills install --target <repo> --profile core --global
arka-norn skills doctor --target <repo> --json
arka-norn skills doctor --target <repo> --global --json
```

Profils généraux : `core` (8), `delivery` (16), `all` (18, défaut). Profils Agent : `product` (11), `architecture` (10), `audit` (9), `dev` (9), `qa` (8). Un prompt produit par `agent prompt` nomme exactement le profil à installer.

Le catalogue versionne chaque source et son SHA-256. `doctor` considère le Project prêt si les 8 skills `core` sont saines et qu’aucune divergence n’existe ; une seule skill core absente est un échec avec le code 3. Les skills de rôles encore absentes restent des avertissements optionnels. Toute divergence retourne aussi le code 3. L'installation retourne le code 5 et n'écrase rien sans `--force`; un remplacement forcé crée un backup sous `.arka-norn/backups/skills/`.

L'utilisateur déclenche le point d'entrée avec `/arka-norn` dans Claude Code ou `$arka-norn` dans Codex. Un provider sans syntaxe de skill dédiée reçoit la consigne `Utilise la skill arka-norn pour initialiser ce nouveau Project.` Le parcours et le contrat de sortie sont décrits dans [`agent-bootstrap.md`](agent-bootstrap.md).

Une installation locale écrit les rendus dans `.claude/skills/` et `.agents/skills/`. Avec `--global`, l'installateur ajoute les rendus utilisables avant l'ouverture d'un Project dans `~/.claude/skills/` et `~/.codex/skills/`.

`arka-fastdev` exécute exactement une action issue de `fastdev next`, dans une `session_id` obligatoire, produit un document v3 signé par l’Agent de cette session, le valide puis s’arrête. Elle couvre cadrage, livraison, audit du commit exact, corrections référencées et validation du dernier CR.

`arka-product` reste dans la session `main`, consulte `agent advise`, prépare `agent prompt` pour les rôles spécialisés et fournit `agent handoff-prompt` avant une reprise. Dans un Project en `automatic`, elle présente le statut et les commandes d’orchestration, sans choisir librement un provider ni contourner une suspension. Elle n’exécute pas les livrables spécialisés. Voir [`agent-orchestration.md`](agent-orchestration.md) et [`automatic-orchestration.md`](automatic-orchestration.md).

Le skill audit impose observation directe et absence de correction silencieuse. Il produit un audit v3 pour une Feature ou, lorsqu’aucune Feature n’est concernée, l’audit Project v4 explicite avec `project_id`; il ne fabrique jamais de Feature de convenance. Le skill dev impose lecture de la spec, scope fichiers, tests, CR de dev et handoff. Le skill QA cible le dernier CR, conserve les preuves et sépare structure, verdict métier, anomalies et décision.

Le skill Concept propose, lorsque l’exploration le justifie, un brainstorming optionnel dans ChatGPT ou Claude.ai pour réserver le contexte de l’agent d’exécution. Il doit toujours fournir un prompt prérempli et un mode d’emploi ; la réponse externe est ensuite réconciliée avec les sources locales avant toute écriture. Le modèle est décrit dans [`concept-brainstorming-web.md`](concept-brainstorming-web.md).

Le catalogue, le rendu, le plan d’installation, les checksums, les backups et le
rollback sont implémentés dans les adapters TypeScript. La TUI et la CLI
consomment ce même installateur ; aucun module JS n’est chargé dynamiquement.
