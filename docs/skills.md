# Catalogue de skills

Le profil `all` installe exactement 15 skills : cinq skills de socle, dix skills d’étape. `maitrise`, `audit`, `dev` et `recette-qa` sont obligatoires. La skill `arka-framework-maitrise` est le point d’entrée de tout nouvel agent : elle interdit de deviner le Project, la Feature, l’identité ou l’étape suivante.

```text
arka-norn skills list --json
arka-norn skills install --target <repo> --profile all --dry-run
arka-norn skills install --target <repo> --profile all
arka-norn skills doctor --target <repo> --json
```

Profils : `core` (5), `delivery` (13), `all` (15, défaut). Le catalogue versionne chaque source et son SHA-256. `doctor` compare les rendus Claude/Codex attendus aux fichiers installés. Une divergence locale retourne le code 3 ; l’installation retourne le code 5 et n’écrase rien sans `--force`. En cas de remplacement forcé, un backup est créé sous `.arka-norn/backups/skills/`.

Le skill audit impose observation directe et absence de correction silencieuse. Le skill dev impose lecture de la spec, scope fichiers, tests, CR de dev et handoff. Le skill QA cible le dernier CR, conserve les preuves et sépare structure, verdict métier, anomalies et décision.

Le skill Concept propose, lorsque l’exploration le justifie, un brainstorming optionnel dans ChatGPT ou Claude.ai pour réserver le contexte de l’agent d’exécution. Il doit toujours fournir un prompt prérempli et un mode d’emploi ; la réponse externe est ensuite réconciliée avec les sources locales avant toute écriture. Le modèle est décrit dans [`concept-brainstorming-web.md`](concept-brainstorming-web.md).

Le catalogue, le rendu, le plan d’installation, les checksums, les backups et le
rollback sont implémentés dans les adapters TypeScript. La TUI et la CLI
consomment ce même installateur ; aucun module JS n’est chargé dynamiquement.
