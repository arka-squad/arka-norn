# CR Dev — ARKANORN / F1_versioned_links

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-F1-versioned_links-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot F1 |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `scripts/check-package-links.mjs` | Créé | Garde de paquet : refuse tout lien relatif Markdown mort dans le tarball |
| `package.json` | Modifié | `check:links` ajouté et intégré à `check` |
| `docs/norn-framing-contract-proposal.md` | Modifié | Liens vers `src/`, `tests/`, `web/` remplacés par des URL GitHub au tag `v2.3.2` |
| `docs/legacy/fr/norn-framing-contract-proposal.fr.md` | Modifié | Lien compagnon corrigé vers le fichier `.fr.md` réellement livré |
| `docs/legacy/fr/norn-framing-method-research.fr.md` | Modifié | Lien compagnon corrigé vers le fichier `.fr.md` réellement livré |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| F1-01 | Remplacer les liens relatifs vers des fichiers exclus par des liens GitHub au tag | OUI | 9 liens `src/`/`tests/`/`web/` pointent sur `blob/v2.3.2` |
| F1-02 | Ajouter un contrôle de package interdisant les liens relatifs morts | OUI | `scripts/check-package-links.mjs` + `npm run check:links` |
| F1-03 | Vérifier les ancres Markdown depuis le contenu du paquet | OUI | Le contrôle calcule l'ensemble livré via les globs `files` et résout chaque cible |

---

## Vérifications

| Check | Résultat |
|---|---|
| `check:links` | PASS — 37 fichiers Markdown livrés, tous les liens résolvent |
| `check:language` | PASS |
| `check:max-lines` | PASS |

Le contrôle a détecté et fait corriger deux liens morts réels dans les documents FR legacy avant livraison.

---

## Décisions techniques

| Décision | Raison |
|---|---|
| L'ensemble livré est calculé depuis les globs `files` de `package.json` | Ne pas dépendre d'un `npm pack` qui redéclenche le build |
| Liens vers fichiers exclus figés au tag `v2.3.2` | Cible stable et non cassable après publication |
| Ancre `#...` ignorée après résolution du fichier | Vérifier l'existence du fichier cible, pas la sémantique d'ancre interne |

---

## Handoff

→ Prêt pour F2 — Contrat de stabilité 2.3

