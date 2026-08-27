# CR Dev — ARKANORN / install_guide_and_version_check

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-install_guide_version-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Statut | LIVRÉ |

---

## Objet

Deux ajouts jour-1 demandés par l'utilisateur :
1. Un message post-install (setup) à la charte Arka Labs (grand logo) donnant les prochaines actions pour démarrer l'UI et cadrer un premier Projet.
2. Une commande `version` qui vérifie la version publiée sur npm et propose mettre à jour / ignorer jusqu'au prochain redémarrage / ignorer complètement cette version.

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `src/application/version/version-advisory.ts` | Créé | Cœur pur : semver, bootId, décision d'advisory et skips |
| `src/adapters/outbound/filesystem/fs-version-skip-store.ts` | Créé | Persistance du choix de skip sous `$ARKA_NORN_HOME/.arka-norn/version-skip.json` (0600) |
| `src/adapters/outbound/version/npm-version-source.ts` | Créé | Lecture best-effort de la dernière version npm (timeout, jamais bloquant) |
| `src/adapters/inbound/cli/version-cli.ts` | Créé | Commande `version` : rendu à la charte + actions update/skip-reboot/skip-version/clear-skip |
| `src/adapters/inbound/cli/main-cli.ts` | Modifié | Dispatch de la commande `version` |
| `src/adapters/inbound/cli/skills-cli.ts` | Modifié | Message de fin de setup : logo Arka + prochaines étapes |
| `src/application/localization/messages/en|fr/cli-operations.ts` | Modifiés | Clés `cli.version.*` et `cli.setup.next*` EN/FR |
| `src/application/localization/messages/en|fr/help.ts` | Modifiés | `version` listée dans l'aide |
| `tests/unit/version-advisory.test.ts` | Créé | 6 tests du cœur (semver, bootId, advisory, skips) |
| `tests/integration/version-cli.test.ts` | Créé | 3 tests bout-en-bout (update, skip reboot/version, offline, args) |

---

## Comportement

- `arka-norn version` : affiche le grand logo Arka + l'état. À jour → confirmation ; mise à jour dispo → 3 choix explicites.
- `--update` : instructions de mise à jour (`npm install -g arka-norn@latest` puis `arka-norn setup`).
- `--skip-reboot` : masque jusqu'au prochain redémarrage (lié au `bootId` dérivé de l'uptime système).
- `--skip-version` : masque cette version jusqu'à une version plus récente.
- `--clear-skip` : réactive les rappels.
- Registre injoignable → statut `unknown`, sortie code 0, jamais bloquant.
- Fin de `setup` réussie (hors dry-run) : logo Arka + `web start`, `framing enter .`, rappel `/arka-norn`, `guide`.

---

## Vérifications

| Check | Résultat |
|---|---|
| Typecheck | PASS |
| Build complet | PASS |
| Lint ciblé | PASS |
| `check:max-lines` / `check:language` / `check:links` | PASS |
| Tests unités + intégration ciblés | 9/9 (feature) ; 18/18 avec cli-adapters/install |
| Environnement CI simulé (PATH sans hôte) | 11/11 |
| Suite complète | 358/0 |
| Tests Web | 23/23 |
| Release adoption gate | 20/20 |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Cœur d'advisory pur, adaptateurs I/O séparés | Testabilité déterministe et injection de `latestVersion` |
| Skip reboot lié à un `bootId` dérivé de l'uptime | « jusqu'au prochain redémarrage » sans dépendre d'un daemon |
| Fetch npm best-effort, jamais throw | Un check de version ne doit jamais casser une commande |
| Réutilisation de `renderArkaHeader` (logo TUI) | Charte cohérente entre TUI, setup et version |
| Message next-steps seulement si setup sain et non dry-run | Ne pas guider sur un état incomplet |

---

## Ajout — rappel de version stratégique (2.3.5)

| Fichier | Action | Rôle |
|---|---|---|
| `src/adapters/outbound/filesystem/fs-version-cache-store.ts` | Créé | Cache local de la dernière version npn connue (0600) |
| `src/adapters/inbound/cli/version-reminder.ts` | Créé | Ligne de rappel lue depuis le cache uniquement, refresh détaché best-effort |
| `src/adapters/inbound/cli/main-cli.ts` | Modifié | Rappel discret après `setup`/`install` et `web start|restart|foreground` |
| `tests/integration/version-reminder.test.ts` | Créé | 4 tests : sans cache, cache à jour, mise à jour, skip actif |

Le rappel n'ajoute aucune latence réseau au chemin critique : il ne lit que le cache, respecte un skip actif, et déclenche un rafraîchissement en arrière-plan non attendu (TTL 24 h) pour la prochaine invocation. Vérifié en direct sur `setup` : « Update available: 2.3.5 -> 9.9.9. Run 'arka-norn version'. »
