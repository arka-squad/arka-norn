# Catalogue de skills

Le profil `all` installe exactement 19 skills. `arka-norn` initialise le Product principal, `arka-product` organise les rôles et la reprise, `arka-framework-maitrise` guide une session spécialisée, `arka-fastdev` exécute une phase de rework et `arka-git-steward` garde l'hygiène Git des runs multi-agents. Toutes interdisent de deviner Project, Feature, identité ou étape.

```text
arka-norn skills list --json
arka-norn skills install --target <repo> --profile all --dry-run
arka-norn skills install --target <repo> --profile all
arka-norn skills doctor --target <repo> --profile all --global --json
arka-norn skills install --target <repo> --profile all --global --dry-run
arka-norn skills install --target <repo> --profile all --global
```

Profils généraux : `core` (8), `delivery` (17), `all` (19, défaut). Profils Agent : `product` (11), `architecture` (10), `audit` (9), `dev` (10), `qa` (9). Un prompt produit par `agent prompt` nomme exactement le profil à installer.

Le catalogue versionne chaque source et son SHA-256. Le démarrage vérifie le profil `all` : les 19 rendus locaux et les 19 points d'entrée globaux doivent correspondre au checksum du catalogue, pas seulement afficher le même numéro de version. `doctor --profile all --global` liste chaque skill et chaque copie Claude/Codex concernée ; toute absence ou divergence retourne le code 3. L'installation retourne le code 5 et n'écrase rien sans `--force`; un remplacement forcé, décidé explicitement, crée un backup sous `.arka-norn/backups/skills/`.

`doctor` signale aussi, en avertissement (`orphans` en JSON, lignes `WARN` en sortie texte), toute entrée `arka-*` présente dans un emplacement de skills mais absente du catalogue. Ces copies non gérées ne peuvent pas être comparées à une référence de version : elles appartiennent peut-être à un autre produit Arka et ne sont jamais modifiées par l'installateur. Le diagnostic reste réussi (code 0) tant que les 19 skills gérées sont saines ; l'agent d'entrée doit nommer ces entrées et demander une décision utilisateur plutôt que les ignorer.

L'utilisateur déclenche le point d'entrée avec `/arka-norn` dans Claude Code ou `$arka-norn` dans Codex. Un provider sans syntaxe de skill dédiée reçoit la consigne `Utilise la skill arka-norn pour initialiser ce nouveau Project.` Le parcours et le contrat de sortie sont décrits dans [`agent-bootstrap.md`](agent-bootstrap.md).

Une installation locale écrit les rendus dans `.claude/skills/` et `.agents/skills/`. Avec `--global`, l'installateur ajoute les rendus utilisables avant l'ouverture d'un Project dans `~/.claude/skills/` et `~/.codex/skills/`. Le profil `all --global` synchronise donc les 19 skills dans les six rendus attendus par skill (trois locaux et trois globaux), sans jamais remplacer une copie personnalisée silencieusement.

Si `doctor` signale une divergence globale, commencez par le `--dry-run`, lisez la skill et le chemin signalés, puis choisissez soit de conserver cette personnalisation, soit d'autoriser explicitement le remplacement :

```text
arka-norn skills install --target <repo> --profile all --global --force
```

La sauvegarde créée permet de revenir au contenu précédent. Un agent ne doit pas choisir `--force` à la place de l’utilisateur.

`arka-fastdev` exécute exactement une action issue de `fastdev next`, dans une `session_id` obligatoire, produit un document v3 signé par l’Agent de cette session, le valide puis s’arrête. Elle couvre cadrage, livraison, audit du commit exact, corrections référencées et validation du dernier CR.

`arka-product` reste dans la session `main`, consulte `agent advise`, prépare `agent prompt` pour les rôles spécialisés et fournit `agent handoff-prompt` avant une reprise. Le Pipeline lui attribue les livrables de cadrage et de gouvernance (`concept`, `plan`, `registre_dettes`, `tache_agent`) ; l’architecture, l’audit, le développement et la QA restent délégués. Dans un Project en `automatic` — présenté comme le **Pilote assisté** — elle demande explicitement la Feature, l’assistant et la version, explique la mission puis attend la confirmation de l’aperçu. Elle peut recommander un choix, mais ne choisit pas librement à la place de l’utilisateur, ne lance pas une suite en silence et ne contourne pas une suspension. Voir [`agent-orchestration.md`](agent-orchestration.md) et [`automatic-orchestration.md`](automatic-orchestration.md).

Le skill audit impose observation directe et absence de correction silencieuse. Il produit un audit v3 pour une Feature ou, lorsqu’aucune Feature n’est concernée, l’audit Project v4 explicite avec `project_id`; il ne fabrique jamais de Feature de convenance. Le skill dev impose lecture de la spec, scope fichiers, tests, CR de dev et handoff. Le skill QA cible le dernier CR, conserve les preuves et sépare structure, verdict métier, anomalies et décision.

Le skill Concept propose, lorsque l’exploration le justifie, un brainstorming optionnel dans ChatGPT ou Claude.ai pour réserver le contexte de l’agent d’exécution. Il doit toujours fournir un prompt prérempli et un mode d’emploi ; la réponse externe est ensuite réconciliée avec les sources locales avant toute écriture. Le modèle est décrit dans [`concept-brainstorming-web.md`](concept-brainstorming-web.md).

Le catalogue, le rendu, le plan d’installation, les checksums, les backups et le
rollback sont implémentés dans les adapters TypeScript. La TUI et la CLI
consomment ce même installateur ; aucun module JS n’est chargé dynamiquement.
