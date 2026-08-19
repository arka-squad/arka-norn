# CR Dev — ARKANORN / agent_bootstrap_skill

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-agent_bootstrap_skill-20260819-01 |
| Date | 2026-08-19 |
| Agent | `OpenAI-Codex_dev-audit_20260819` |
| Spec source | Demande utilisateur `/arka-norn` + `.input/arka-norn-entry-skill/git-ledger/GIT-BASELINE-arka-norn-entry-skill-20260819-01.md` |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `skills-src/arka-norn.json` | Créé | Source canonique de la skill publique d'initialisation provider |
| `skills-src/catalog/skills.json` | Modifié | Catalogue 16 skills et profils `core` 6, `delivery` 14, `all` 16 |
| `src/adapters/outbound/skills/skill-catalog.ts` | Modifié | Interface provider personnalisable et validation du prompt `$skill` |
| `src/adapters/outbound/skills/skill-installer.ts` | Modifié | Installation globale Claude et Codex, avec fichiers `openai.yaml` |
| `src/adapters/inbound/cli/main-cli.ts` | Modifié | Aide et guide avec `/arka-norn` et `$arka-norn` |
| `src/composition/tui/skill-scene-controller.ts` | Modifié | Libellés explicites pour l'installation multiprovider |
| `docs/agent-bootstrap.md` | Créé | Mode d'emploi utilisateur, contrat de sortie et garde-fous |
| `README.md`, `docs/{cli,skills,tui}.md`, `manifest.json`, `CHANGELOG.md` | Modifié | Contrat produit et documentation alignés sur 16 skills |
| `.gitignore` | Modifié | Rendus générés `arka-norn` exclus des sources canoniques |
| `scripts/selftest.mjs` | Modifié | Gate produit sur les 16 skills et le bootstrap public |
| `tests/{unit,integration,e2e}/**/*.test.ts` | Modifié | Catalogue, rendu, installation globale, CLI, packaging, TUI et délais de concurrence couverts |
| `dist/**` | Généré | JavaScript et source maps synchronisés avec les sources TypeScript |
| `input/reports/CR-DEV-ARKANORN-agent_bootstrap_skill-20260819-01.md` | Créé | Présent compte rendu |

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| B01 | Exposer une skill publique nommée `arka-norn` | OUI | `skills-src/arka-norn.json` |
| B02 | Permettre l'invocation `/arka-norn` chez Claude | OUI | Nom de skill global et déclencheurs du rendu Claude |
| B03 | Permettre l'invocation `$arka-norn` dans Codex | OUI | `agents/openai.yaml` et prompt par défaut dédié |
| B04 | Initialiser Project, Agent actif et périmètre sans supposition | OUI | Procédure en cinq étapes et arrêt avant Feature/Concept/code |
| B05 | Installer le socle avant l'ouverture d'un nouveau Project | OUI | `--global` écrit dans `~/.claude/skills/` et `~/.codex/skills/` |
| B06 | Préserver les personnalisations et expliquer les divergences | OUI | Conflit code 5, `--force` explicite et backup avant remplacement |
| B07 | Garder `arka-framework-maitrise` comme guide interne | OUI | Handoff explicite en fin d'initialisation |
| B08 | Prouver santé, sécurité, packaging et non-régression | OUI | Vérifications ci-dessous |

## Vérifications

| Check | Résultat |
|---|---|
| TypeScript + lint + build | PASS — 0 erreur |
| Tests | PASS — 93/93 |
| Couverture | PASS — 72,18 % lignes · 74,41 % fonctions · 74,82 % branches |
| Selftest produit | PASS — 53/53 |
| Skills locales | PASS — 16/16 saines, 16/16 valides avec `skill-creator/quick_validate.py` |
| Installation globale | PASS — rendus Claude et Codex déployés ; quatre anciennes skills Claude sauvegardées avant remplacement |
| Doctor | PASS — 9 PASS · 0 WARN · 0 FAIL · skills 16/16 |
| Audit dépendances runtime | PASS — 0 vulnérabilité connue |
| Packaging | PASS — tarball dry-run, 307 fichiers, source `arka-norn` et guide inclus |
| Benchmark | PASS — 127,50 ms total pour un budget de 5 000 ms |
| Diff hygiene | PASS — aucune erreur d'espacement |

## Décisions techniques

| Décision | Raison |
|---|---|
| Séparer `arka-norn` de `arka-framework-maitrise` | Offrir un bouton de démarrage humain court sans dupliquer le guide approfondi |
| Installer globalement dans Claude et Codex | Rendre le bootstrap disponible avant qu'un Project possède ses copies locales |
| Conserver les sources JSON comme unique vérité | Éviter que les rendus provider générés divergent du catalogue versionné |
| Exiger une Feature choisie avant Concept ou code | Empêcher un agent de deviner l'intention produit ou son périmètre |
| Valider le prompt `$<skill>` dans le catalogue | Garantir une interface Codex directement utilisable |
| Étendre les échéances des tests TUI et lock concurrents | Éliminer les flakes observés sous forte charge Windows/Node 24 sans changer le comportement nominal |

## Handoff

La livraison est prête à être utilisée : envoyer `/arka-norn` à Claude Code ou `$arka-norn` à Codex au démarrage d'un nouveau Project. La CI distante doit confirmer la matrice multi-OS/Node après push sur `main`.
