# CR Dev — ARKANORN / F2_stability_contract

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-F2-stability_contract-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot F2 |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `docs/stability-2.3.md` | Créé | Contrat de stabilité : vocabulaire Project -> Plan -> Feature -> Lot -> Run, statut legacy, notes de migration factuelles |
| `README.md` | Modifié | Ajout du contrat de stabilité à l'index documentaire |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| F2-01 | Documenter Project -> Plan -> Feature -> Lot -> Run comme métaphore stable | OUI | Section « Stable concepts » de `stability-2.3.md` |
| F2-02 | Expliquer le legacy sans lui donner le statut de chemin normal | OUI | Section « Legacy status » : inspection/import seulement, jamais repris |
| F2-03 | Remplacer « replaced » par des notes de migration factuelles | OUI | Section « Migration notes » en trois changements non destructifs |
| F2-04 | Ne pas introduire de nouveau nom de concept public | OUI | Seuls Project, Plan, Feature, Lot, Run — tous préexistants |

---

## Vérifications

| Check | Résultat |
|---|---|
| `check:links` | PASS — 38 fichiers Markdown livrés, tous les liens résolvent |
| `check:language` | PASS |
| `check:max-lines` | PASS |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Un document dédié plutôt qu'une section README | Référence stable et citable pour lever une ambiguïté de terme |
| « replaced » conservé pour l'état de supersession documentaire | C'est un état produit stable et non une affirmation de migration |
| Notes de migration formulées en changements de comportement | Éviter le vocabulaire « remplacé » pour le moteur, préférer le factuel |

---

## Handoff

→ Prêt pour F3 — Release gate unique

