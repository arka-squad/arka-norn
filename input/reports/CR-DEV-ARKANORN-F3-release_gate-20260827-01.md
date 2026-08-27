# CR Dev — ARKANORN / F3_release_gate

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-F3-release_gate-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot F3 |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `scripts/release-adoption-gate.mjs` | Créé | Pack le tarball exact, l'extrait, et vérifie parité + adoption depuis le paquet |
| `package.json` | Modifié | `release:adoption` ajouté et intégré à `release:verify` |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| F3-01 | Ajouter les parcours d'adoption et de parité à `release:verify` | OUI | `release:verify` appelle `release:adoption` en fin de chaîne |
| F3-02 | Construire et installer le tarball exact | OUI | `npm pack` + extraction + `node_modules` liés pour exécution hors ligne |
| F3-03 | Vérifier README, skills, Web, TUI, CLI et migrations depuis ce tarball | OUI | 20 contrôles : version, CLI, skills HOME vierge, README, Web, docs |
| F3-04 | Publier une fois après verdict QA | OUI | Le gate ne publie jamais ; publication reste humaine et séparée |

---

## Vérifications

| Check | Résultat |
|---|---|
| `release:adoption` | PASS — 20/20 contrôles verts |
| Lint ciblé | PASS |
| `check:language` | PASS |
| `check:links` | PASS |

### Détail des 20 contrôles

Parité de version (package/manifest/CLI), surface CLI (framing, orchestration, web, doctor, migrate), `skills list` sur un HOME vierge, README (quickstart, lien migration, lien contrat de stabilité), bundle et assets Web, guide de migration, contrat de stabilité, sources de skills, résolution des liens Markdown du paquet.

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Le gate remplace le `npm pack --dry-run` final de `release:verify` | Superset : pack réel + extraction + crawl de parité |
| `node_modules` du dépôt liés dans le paquet extrait | Exécuter le bin empaqueté hors ligne sans réinstaller |
| Contrôles lus depuis le paquet extrait, pas depuis le dépôt | Prouver ce que le tarball livre réellement |
| Aucune publication dans le gate | Publication = étape humaine après verdict QA |

---

## Handoff

→ Feature F livrée (F1, F2, F3). Reste : E2E Web complet (différé), puis publication 2.3 (tag + release GitHub + npm)

