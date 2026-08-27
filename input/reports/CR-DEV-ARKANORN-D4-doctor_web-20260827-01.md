# CR Dev — ARKANORN / D4_doctor_web

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-D4-doctor_web-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot D4 |
| Statut | LIVRÉ (E2E Web différé en fin de lots sur instruction utilisateur) |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `src/application/doctor/doctor-repair-coordinator.ts` | Créé | Orchestration inspect/preview/apply avec empreinte, TTL 5 min et verrou exclusif |
| `src/ports/inbound/for-doctor.ts` | Modifié | Port `ForDoctorRepairs`, plans et résultats bornés |
| `src/application/web/project-tracking-service.ts` | Modifié | Méthodes preview/apply, traduction `repair_plan_changed` en 409 |
| `src/application/web/legacy-orchestration-projection.ts` | Créé | Projection orchestration legacy extraite (garde 700 lignes) |
| `src/adapters/inbound/web/api-router.ts` | Modifié | Routes `/doctor/repair-preview` et `/doctor/repair-apply`, legacy supprimée |
| `src/composition/doctor-runtime.ts` / `web-runtime.ts` | Modifiés | Câblage du verrou fichier Doctor |
| `web/src/components/doctor-panel.tsx` | Créé | Parcours inspect → preview → confirmation → apply → re-inspect |
| `web/src/components/doctor-report.tsx` | Modifié | Libellés humains des actions de réparation et cibles |
| `web/src/views/settings-view.tsx` | Modifié | Intègre le panneau Doctor |
| `web/src/views/project-overview.tsx` | Modifié | Bouton « Inspect Doctor » si santé ≠ healthy |
| `tests/unit/doctor-repair-coordinator.test.ts` | Créé | Apply exact, divergence, expiration, rejeu |
| `tests/integration/security-doctor.test.ts` | Modifié | ANO-01 corrigée : skills absentes = warn, pas fail |
| `tests/web/norn-web.spec.ts` | Modifié | Contrat API, confirmation invalide, legacy 404, divergence UI, apply réussi |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| D4-01 | Séparer les trois endpoints | OUI | `GET /doctor`, `POST /doctor/repair-preview`, `POST /doctor/repair-apply` |
| D4-02 | Empreinter et expirer le dry-run | OUI | SHA-256 du plan, TTL 5 min, `DoctorRepairPlanChangedError` |
| D4-03 | Refuser un plan divergent | OUI | Recalcul sous verrou, 409 `repair_plan_changed` avec nouveau plan |
| D4-04 | Découvrir la réparation depuis la santé Project | OUI | Bouton depuis l'overview Project si attention/blocked |
| D4-05 | Relire l'état après application | OUI | Re-inspect automatique dans le panneau |
| D4-06 | ANO-01 : exit code Doctor sur home neuf | OUI | `skills.installation` manquantes = warn ; échec seulement si divergentes |

---

## Vérifications

| Check | Résultat |
|---|---|
| Typecheck | PASS |
| Build complet (tsc + web) | PASS |
| Lint ciblé | PASS |
| Taille fichiers | PASS — maximum 700 lignes |
| Langue publique | PASS |
| Tests unitaires + intégration ciblés | 20/20 passed |
| Tests Web | 23/23 passed |
| E2E Web | DIFFÉRÉ — lancé en fin de lots sur instruction utilisateur |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| Le dry-run est recalculé sous verrou avant application | Un plan affiché ne peut jamais être appliqué s'il a divergé |
| L'empreinte porte sur le plan observé, pas sur la génération | Rester stable si l'état muté entre-temps produit le même plan |
| Confirmation locale par case à cocher + empreinte serveur | Double garde sans troisième stabilisation produit |
| Skills absentes dégradées en warn | Ne pas empoisonner la santé runtime par un défaut d'installation |
| Projection legacy extraite du service | Rester sous la garde 700 lignes sans duplication |

---

## Handoff

→ Prêt pour E1 — Preview humain d'orchestration

