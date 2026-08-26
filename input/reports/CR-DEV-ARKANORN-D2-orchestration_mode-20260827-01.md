# CR Dev — ARKANORN / D2_orchestration_mode

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-D2-orchestration_mode-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot D2 |
| Statut | LIVRÉ |

---

## Fichiers livrés

| Fichier | Action | Lignes | Rôle |
|---|---|---:|---|
| `src/application/web/project-orchestration-mode-service.ts` | Créé | 99 | Politique de prérequis, bascule et continuité des runs |
| `src/application/web/contracts.ts` | Modifié | — | Contrats de projection et mutation |
| `src/adapters/inbound/web/api-router.ts` | Modifié | 272 | Endpoint PUT strict et erreurs structurées |
| `web/src/views/orchestration-mode-control.tsx` | Créé | 64 | Carte et dialogue accessibles |
| `web/src/styles/views.css` | Modifié | — | Mise en page responsive |
| `tests/integration/web-project-drafts.test.ts` | Modifié | — | Invariants métier et concurrence |
| `tests/web/norn-web.spec.ts` | Modifié | — | Contrat HTTP, clavier/mobile et absence de lancement |

---

## Exigences couvertes

| ID | Exigence | Couvert | Fichier:Ligne |
|---|---|---|---|
| D2-01 | Changement manuel/automatique depuis la fiche Project | OUI | `web/src/views/orchestration-mode-control.tsx:11` |
| D2-02 | Effets, runs actifs et prérequis visibles avant confirmation | OUI | `web/src/views/orchestration-mode-control.tsx:50` |
| D2-03 | Invariants de `ForProjects.setOrchestrationMode` conservés | OUI | `src/application/web/project-orchestration-mode-service.ts:53` |
| D2-04 | Conflit de révision et draft refusés | OUI | `tests/integration/web-project-drafts.test.ts:68` |
| D2-05 | Aucun démarrage implicite | OUI | `tests/integration/web-project-drafts.test.ts:120` |
| D2-06 | Activation refusée sans profil admissible | OUI | `src/application/web/project-orchestration-mode-service.ts:73` |

---

## Vérifications

| Check | Résultat |
|---|---|
| Build | 0 erreur |
| Typecheck / lint | 0 erreur, 0 warning |
| Tests de contrats et intégration | 4/4 passed |
| Tests Web | 22/22 passed |
| E2E Web | 3/3 passed |
| Régressions ciblées | 0 |
| Grep `any` | 0 |
| Grep `TODO/stub` | 0 |
| Taille fichiers | Maximum 700 lignes respecté |
| Langue publique | PASS |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| L'activation prépare la configuration 2.3 mais ne lance aucun preview ni run | Séparer clairement le réglage Project de l'autorisation d'une mission |
| Le prérequis D2 vérifie la présence d'un profil actif ; le contrôle exact runtime/provider reste attaché au preview E1 | Éviter un appel provider implicite lors d'un simple réglage |
| Le retour manuel désactive les nouvelles autorisations sans interrompre les runs actifs | Respect du contrat produit et reprise sûre |

---

## Problèmes détectés hors scope

—

---

## Handoff

→ Prêt pour recette-qa (REC-*)
→ Prêt pour D3 — gestion des Agents Web
