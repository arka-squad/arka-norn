# Catalogue de skills

Le profil `all` installe exactement 14 skills : quatre skills de socle, dix skills d’étape. `audit`, `dev` et `recette-qa` sont obligatoires.

```text
arka-norn skills list --json
arka-norn skills install --target <repo> --profile all --dry-run
arka-norn skills install --target <repo> --profile all
arka-norn skills doctor --target <repo> --json
```

Profils : `core` (4), `delivery` (12), `all` (14, défaut). Le catalogue versionne chaque source et son SHA-256. `doctor` compare les rendus Claude/Codex attendus aux fichiers installés. Une divergence locale retourne le code 3 ; l’installation retourne le code 5 et n’écrase rien sans `--force`. En cas de remplacement forcé, un backup est créé sous `.arka-norn/backups/skills/`.

Le skill audit impose observation directe et absence de correction silencieuse. Le skill dev impose lecture de la spec, scope fichiers, tests, CR de dev et handoff. Le skill QA cible le dernier CR, conserve les preuves et sépare structure, verdict métier, anomalies et décision.
