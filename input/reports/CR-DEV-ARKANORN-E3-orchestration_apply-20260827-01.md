# CR Dev — ARKANORN / E3_orchestration_apply

| Champ | Valeur |
|---|---|
| Ref | CR-DEV-ARKANORN-E3-orchestration_apply-20260827-01 |
| Date | 2026-08-27 |
| Agent | Codex |
| Spec source | `.input/spec-norn-2.3-convergence-produit.md`, Lot E3 |
| Statut | LIVRÉ (E2E Web différé en fin de lots sur instruction utilisateur) |

---

## Fichiers livrés

| Fichier | Action | Rôle |
|---|---|---|
| `src/application/web/contracts.ts` | Modifié | Méthode bridge `applyOrchestration` |
| `src/application/web/orchestration-web-projection.ts` | Modifié | Helper `runView` factorisé + `applyOrchestrationView` |
| `src/application/web/project-tracking-service.ts` | Modifié | `applyOrchestration` délègue au helper |
| `src/adapters/inbound/web/api-router.ts` | Modifié | Route `POST /orchestration-apply`, validation campagne + empreinte |
| `src/application/capabilities/capability-registry.ts` | Modifié | `orchestration.apply` exposée sur `web` |
| `web/src/bridge/http-bridge.ts` | Modifié | Appel bridge `applyOrchestration` |
| `web/src/views/live-view.tsx` | Modifié | Suivi DAG + contrôle d'application humain (empreinte, confirmation) |
| `web/src/App.tsx` | Modifié | `LiveContent` recharge le suivi après application |
| `web/src/styles/views.css` | Modifié | Styles du contrôle d'application |
| `src/application/localization/messages/en|fr/web.ts` | Modifiés | Clés `web.live.apply*` EN/FR |
| `tests/integration/web-orchestration-authorize.test.ts` | Modifié | Autorisation puis application humaine jusqu'à `completed` |
| `tests/unit/web-capability-registry.test.ts`, `web/src/generated/catalogs.test.ts` | Modifiés | `orchestration.apply` désormais sur `web` |

---

## Exigences couvertes

| ID | Exigence | Couvert | Preuve |
|---|---|---|---|
| E3-01 | Suivre les résultats réels du DAG | OUI | Carte DAG alimentée par la projection d'événements |
| E3-02 | Afficher erreurs récupérables et gates humaines | OUI | `applicationGate`, notices et `suspension` déjà projetées |
| E3-03 | Appliquer seulement si les invariants 2.3 sont satisfaits | OUI | `applyFastForward` refuse base sale, divergence, non-descendance, interdits |
| E3-04 | Conserver le chemin CLI expert comme projection équivalente | OUI | Même runtime `apply` ; CLI `orchestration apply` inchangé |

---

## Vérifications

| Check | Résultat |
|---|---|
| Typecheck | PASS |
| Build complet (tsc + web) | PASS |
| Lint ciblé | PASS |
| Taille fichiers | PASS |
| Langue publique | PASS |
| Tests intégration + unités ciblés | preview/authorize/apply + registre 3/3 + 9/9 |
| Tests Web | 23/23 passed |
| E2E Web | DIFFÉRÉ — lancé en fin de lots sur instruction utilisateur |

---

## Décisions techniques

| Décision | Raison |
|---|---|
| L'application réutilise le `apply` du runtime 2.3 | Mêmes invariants et empreinte que le CLI |
| Bouton d'application visible seulement sans interdit ni gate résiduel | Ne pas proposer une application interdite |
| Confirmation locale par empreinte + case | Double garde sans troisième stabilisation |
| `runView` factorisé | Éviter la duplication entre autorisation et application |
| Rechargement du suivi après application | Refléter l'état réel post fast-forward |

---

## Handoff

→ Feature E livrée (E1, E2, E3). Prêt pour F1 — liens de code versionnés

